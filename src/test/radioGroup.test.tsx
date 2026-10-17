// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { radioGroupKeyDown, radioTabIndex } from '../utils/radioGroup';

const VALUES = ['a', 'b', 'c'] as const;

function Group({ initial }: { initial?: (typeof VALUES)[number] }) {
  const [value, setValue] = useState(initial);
  return (
    <div role="radiogroup" aria-label="Test" tabIndex={-1} onKeyDown={(e) => radioGroupKeyDown(e, VALUES, value, setValue)}>
      {VALUES.map((v) => (
        <button key={v} type="button" role="radio" aria-checked={v === value} tabIndex={radioTabIndex(v, VALUES, value)} data-radio-value={v}>
          {v}
        </button>
      ))}
    </div>
  );
}

describe('radio group keyboard', () => {
  it('moves choice and focus with the arrow keys and wraps around', () => {
    render(<Group initial="c" />);
    const c = screen.getByRole('radio', { name: 'c' });
    c.focus();
    fireEvent.keyDown(c, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'a' })).toHaveAttribute('aria-checked', 'true');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'a' }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(screen.getByRole('radio', { name: 'c' })).toHaveAttribute('aria-checked', 'true');
  });

  it('keeps one Tab stop, the first option when none is chosen', () => {
    render(<Group />);
    expect(screen.getAllByRole('radio').map((r) => r.tabIndex)).toEqual([0, -1, -1]);
  });
});
