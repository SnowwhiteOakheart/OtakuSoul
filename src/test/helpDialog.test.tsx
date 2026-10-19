// @vitest-environment jsdom
import { de, en, ru } from './locales';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAppStore } from '../store/useAppStore';
import { GLOSSARY_TERMS, GUIDE_STEPS, HelpDialog } from '../components/HelpDialog';

beforeEach(() => useAppStore.setState({ appLanguage: 'en' }));

describe('HelpDialog', () => {
  it('has every guide step and glossary term in all languages', () => {
    const keys = [
      ...GUIDE_STEPS.flatMap((n) => [`help.step.${n}.title`, `help.step.${n}.text`]),
      ...GLOSSARY_TERMS.flatMap((id) => [`glossary.${id}.term`, `glossary.${id}.text`]),
    ];
    for (const dict of [de, en, ru] as Record<string, string>[]) {
      for (const key of keys) expect(dict[key], key).toBeTruthy();
    }
  });

  it('shows the first steps and finds terms in the glossary', async () => {
    const user = userEvent.setup();
    render(<HelpDialog onClose={vi.fn()} />);
    expect(screen.getByText('Set up the AI')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Glossary/ }));
    await user.type(screen.getByRole('textbox', { name: 'Search a term …' }), 'graphics');
    expect(screen.getByText('Graphics memory (VRAM)')).toBeInTheDocument();
    expect(screen.queryByText('Persona')).not.toBeInTheDocument();
  });
});
