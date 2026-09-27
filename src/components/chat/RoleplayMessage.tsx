import React from 'react';
import { Volume2 } from 'lucide-react';

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

interface RoleplayMessageProps {
  content: string;
  isUser: boolean;
  onSpeak?: () => void;
}

export const RoleplayMessage: React.FC<RoleplayMessageProps> = ({ content, isUser, onSpeak }) => {
  const segments = parseRoleplaySegments(content);

  return (
    <div className="relative group/roleplay">
      <div className="whitespace-pre-wrap leading-relaxed select-text font-sans">
        {segments.map((seg, i) => {
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
                    ? 'text-purple-200/85 font-normal'
                    : 'text-purple-300/90 font-normal'
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
                    : 'text-amber-100/95 font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]'
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
              className={isUser ? 'text-purple-50' : 'text-slate-200'}
            >
              {seg.text}
            </span>
          );
        })}
      </div>
      
      {!isUser && onSpeak && (
        <button
          onClick={onSpeak}
          className="absolute -right-8 top-0 p-1.5 text-slate-500 hover:text-purple-400 bg-slate-900/50 hover:bg-slate-800 rounded-md opacity-0 group-hover/roleplay:opacity-100 transition-all shadow-sm border border-slate-800"
          title="Vorlesen (TTS)"
        >
          <Volume2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
