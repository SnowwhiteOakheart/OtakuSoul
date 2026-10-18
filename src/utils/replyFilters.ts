import type { ReplyReplacement } from '../types';

/** Why a rule can't run (an invalid regular expression), or null. */
export function ruleError(rule: ReplyReplacement): string | null {
  if (!rule.regex || !rule.find) return null;
  try {
    new RegExp(rule.find, 'gu');
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/**
 * Applies the user's find/replace rules to a reply, in order. Plain rules replace every exact
 * occurrence; regex rules use JavaScript syntax (`$1` for groups). Empty and invalid rules are
 * skipped, so a typo never breaks the chat.
 */
export function applyReplacements(text: string, rules: ReplyReplacement[]): string {
  let out = text;
  for (const rule of rules) {
    if (!rule.find || ruleError(rule)) continue;
    out = rule.regex ? out.replace(new RegExp(rule.find, 'gu'), rule.replace) : out.split(rule.find).join(rule.replace);
  }
  return out;
}
