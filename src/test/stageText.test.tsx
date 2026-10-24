// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { StageText } from '../components/stage/StageText';

describe('StageText', () => {
  it('shows bold and italic emphasis without the asterisks', () => {
    const { container } = render(<StageText text={'**Hinweis:** ob *du* das Lied hörst'} />);
    expect(container.textContent).toBe('Hinweis: ob du das Lied hörst');
    expect(container.querySelector('strong')?.textContent).toBe('Hinweis:');
    expect(container.querySelector('em')?.textContent).toBe('du');
  });

  it('keeps an unclosed asterisk while the text still streams', () => {
    const { container } = render(<StageText text={'Sie *lächelt'} />);
    expect(container.textContent).toBe('Sie *lächelt');
  });
});
