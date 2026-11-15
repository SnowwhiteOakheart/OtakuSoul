//! Gemeinsame SSE- und Think-Tag-Verarbeitung ohne GUI- oder HTTP-Abhängigkeiten.
//! Aus der Tauri-Inferenz herausgelöst; Requestbau und Abbruch bleiben im Adapter.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WireFormat {
    OpenAi,
    Anthropic,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ParsedDelta {
    pub text: Option<String>,
    pub thought: Option<String>,
    pub is_done: bool,
}

pub fn parse_sse_line(line: &str, format: WireFormat) -> ParsedDelta {
    match format {
        WireFormat::Anthropic => parse_anthropic_sse(line),
        WireFormat::OpenAi => parse_openai_sse(line),
    }
}

/// Dekodiert UTF-8 erst an vollständigen Zeilen, auch bei geteilten Mehrbyte-Zeichen.
#[derive(Default)]
pub struct SseLines {
    bytes: Vec<u8>,
}

impl SseLines {
    pub fn push(&mut self, chunk: &[u8]) -> Result<Vec<String>, String> {
        self.bytes.extend_from_slice(chunk);
        let mut lines = Vec::new();
        while let Some(line) = self.next_line()? {
            lines.push(line);
        }
        Ok(lines)
    }

    fn next_line(&mut self) -> Result<Option<String>, String> {
        let Some(end) = self.bytes.iter().position(|byte| *byte == b'\n') else {
            return Ok(None);
        };
        let line = self.bytes.drain(..=end).collect::<Vec<_>>();
        String::from_utf8(line)
            .map(Some)
            .map_err(|error| error.to_string())
    }

    pub fn finish(&mut self) -> Result<Option<String>, String> {
        if self.bytes.is_empty() {
            return Ok(None);
        }
        String::from_utf8(std::mem::take(&mut self.bytes))
            .map(Some)
            .map_err(|error| error.to_string())
    }
}

fn parse_anthropic_sse(line: &str) -> ParsedDelta {
    let trimmed = line.trim();
    if !trimmed.starts_with("data:") {
        return ParsedDelta::default();
    }

    let json_str = trimmed["data:".len()..].trim();
    if json_str.is_empty() || json_str == "[DONE]" {
        return ParsedDelta {
            text: None,
            thought: None,
            is_done: json_str == "[DONE]",
        };
    }

    if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
        let event_type = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if event_type == "content_block_delta" {
            if let Some(delta) = v.get("delta") {
                let delta_type = delta.get("type").and_then(|t| t.as_str()).unwrap_or("");
                if delta_type == "text_delta" {
                    if let Some(t) = delta.get("text").and_then(|s| s.as_str()) {
                        return ParsedDelta {
                            text: Some(t.to_string()),
                            thought: None,
                            is_done: false,
                        };
                    }
                } else if delta_type == "thinking_delta"
                    && let Some(th) = delta.get("thinking").and_then(|s| s.as_str())
                {
                    return ParsedDelta {
                        text: None,
                        thought: Some(th.to_string()),
                        is_done: false,
                    };
                }
            }
        } else if event_type == "message_stop" {
            return ParsedDelta {
                text: None,
                thought: None,
                is_done: true,
            };
        }
    }

    ParsedDelta::default()
}

fn parse_openai_sse(line: &str) -> ParsedDelta {
    let trimmed = line.trim();
    if !trimmed.starts_with("data:") {
        return ParsedDelta::default();
    }

    let json_str = trimmed["data:".len()..].trim();
    if json_str == "[DONE]" {
        return ParsedDelta {
            text: None,
            thought: None,
            is_done: true,
        };
    }

    if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str)
        && let Some(choices) = v.get("choices").and_then(|c| c.as_array())
        && let Some(first) = choices.first()
    {
        let mut delta_res = ParsedDelta::default();
        if let Some(delta) = first.get("delta") {
            if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                delta_res.text = Some(content.to_string());
            }
            if let Some(thought) = delta
                .get("reasoning_content")
                .or_else(|| delta.get("thought"))
                .and_then(|th| th.as_str())
            {
                delta_res.thought = Some(thought.to_string());
            }
        }
        if let Some(finish) = first.get("finish_reason").and_then(|f| f.as_str())
            && !finish.is_empty()
        {
            delta_res.is_done = true;
        }
        return delta_res;
    }

    ParsedDelta::default()
}
#[derive(Default)]
pub struct ThinkTagFilter {
    pending: String,
    in_think_block: bool,
}

