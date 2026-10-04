// @vitest-environment jsdom
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Info } from 'lucide-react';
import { Button, IconButton, ListSkeleton, ScrollText, Select, Slider, Tabs, Toggle, Tooltip, ViewSkeleton } from '../components/ui';

describe('UI primitives', () => {
  it('disables a loading button and exposes its busy state', () => {
    render(<Button loading>Speichern</Button>);
    const button = screen.getByRole('button', { name: 'Speichern' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('gives icon buttons an accessible name and linked tooltip', () => {
    render(<IconButton label="Details" icon={<Info aria-hidden />} />);
    const button = screen.getByRole('button', { name: 'Details' });
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Details');
    expect(button).toHaveAttribute('aria-describedby', tooltip.id);
  });

  it('links a standalone tooltip to its child', () => {
    render(
      <Tooltip content="Mehr erfahren">
        <button>Info</button>
      </Tooltip>
    );
    const tooltip = screen.getByRole('tooltip');
    expect(screen.getByRole('button', { name: 'Info' })).toHaveAttribute('aria-describedby', tooltip.id);
  });

  it('changes tabs with arrow keys', async () => {
    const user = userEvent.setup();
    const Harness = () => {
      const [value, setValue] = useState<'one' | 'two'>('one');
      return (
        <Tabs
          ariaLabel="Bereiche"
          value={value}
          onValueChange={setValue}
          items={[
            { value: 'one', label: 'Erster' },
            { value: 'two', label: 'Zweiter' },
          ]}
        />
      );
    };
    render(<Harness />);
    const first = screen.getByRole('tab', { name: 'Erster' });
    first.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Zweiter' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Zweiter' })).toHaveFocus();
  });

  it('renders a labelled native select', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select
        label="Sprache"
        defaultValue="de"
        onChange={onChange}
        options={[
          { value: 'de', label: 'Deutsch' },
          { value: 'en', label: 'English' },
        ]}
      />
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sprache' }), 'en');
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('toggles a switch through its checked state', async () => {
    const user = userEvent.setup();
    const Harness = () => {
      const [checked, setChecked] = useState(false);
      return <Toggle checked={checked} onCheckedChange={setChecked} label="Automatisch" />;
    };
    render(<Harness />);
    const toggle = screen.getByRole('switch', { name: 'Automatisch' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('reports numeric slider changes', () => {
    const onValueChange = vi.fn();
    render(<Slider label="Lautstärke" min={0} max={10} value={5} onValueChange={onValueChange} />);
    fireEvent.change(screen.getByRole('slider', { name: 'Lautstärke' }), { target: { value: '7' } });
    expect(onValueChange).toHaveBeenCalledWith(7);
  });

  it('exposes view and list skeletons as busy status regions', () => {
    render(
      <>
        <ViewSkeleton label="Ansicht wird geladen" />
        <ListSkeleton label="Karten werden geladen" layout="portrait" />
      </>
    );
    expect(screen.getByRole('status', { name: 'Ansicht wird geladen' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status', { name: 'Karten werden geladen' })).toHaveAttribute('aria-busy', 'true');
  });

  it('limits long text to three lines and makes it scrollable only when it overflows', () => {
    const height = (scroll: number) => {
      vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scroll);
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(60);
    };
    height(60);
    const { unmount } = render(<ScrollText label="Charakterzüge">kurz</ScrollText>);
    const short = screen.getByText('kurz');
    expect(short).not.toHaveAttribute('tabindex');
    unmount();

    height(240);
    render(<ScrollText label="Charakterzüge">sehr langer Text</ScrollText>);
    const region = screen.getByRole('region', { name: 'Charakterzüge' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toHaveClass('overflow-y-auto');
    vi.restoreAllMocks();
  });
});
