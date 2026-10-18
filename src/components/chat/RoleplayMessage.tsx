import React from 'react';
import { Clapperboard, Volume2 } from 'lucide-react';
import { translate } from '../../i18n';

export type RoleplaySegmentType = 'action' | 'dialogue' | 'narration' | 'newline';

export interface RoleplaySegment {
  type: RoleplaySegmentType;
  text: string;
}

/**
 * Parses roleplay text into actions (*...*), dialogue ("..."), and standard narration.
 * Designed to handle both completed messages and live streaming tokens (unclosed delimiters).
 */
export function parseRoleplaySegments(input: string): RoleplaySegment[] {
  const segments: RoleplaySegment[] = [];
  if (!input) return segments;

  let currentText = '';
  let inAction = false;
  let inDialogue = false;
  let savedInDialogue = false;

  const flush = (type: RoleplaySegmentType) => {
    if (currentText.length > 0) {
      segments.push({ type, text: currentText });
      currentText = '';
    }
  };

  const isQuoteStart = (char: string) =>
    char === '"' || char === '„' || char === '“' || char === '«';

  const isQuoteEnd = (char: string) =>
    char === '"' || char === '”' || char === '“' || char === '»';

  for (const char of input) {

    // Preserving newlines
    if (char === '\n') {
      if (inAction) flush('action');
      else if (inDialogue) flush('dialogue');
      else flush('narration');

      segments.push({ type: 'newline', text: '\n' });
      continue;
    }

    // Asterisk handling for actions (*action*)
    if (char === '*') {
      if (inAction) {
        // Close action
        currentText += char;
        flush('action');
        inAction = false;
        if (savedInDialogue) {
          inDialogue = true;
          savedInDialogue = false;
        }
      } else {
        // Start action
        if (inDialogue) {
          savedInDialogue = true;
          flush('dialogue');
          inDialogue = false;
        } else {
          flush('narration');
        }
        inAction = true;
        currentText += char;
      }
      continue;
    }

    // Dialogue quotes start
    if (!inAction && isQuoteStart(char) && !inDialogue) {
      flush('narration');
      inDialogue = true;
      currentText += char;
      continue;
    }

    // Dialogue quotes end
    if (!inAction && inDialogue && isQuoteEnd(char)) {
      currentText += char;
      flush('dialogue');
      inDialogue = false;
      continue;
    }

    currentText += char;
  }

  // Flush trailing content (essential for streaming tokens before closure)
  if (currentText.length > 0) {
    if (inAction) flush('action');
    else if (inDialogue) flush('dialogue');
    else flush('narration');
  }

  return segments;
}

/**
 * Splits off out-of-character directions to the AI, `((…))`, from the story text. An unclosed
 * `((` (still streaming, or meant literally) stays story text.
 */
export function splitDirections(input: string): { direction: boolean; text: string }[] {
  const parts: { direction: boolean; text: string }[] = [];
  let rest = input;
  for (let start = rest.indexOf('(('); start >= 0; start = rest.indexOf('((')) {
    const end = rest.indexOf('))', start + 2);
    if (end < 0) break;
    if (start > 0) parts.push({ direction: false, text: rest.slice(0, start) });
    parts.push({ direction: true, text: rest.slice(start + 2, end).trim() });
    rest = rest.slice(end + 2);
  }
  if (rest) parts.push({ direction: false, text: rest });
  return parts;
}

interface RoleplayMessageProps {
  content: string;
  isUser: boolean;
  onSpeak?: () => void;
}

export const RoleplayMessage: React.FC<RoleplayMessageProps> = ({ content, isUser, onSpeak }) => (
  <div className="relative group/roleplay">
    <div className="whitespace-pre-wrap leading-relaxed select-text font-sans">
      {splitDirections(content).map((part, p) =>
        part.direction ? (
          <span
            key={p}
            data-ooc
            title={translate('chat.directionLabel')}
            className={`mx-0.5 rounded-md border border-dashed px-1.5 py-px text-[0.85em] not-italic ${
              isUser ? 'border-white/50 text-white/90' : 'border-slate-500/60 bg-slate-900/40 text-slate-300'
            }`}
          >
            <Clapperboard className="inline w-3 h-3 mr-1 -mt-0.5" aria-hidden="true" />
            <span className="sr-only">{translate('chat.directionLabel')}: </span>
            {part.text}
          </span>
        ) : (
          <StoryText key={p} text={part.text} isUser={isUser} />
        ),
      )}
    </div>

    {!isUser && onSpeak && (
      <button
        onClick={onSpeak}
        className="absolute -right-8 top-0 p-1.5 text-slate-400 hover:text-accent-400 bg-slate-900/50 hover:bg-slate-800 rounded-md opacity-0 group-hover/roleplay:opacity-100 focus-visible:opacity-100 transition-all shadow-sm border border-slate-800 outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
        title={translate('chat.speak')}
        aria-label={translate('chat.speak')}
      >
        <Volume2 className="w-4 h-4" />
      </button>
    )}
  </div>
);

/** Story text with actions (*…*) and speech ("…") styled. */
const StoryText: React.FC<{ text: string; isUser: boolean }> = ({ text, isUser }) => (
  <>
    {parseRoleplaySegments(text).map((seg, i) => {
      if (seg.type === 'newline') {
        return <br key={i} />;
      }

      // Action styling (Italics & soft atmospheric violet/slate)
      if (seg.type === 'action') {
        return (
          <span
            key={i}
            className={`italic transition-colors ${
              isUser
                ? 'text-accent-200/85 font-normal'
                : 'text-accent-300/90 font-normal'
            }`}
          >
            {seg.text}
          </span>
        );
      }

      // Spoken dialogue styling (Clear, prominent, warm speech)
      if (seg.type === 'dialogue') {
        return (
          <span
            key={i}
            className={`transition-colors ${
              isUser
                ? 'text-white font-semibold'
                : 'rp-dialogue text-amber-100/95 font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]'
            }`}
          >
            {seg.text}
          </span>
        );
      }

      // Standard narrative text
      return (
        <span
          key={i}
          className={isUser ? 'text-accent-50' : 'text-slate-200'}
        >
          {seg.text}
        </span>
      );
    })}
  </>
);
