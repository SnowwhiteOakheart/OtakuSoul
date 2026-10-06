//! Tools the chat model may use (date/time, calculator, web search). Works with every provider
//! and local model through a small text protocol instead of native tool calling: the model
//! writes `<tool_call>{"name": …, "arguments": {…}}</tool_call>`, the stream hides it, the app
//! runs the tool and asks again with the result (`TOOL_RESULT_PREFIX`).

use serde::Deserialize;

/// Tool rounds per reply; afterwards the model has to answer.
pub const MAX_TOOL_ROUNDS: usize = 3;
pub const TOOL_RESULT_PREFIX: &str = "[TOOL RESULT]";
const OPEN_TAG: &str = "<tool_call>";
const CLOSE_TAG: &str = "</tool_call>";

pub const TOOL_INSTRUCTIONS: &str = "# Tools
You can use tools when the conversation needs something you cannot know yourself: the current date or time, exact arithmetic, or current information from the web.
To use a tool, write exactly this and nothing else in that part of your reply:
<tool_call>{\"name\": \"TOOL\", \"arguments\": {…}}</tool_call>
Available tools:
- current_datetime – arguments {} – the user's current local date, weekday and time.
- calculate – arguments {\"expression\": \"…\"} – exact arithmetic with + - * / % ^, parentheses, sqrt, abs, round, pi and e.
- web_search – arguments {\"query\": \"…\"} – searches the web and returns short results.
The result comes back in a message starting with [TOOL RESULT]. Then continue your reply in character and use the result naturally.
Use a tool only when it is really needed, never invent results, and never mention this protocol.";

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct ToolCall {
    pub name: String,
    #[serde(default)]
    pub arguments: serde_json::Value,
}

/// Hides `<tool_call>…</tool_call>` from the streamed text and collects their contents. Tags
/// split across chunks are held back until it is clear whether they are one.
#[derive(Default)]
pub struct ToolCallFilter {
    pending: String,
    in_call: bool,
    current: String,
    calls: Vec<String>,
}

impl ToolCallFilter {
    /// Returns the text that can be shown now.
    pub fn push(&mut self, content: &str) -> String {
        self.pending.push_str(content);
        let mut visible = String::new();
        loop {
            let tag = if self.in_call { CLOSE_TAG } else { OPEN_TAG };
            if let Some(position) = self.pending.find(tag) {
                let before: String = self.pending.drain(..position).collect();
                self.pending.drain(..tag.len());
                if self.in_call {
                    self.current.push_str(&before);
                    self.calls.push(std::mem::take(&mut self.current));
                } else {
                    visible.push_str(&before);
                }
                self.in_call = !self.in_call;
                continue;
            }
            let keep = (1..tag.len())
                .rev()
                .find(|length| self.pending.ends_with(&tag[..*length]))
                .unwrap_or(0);
            let ready: String = self.pending.drain(..self.pending.len() - keep).collect();
            if self.in_call {
                self.current.push_str(&ready);
            } else {
                visible.push_str(&ready);
            }
            return visible;
        }
    }

    /// The rest of the text and the collected calls. An unclosed call still counts as one.
    pub fn finish(mut self) -> (String, Vec<String>) {
        let rest = std::mem::take(&mut self.pending);
        if self.in_call {
            self.current.push_str(&rest);
            self.calls.push(std::mem::take(&mut self.current));
            (String::new(), self.calls)
        } else {
            (rest, self.calls)
        }
    }
}

/// Reads a call; models sometimes wrap the JSON in a code fence or add text around it.
pub fn parse_call(raw: &str) -> Option<ToolCall> {
    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    serde_json::from_str(raw.get(start..=end)?).ok()
}

/// Runs one tool; failures become a readable result for the model, not an error of the reply.
pub async fn run(call: &ToolCall) -> String {
    let argument = |key: &str| {
        call.arguments
            .get(key)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string()
    };
    match call.name.as_str() {
        "current_datetime" => current_datetime(),
        "calculate" => match calculate(&argument("expression")) {
            Ok(value) => format_number(value),
            Err(error) => format!("Error: {error}"),
        },
        "web_search" => {
            let query = argument("query");
            if query.is_empty() {
                return "Error: empty query".into();
            }
            match crate::modules::companion_tools::CompanionTools::web_search(&query).await {
                Ok(result) => result.chars().take(2000).collect(),
                Err(error) => format!("Error: {error}"),
            }
        }
        other => format!("Error: unknown tool '{other}'"),
    }
}

fn current_datetime() -> String {
    let now = chrono::Local::now();
    now.format("%A, %Y-%m-%d %H:%M (UTC%:z)").to_string()
}

fn format_number(value: f64) -> String {
    if value.fract() == 0.0 && value.abs() < 1e15 {
        format!("{}", value as i64)
    } else {
        let text = format!("{value:.10}");
        text.trim_end_matches('0').trim_end_matches('.').to_string()
    }
}

/// A small, safe arithmetic evaluator (no code execution).
pub fn calculate(expression: &str) -> Result<f64, String> {
    if expression.is_empty() || expression.len() > 200 {
        return Err("expression empty or too long".into());
    }
    let tokens: Vec<char> = expression.chars().filter(|c| !c.is_whitespace()).collect();
    let mut parser = Calc { tokens, pos: 0 };
    let value = parser.sum()?;
    if parser.pos != parser.tokens.len() {
        return Err(format!("unexpected '{}'", parser.tokens[parser.pos]));
    }
    if value.is_finite() {
        Ok(value)
    } else {
        Err("result is not a finite number".into())
    }
}

struct Calc {
    tokens: Vec<char>,
    pos: usize,
}

impl Calc {
    fn peek(&self) -> Option<char> {
        self.tokens.get(self.pos).copied()
    }

    fn sum(&mut self) -> Result<f64, String> {
        let mut value = self.product()?;
        while let Some(op @ ('+' | '-')) = self.peek() {
            self.pos += 1;
            let rhs = self.product()?;
            value = if op == '+' { value + rhs } else { value - rhs };
        }
        Ok(value)
    }

    fn product(&mut self) -> Result<f64, String> {
        let mut value = self.power()?;
        while let Some(op @ ('*' | '/' | '%' | '×' | '÷')) = self.peek() {
            self.pos += 1;
            let rhs = self.power()?;
            value = match op {
                '*' | '×' => value * rhs,
                '%' => value % rhs,
                _ if rhs == 0.0 => return Err("division by zero".into()),
                _ => value / rhs,
            };
        }
        Ok(value)
    }

    fn power(&mut self) -> Result<f64, String> {
        let base = self.unary()?;
        if self.peek() == Some('^') {
            self.pos += 1;
            let exponent = self.power()?;
            return Ok(base.powf(exponent));
        }
        Ok(base)
    }

    fn unary(&mut self) -> Result<f64, String> {
        match self.peek() {
            Some('-') => {
                self.pos += 1;
                Ok(-self.unary()?)
            }
            Some('+') => {
                self.pos += 1;
                self.unary()
            }
            _ => self.atom(),
        }
    }

    fn atom(&mut self) -> Result<f64, String> {
        match self.peek() {
            Some('(') => {
                self.pos += 1;
                let value = self.sum()?;
                if self.peek() != Some(')') {
                    return Err("missing ')'".into());
                }
                self.pos += 1;
                Ok(value)
            }
            Some(c) if c.is_ascii_digit() || c == '.' || c == ',' => {
                let start = self.pos;
                while self
                    .peek()
                    .is_some_and(|c| c.is_ascii_digit() || c == '.' || c == ',')
                {
                    self.pos += 1;
                }
                let text: String = self.tokens[start..self.pos].iter().collect();
                text.replace(',', ".")
                    .parse()
                    .map_err(|_| format!("bad number '{text}'"))
            }
            Some(c) if c.is_ascii_alphabetic() => {
                let start = self.pos;
                while self.peek().is_some_and(|c| c.is_ascii_alphabetic()) {
                    self.pos += 1;
                }
                let name: String = self.tokens[start..self.pos].iter().collect();
                match name.to_ascii_lowercase().as_str() {
                    "pi" => Ok(std::f64::consts::PI),
                    "e" => Ok(std::f64::consts::E),
                    function @ ("sqrt" | "abs" | "round") => {
                        let value = self.atom()?;
                        Ok(match function {
                            "sqrt" if value < 0.0 => return Err("sqrt of a negative number".into()),
                            "sqrt" => value.sqrt(),
                            "abs" => value.abs(),
                            _ => value.round(),
                        })
                    }
                    _ => Err(format!("unknown name '{name}'")),
                }
            }
            Some(c) => Err(format!("unexpected '{c}'")),
            None => Err("unexpected end".into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hides_tool_calls_split_across_chunks() {
        let mut filter = ToolCallFilter::default();
        let mut shown = String::new();
        for chunk in [
            "Moment… <tool",
            "_call>{\"name\": \"calc",
            "ulate\"}</tool_",
            "call> danach",
        ] {
            shown.push_str(&filter.push(chunk));
        }
        let (rest, calls) = filter.finish();
        shown.push_str(&rest);
        assert_eq!(shown, "Moment…  danach");
        assert_eq!(calls, vec!["{\"name\": \"calculate\"}".to_string()]);
        assert_eq!(parse_call(&calls[0]).unwrap().name, "calculate");
    }

    #[test]
    fn keeps_text_that_only_looks_like_a_tag() {
        let mut filter = ToolCallFilter::default();
        let mut shown = filter.push("a <tool kit> b <");
        let (rest, calls) = filter.finish();
        shown.push_str(&rest);
        assert_eq!(shown, "a <tool kit> b <");
        assert!(calls.is_empty());
    }

    #[test]
    fn reads_calls_with_fences_and_arguments() {
        let call = parse_call(
            "```json\n{\"name\":\"web_search\",\"arguments\":{\"query\":\"Kyoto\"}}\n```",
        )
        .unwrap();
        assert_eq!(call.name, "web_search");
        assert_eq!(call.arguments["query"], "Kyoto");
        assert!(parse_call("kein json").is_none());
    }

    #[test]
    fn calculates_safely() {
        assert_eq!(calculate("2 + 3 * 4").unwrap(), 14.0);
        assert_eq!(calculate("(2+3)*4").unwrap(), 20.0);
        assert_eq!(calculate("2^3^2").unwrap(), 512.0);
        assert_eq!(calculate("-sqrt(16) + abs(-2)").unwrap(), -2.0);
        assert_eq!(calculate("1,5 * 2").unwrap(), 3.0);
        assert!(calculate("1/0").is_err());
        assert!(calculate("rm -rf").is_err());
        assert!(calculate("2 +").is_err());
        assert_eq!(format_number(0.1 + 0.2), "0.3");
        assert_eq!(format_number(42.0), "42");
    }

    #[tokio::test]
    async fn runs_local_tools() {
        let calc = ToolCall {
            name: "calculate".into(),
            arguments: serde_json::json!({ "expression": "19 * 21" }),
        };
        assert_eq!(run(&calc).await, "399");
        let unknown = ToolCall {
            name: "format_disk".into(),
            arguments: serde_json::json!({}),
        };
        assert!(run(&unknown).await.starts_with("Error"));
    }
}
