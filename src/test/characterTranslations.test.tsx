// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CharacterTranslationsTab } from '../components/characters/CharacterTranslationsTab';
import { useAppStore } from '../store/useAppStore';

describe('CharacterTranslationsTab', () => {
  it('renders and adds a new language', () => {
    useAppStore.setState({ appLanguage: 'de' });

    let sourceLanguage = 'de';
    let translations: Record<string, Record<string, string>> = {};

    const setSourceLanguage = vi.fn((lang) => { sourceLanguage = lang; });
    const setTranslations = vi.fn((t) => { translations = t; });

    const { rerender } = render(
      <CharacterTranslationsTab
        sourceLanguage={sourceLanguage}
        setSourceLanguage={setSourceLanguage}
        translations={translations}
        setTranslations={setTranslations}
      />
    );

    // Initial state: no language selected
    expect(screen.getByText('Keine Sprache ausgewählt')).toBeInTheDocument();

    // Type new language
    const input = screen.getByPlaceholderText('z.B. en, ru, ja');
    fireEvent.change(input, { target: { value: 'en' } });
    
    const addBtn = screen.getByRole('button', { name: /Hinzufügen/i });
    fireEvent.click(addBtn);

    expect(setTranslations).toHaveBeenCalledWith({ en: {} });
    
    // Simulate re-render with new translations state
    translations = { en: {} };
    rerender(
      <CharacterTranslationsTab
        sourceLanguage={sourceLanguage}
        setSourceLanguage={setSourceLanguage}
        translations={translations}
        setTranslations={setTranslations}
      />
    );

    // Language should be selected and description field should appear
    expect(screen.queryByText('Keine Sprache ausgewählt')).not.toBeInTheDocument();
    
    const textboxes = screen.getAllByRole('textbox');
    // 0: Originalsprache, 1: Neue Sprache, 2: custom_title, 3: description
    expect(screen.getByText('custom_title')).toBeInTheDocument();
    const descField = textboxes[3];
    expect(descField).toBeInTheDocument();

    fireEvent.change(descField!, { target: { value: 'English description' } });
    expect(setTranslations).toHaveBeenCalledWith({
      en: { description: 'English description' }
    });
  });
});
