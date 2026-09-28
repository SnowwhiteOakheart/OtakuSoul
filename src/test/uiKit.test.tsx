// @vitest-environment jsdom
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { ModalOverlay } from '../components/ui/ModalOverlay';
import { DropdownMenu } from '../components/ui/DropdownMenu';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { FeedbackHost, confirmDialog } from '../components/ui/feedback';
import { pressable } from '../utils/pressable';
import { CommandPalette } from '../components/CommandPalette';
import { useAppStore } from '../store/useAppStore';

describe('ModalOverlay', () => {
  // jsdom has no layout, so every element reports offsetParent === null (treated as hidden).
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get() {
        return this.parentElement;
      },
    });
  });
  const Harness = ({ onClose }: { onClose: () => void }) => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>open</button>
        {open && (
          <ModalOverlay
            aria-label="dialog"
            onClose={() => {
              onClose();
              setOpen(false);
            }}
          >
            <button>first</button>
            <button>last</button>
          </ModalOverlay>
        )}
      </>
    );
  };

  it('moves focus in, traps Tab, closes on Escape and restores focus', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    const opener = screen.getByText('open');
    await user.click(opener);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('first')).toHaveFocus();

    await user.tab();
    expect(screen.getByText('last')).toHaveFocus();
    await user.tab();
    expect(screen.getByText('first')).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('only the innermost dialog reacts to Escape', async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    const inner = vi.fn();
    render(
      <ModalOverlay aria-label="outer" onClose={outer}>
        <button>outer button</button>
        <ModalOverlay aria-label="inner" onClose={inner}>
          <button>inner button</button>
        </ModalOverlay>
      </ModalOverlay>
    );
    await user.keyboard('{Escape}');
    expect(inner).toHaveBeenCalledOnce();
    expect(outer).not.toHaveBeenCalled();
  });
});

describe('DropdownMenu', () => {
  it('opens, navigates with arrow keys, selects and returns focus', async () => {
    const user = userEvent.setup();
    const onFirst = vi.fn();
    const onSecond = vi.fn();
    render(
      <DropdownMenu
        trigger="menu"
        triggerLabel="More"
        items={[
          { label: 'First', onSelect: onFirst },
          { label: 'Second', onSelect: onSecond },
        ]}
      />
    );

    const trigger = screen.getByRole('button', { name: 'More' });
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Second' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(onSecond).toHaveBeenCalledOnce();
    expect(onFirst).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('marks the checked entry in single-choice menus', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        trigger="lang"
        triggerLabel="Language"
        items={[
          { label: 'Deutsch', onSelect: () => {}, checked: false },
          { label: 'English', onSelect: () => {}, checked: true },
        ]}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Language' }));
    const english = screen.getByRole('menuitemradio', { name: 'English' });
    expect(english).toHaveAttribute('aria-checked', 'true');
    expect(english).toHaveFocus();
  });
});

describe('ErrorBoundary', () => {
  const Boom = ({ explode }: { explode: boolean }) => {
    if (explode) throw new Error('kaputt');
    return <p>fine</p>;
  };

  it('shows a fallback and recovers when the reset key changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(
      <ErrorBoundary resetKey="chat">
        <Boom explode />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(
      <ErrorBoundary resetKey="settings">
        <Boom explode={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('fine')).toBeInTheDocument();
    vi.mocked(console.error).mockRestore();
  });
});

describe('confirmDialog', () => {
  it.each([
    ['confirm', true],
    ['cancel', false],
  ] as const)('resolves %s -> %s', async (action, expected) => {
    const user = userEvent.setup();
    render(<FeedbackHost />);

    let result: Promise<boolean>;
    act(() => {
      result = confirmDialog({ title: 'Delete?', confirmLabel: 'Yes, delete', cancelLabel: 'Keep' });
    });
    expect(await screen.findByRole('dialog')).toHaveTextContent('Delete?');

    await user.click(screen.getByRole('button', { name: action === 'confirm' ? 'Yes, delete' : 'Keep' }));
    await expect(result!).resolves.toBe(expected);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('pressable', () => {
  it('activates on click, Enter and Space but leaves nested controls alone', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    const onNested = vi.fn();
    render(
      <div {...pressable(onPress)}>
        card
        <button onClick={onNested}>nested</button>
      </div>
    );

    const card = screen.getByRole('button', { name: /card/ });
    card.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onPress).toHaveBeenCalledTimes(2);

    screen.getByRole('button', { name: 'nested' }).focus();
    await user.keyboard('{Enter}');
    expect(onNested).toHaveBeenCalledOnce();
    expect(onPress).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: 'nested' }));
    expect(onNested).toHaveBeenCalledTimes(2);
    expect(onPress).toHaveBeenCalledTimes(2);

    await user.click(card);
    expect(onPress).toHaveBeenCalledTimes(3);
  });
});

describe('CommandPalette', () => {
  const Harness = () => {
    const [open, setOpen] = useState(false);
    return (
      <CommandPalette
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
      />
    );
  };

  it('opens with Ctrl+K, filters commands and runs the selected result', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ activeTab: 'chat' });
    render(<Harness />);

    await user.keyboard('{Control>}k{/Control}');
    expect(screen.getByRole('dialog', { name: 'Befehlspalette' })).toBeInTheDocument();

    const search = screen.getByRole('combobox', { name: 'Befehle durchsuchen' });
    await user.type(search, 'Einstellungen');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.keyboard('{Enter}');

    expect(useAppStore.getState().activeTab).toBe('settings');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('supports arrow navigation and Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.keyboard('{Control>}k{/Control}');
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
