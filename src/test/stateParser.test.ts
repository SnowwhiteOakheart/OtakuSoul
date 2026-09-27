import { describe, it, expect } from 'vitest';
import {
  extractStateUpdates,
  applyStateUpdates,
  parseRoleplaySegments,
} from '../utils/stateParser';
import { StateVariable } from '../types';

describe('State Parser & Roleplay Parser', () => {
  describe('extractStateUpdates', () => {
    it('returns empty result for empty string', () => {
      const res = extractStateUpdates('');
      expect(res.cleanedText).toBe('');
      expect(res.stateUpdates).toBeNull();
    });

    it('extracts state JSON tag and cleans text', () => {
      const input =
        'Hallo Meister! *lächelt sanft* <state>{"affection": 15, "mood": "happy"}</state> Wie kann ich dir helfen?';
      const res = extractStateUpdates(input);

      expect(res.cleanedText).toBe(
        'Hallo Meister! *lächelt sanft*  Wie kann ich dir helfen?'
      );
      expect(res.stateUpdates).toEqual({
        affection: 15,
        mood: 'happy',
      });
    });

    it('merges multiple state tags if present in response', () => {
      const input =
        '<state>{"hp": 90}</state> Ein Treffer! <state>{"mp": 45, "hp": 85}</state>';
      const res = extractStateUpdates(input);

      expect(res.cleanedText).toBe('Ein Treffer!');
      expect(res.stateUpdates).toEqual({
        hp: 85,
        mp: 45,
      });
    });

    it('handles malformed JSON inside state tag gracefully', () => {
      const input =
        'Schau mal: <state>{affections: broken}</state> Hat es geklappt?';
      const res = extractStateUpdates(input);

      expect(res.cleanedText).toBe('Schau mal:  Hat es geklappt?');
      expect(res.stateUpdates).toBeNull();
    });

    it('handles streaming unclosed state tag by stripping trailing unclosed state', () => {
      const input =
        'Ich denke nach... <state>{"affinity": 10';
      const res = extractStateUpdates(input);

      expect(res.cleanedText).toBe('Ich denke nach...');
    });
  });

  describe('applyStateUpdates', () => {
    it('updates existing variables with new values', () => {
      const existing: StateVariable[] = [
        { name: 'affection', value: '10', var_type: 'int' },
        { name: 'location', value: 'Library', var_type: 'str' },
      ];

      const updates = { affection: 20, location: 'Garden' };
      const updated = applyStateUpdates(existing, updates);

      expect(updated.find((v) => v.name === 'affection')?.value).toBe('20');
      expect(updated.find((v) => v.name === 'location')?.value).toBe('Garden');
    });

    it('adds new variables if not existing with correct inferred type', () => {
      const existing: StateVariable[] = [];
      const updates = {
        quest_complete: true,
        gold: 150,
        character_name: 'Rem',
      };

      const updated = applyStateUpdates(existing, updates);

      expect(updated).toHaveLength(3);
      expect(updated.find((v) => v.name === 'quest_complete')?.var_type).toBe('bool');
      expect(updated.find((v) => v.name === 'gold')?.var_type).toBe('int');
      expect(updated.find((v) => v.name === 'character_name')?.var_type).toBe('str');
    });
  });

  describe('parseRoleplaySegments', () => {
    it('returns empty array for empty string', () => {
      expect(parseRoleplaySegments('')).toEqual([]);
    });

    it('splits actions, dialogues and normal text', () => {
      const text = '*sieht dich überrascht an* "Bist du schon wach?" fragt sie leise.';
      const segments = parseRoleplaySegments(text);

      expect(segments.length).toBeGreaterThanOrEqual(3);
      expect(segments[0]).toEqual({
        type: 'action',
        content: 'sieht dich überrascht an',
      });
      expect(segments[1]).toEqual({
        type: 'dialogue',
        content: 'Bist du schon wach?',
      });
      expect(segments[2]).toEqual({
        type: 'text',
        content: 'fragt sie leise.',
      });
    });
  });
});