impl ThinkTagFilter {
    /// Returns `(is_thought, text)` segments that can be emitted immediately.
    pub fn push(&mut self, content: &str) -> Vec<(bool, String)> {
        self.pending.push_str(content);
        let mut segments = Vec::new();
        loop {
            let tag = if self.in_think_block {
                "</think>"
            } else {
                "<think>"
            };
            if let Some(position) = self.pending.find(tag) {
                if position > 0 {
                    segments.push((self.in_think_block, self.pending[..position].to_string()));
                }
                self.pending.drain(..position + tag.len());
                self.in_think_block = !self.in_think_block;
                continue;
            }

            let keep = (1..tag.len())
                .rev()
                .find(|length| self.pending.ends_with(&tag[..*length]))
                .unwrap_or(0);
            let emit_len = self.pending.len() - keep;
            if emit_len > 0 {
                segments.push((self.in_think_block, self.pending[..emit_len].to_string()));
                self.pending.drain(..emit_len);
            }
            return segments;
        }
    }

    pub fn finish(&mut self) -> Option<(bool, String)> {
        if self.pending.is_empty() {
            None
        } else {
            Some((self.in_think_block, std::mem::take(&mut self.pending)))
        }
    }
}

/// Antwortdecoder. Segmente sind `(is_thought, text)`, wie im Inferenz-Callback.
pub struct StreamDecoder {
    format: WireFormat,
    lines: SseLines,
    filter: ThinkTagFilter,
    done: bool,
    finished: bool,
}

impl StreamDecoder {
    pub fn new(format: WireFormat) -> Self {
        Self {
            format,
            lines: SseLines::default(),
            filter: ThinkTagFilter::default(),
            done: false,
            finished: false,
        }
    }

    pub fn is_done(&self) -> bool {
        self.done
    }

    pub fn push(&mut self, bytes: &[u8]) -> Result<Vec<(bool, String)>, String> {
        if self.done || self.finished {
            return Ok(Vec::new());
        }
        self.lines.bytes.extend_from_slice(bytes);
        let mut segments = Vec::new();
        while let Some(line) = self.lines.next_line()? {
            self.process_line(&line, &mut segments);
            if self.done {
                break;
            }
        }
        Ok(segments)
    }

    fn process_line(&mut self, line: &str, segments: &mut Vec<(bool, String)>) {
        let delta = parse_sse_line(line, self.format);
        if let Some(thought) = delta.thought.filter(|thought| !thought.is_empty()) {
            segments.push((true, thought));
        }
        if let Some(text) = delta.text {
            segments.extend(self.filter.push(&text));
        }
        self.done = delta.is_done;
    }

