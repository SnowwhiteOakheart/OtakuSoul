// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TextContextMenu } from '../components/ui/TextContextMenu';
import { installBrowserChromeGuards } from '../services/browserChrome';

const writeText = vi.fn(() => Promise.resolve());

beforeAll(() => {
  Object.assign(navigator, { clipboard: { writeText } });
  installBrowserChromeGuards();
});

function rightClick(target: Element) {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 30 });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function select(node: Node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('TextContextMenu', () => {
  it('replaces the webview menu with a copy entry for selected text', () => {
    render(
      <>
        <p data-testid="message">Hallo aus dem Chat</p>
        <TextContextMenu />
      </>,
    );
    const message = screen.getByTestId('message');
    select(message);
    expect(rightClick(message).defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Kopieren' }));
    expect(writeText).toHaveBeenCalledWith('Hallo aus dem Chat');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows nothing without a selection and leaves text fields to the native menu', () => {
    render(
      <>
        <p data-testid="plain">Text</p>
        <textarea data-testid="field" />
        <TextContextMenu />
      </>,
    );
    window.getSelection()!.removeAllRanges();
    expect(rightClick(screen.getByTestId('plain')).defaultPrevented).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(rightClick(screen.getByTestId('field')).defaultPrevented).toBe(false);
  });
});
