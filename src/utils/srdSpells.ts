import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { SpellData } from '../types';
import type { LocalizedName } from '../types/generated/LocalizedName';

let cache: Map<string, SpellData> | null = null;
let loading: Promise<Map<string, SpellData>> | null = null;

/** The bundled SRD spells, loaded once from the backend. */
export function loadSrdSpells(): Promise<Map<string, SpellData>> {
  if (cache) return Promise.resolve(cache);
  loading ??= api
    .listSrdSpells()
    .then((spells) => {
      cache = new Map(spells.map((spell) => [spell.id, spell]));
      return cache;
    })
    .catch((e) => {
      console.error('Failed to load SRD spells:', e);
      loading = null;
      return new Map<string, SpellData>();
    });
  return loading;
}

/** Spell name in the app language; the id until the spells are loaded. */
export const spellName = (id: string, language: keyof LocalizedName) => {
  const spell = cache?.get(id);
  return spell ? spell.name[language] || spell.name.en : id.replace(/_/g, ' ');
};

/** The SRD spells for a component (empty until loaded). */
export function useSrdSpells(): Map<string, SpellData> {
  const [spells, setSpells] = useState(() => cache ?? new Map<string, SpellData>());
  useEffect(() => {
    let active = true;
    if (!cache) void loadSrdSpells().then((loaded) => active && setSpells(loaded));
    return () => {
      active = false;
    };
  }, []);
  return spells;
}