    pub fn finish(&mut self) -> Result<Vec<(bool, String)>, String> {
        if self.finished {
            return Ok(Vec::new());
        }
        let mut segments = Vec::new();
        if !self.done
            && let Some(line) = self.lines.finish()?
        {
            self.process_line(&line, &mut segments);
        }
        self.lines.bytes.clear();
        if let Some(segment) = self.filter.finish() {
            segments.push(segment);
        }
        self.finished = true;
        Ok(segments)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn openai(text: &str) -> String {
        format!(
            "data: {}\n\n",
            serde_json::json!({"choices":[{"delta":{"content":text}}]})
        )
    }

    #[test]
    fn every_utf8_chunk_boundary_preserves_content_and_filters_think_tags() {
        let wire = format!(
            ": keepalive\r\n\r\n{}{}data: [DONE]\r\n",
            openai("Grüße <thi"),
            openai("nk>考え</think>世界!")
        );
        for boundary in 0..=wire.len() {
            let mut decoder = StreamDecoder::new(WireFormat::OpenAi);
            let mut segments = decoder.push(&wire.as_bytes()[..boundary]).unwrap();
            segments.extend(decoder.push(&wire.as_bytes()[boundary..]).unwrap());
            segments.extend(decoder.finish().unwrap());
            let text: String = segments
                .iter()
                .filter(|(thought, _)| !thought)
                .map(|(_, text)| text.as_str())
                .collect();
            let thoughts: String = segments
                .iter()
                .filter(|(thought, _)| *thought)
                .map(|(_, text)| text.as_str())
                .collect();
            assert_eq!(text, "Grüße 世界!", "Grenze {boundary}");
            assert_eq!(thoughts, "考え", "Grenze {boundary}");
            assert!(decoder.is_done());
        }
    }

    #[test]
    fn done_discards_tail_even_when_it_contains_invalid_utf8() {
        let mut decoder = StreamDecoder::new(WireFormat::OpenAi);
        let mut bytes = openai("Antwort").into_bytes();
        bytes.extend_from_slice(b"data: [DONE]\n\ndata: ");
        bytes.push(0xff);
        bytes.extend_from_slice(b"\n");
        assert_eq!(
            decoder.push(&bytes).unwrap(),
            vec![(false, "Antwort".into())]
        );
        assert!(decoder.finish().unwrap().is_empty());
        assert!(
            decoder
                .push(openai("nicht mehr").as_bytes())
                .unwrap()
                .is_empty()
        );
        assert!(decoder.finish().unwrap().is_empty());
    }

    #[test]
    fn final_unterminated_thought_delta_is_not_lost() {
        for (format, wire) in [
            (
                WireFormat::OpenAi,
                r#"data: {"choices":[{"delta":{"reasoning_content":"Gedanke"}}]}"#,
            ),
            (
                WireFormat::Anthropic,
                r#"data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"Gedanke"}}"#,
            ),
        ] {
            let mut decoder = StreamDecoder::new(format);
            assert!(decoder.push(wire.as_bytes()).unwrap().is_empty());
            assert_eq!(decoder.finish().unwrap(), vec![(true, "Gedanke".into())]);
        }
    }

    #[test]
    fn anthropic_events_keep_native_thoughts_and_stop_at_message_stop() {
        let wire = concat!(
            "event: content_block_delta\r\n",
            "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"Plan\"}}\r\n\r\n",
            "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Hallo\"}}\n\n",
            "data: {\"type\":\"message_stop\"}\n\n",
            "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Falsch\"}}"
        );
        let mut decoder = StreamDecoder::new(WireFormat::Anthropic);
        assert_eq!(
            decoder.push(wire.as_bytes()).unwrap(),
            vec![(true, "Plan".into()), (false, "Hallo".into())]
        );
        assert!(decoder.is_done());
        assert!(decoder.finish().unwrap().is_empty());
    }

    #[test]
    fn finish_flushes_only_the_partial_tag_from_before_done() {
        let mut decoder = StreamDecoder::new(WireFormat::OpenAi);
        assert_eq!(
            decoder.push(openai("Hallo<thi").as_bytes()).unwrap(),
            vec![(false, "Hallo".into())]
        );
        assert!(
            decoder
                .push(format!("data: [DONE]\n{}", openai("nk>ignoriert")).as_bytes())
                .unwrap()
                .is_empty()
        );
        assert_eq!(decoder.finish().unwrap(), vec![(false, "<thi".into())]);
    }

    #[test]
    fn invalid_utf8_before_done_is_an_error() {
        let mut decoder = StreamDecoder::new(WireFormat::OpenAi);
        assert!(decoder.push(b"data: \xff\n").is_err());
        let mut decoder = StreamDecoder::new(WireFormat::OpenAi);
        decoder.push(b"data: \xff").unwrap();
        assert!(decoder.finish().is_err());
    }
}
