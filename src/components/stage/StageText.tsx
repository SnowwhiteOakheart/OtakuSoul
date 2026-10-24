import React from 'react';

const EMPHASIS = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;

/**
 * Stage text with the model's Markdown emphasis shown instead of its asterisks: `**bold**` as
 * bold, `*action*` in italics. An unclosed asterisk (still streaming) stays as it is.
 */
export const StageText: React.FC<{ text: string }> = ({ text }) => {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(EMPHASIS)) {
    const at = match.index;
    if (at > last) parts.push(text.slice(last, at));
    parts.push(match[1] !== undefined
      ? <strong key={at} className="font-semibold">{match[1]}</strong>
      : <em key={at} className="opacity-90">{match[2]}</em>);
    last = at + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
};
