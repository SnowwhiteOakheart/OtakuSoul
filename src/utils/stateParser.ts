import { StateVariable } from '../types';

export interface ParsedStateResult {
  cleanedText: string;
  stateUpdates: Record<string, string | number | boolean> | null;
}

/**
 * Extracts <state>{...}</state> JSON tags from text, returns cleaned text and parsed key-value updates.
 */
export function extractStateUpdates(text: string): ParsedStateResult {
  if (!text) {
    return { cleanedText: '', stateUpdates: null };
  }

  const stateRegex = /<state>([\s\S]*?)<\/state>/gi;
  let match: RegExpExecArray | null;
  const updates: Record<string, string | number | boolean> = {};
  let found = false;

  while ((match = stateRegex.exec(text)) !== null) {
    const jsonStr = (match[1] ?? '').trim();
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          Object.assign(updates, parsed);
          found = true;
        }
      } catch {
        // Silently ignore malformed state JSON
      }
    }
  }

  // Remove all complete <state>...</state> tags
  let cleaned = text.replace(/<state>[\s\S]*?<\/state>/gi, '').trim();

  // Also remove trailing unclosed <state>... in case of streaming
  cleaned = cleaned.replace(/<state>[\s\S]*$/gi, '').trim();

  return {
    cleanedText: cleaned,
    stateUpdates: found ? updates : null,
  };
}

/**
 * Applies extracted state updates to existing StateVariable[] list.
 */
export function applyStateUpdates(
  variables: StateVariable[],
  updates: Record<string, string | number | boolean>
): StateVariable[] {
  const result = [...variables];

  for (const [key, rawVal] of Object.entries(updates)) {
    const valStr = String(rawVal);
    const existingIndex = result.findIndex(
      (v) => v.name.toLowerCase() === key.toLowerCase()
    );

    const existing = result[existingIndex];
    if (existing) {
      result[existingIndex] = { ...existing, value: valStr };
    } else {
      let varType: 'int' | 'str' | 'bool' | 'progress' = 'str';
      if (typeof rawVal === 'boolean') {
        varType = 'bool';
      } else if (typeof rawVal === 'number') {
        varType = 'int';
      }

      result.push({
        name: key,
        value: valStr,
        var_type: varType,
      });
    }
  }

  return result;
}

export interface ChatTextSegment {
  type: 'action' | 'dialogue' | 'text';
  content: string;
}

/**
 * Splits roleplay message text into actions (*action*), spoken words ("dialogue"), and narration.
 */
export function parseRoleplaySegments(text: string): ChatTextSegment[] {
  if (!text) return [];

  const segments: ChatTextSegment[] = [];
  // Regex to match *action* or "dialogue" or „dialogue“
  const regex = /(\*[^*]+\*)|("[^"]+")|(„[^“]+“)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const plain = text.slice(lastIndex, match.index).trim();
      if (plain) {
        segments.push({ type: 'text', content: plain });
      }
    }

    const matchedStr = match[0];
    if (matchedStr.startsWith('*') && matchedStr.endsWith('*')) {
      segments.push({
        type: 'action',
        content: matchedStr.slice(1, -1).trim(),
      });
    } else if (
      (matchedStr.startsWith('"') && matchedStr.endsWith('"')) ||
      (matchedStr.startsWith('„') && matchedStr.endsWith('“'))
    ) {
      segments.push({
        type: 'dialogue',
        content: matchedStr.slice(1, -1).trim(),
      });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    const remainder = text.slice(lastIndex).trim();
    if (remainder) {
      segments.push({ type: 'text', content: remainder });
    }
  }

  return segments.length > 0 ? segments : [{ type: 'text', content: text }];
}
