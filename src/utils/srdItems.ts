import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { translate, type TranslationKey } from '../i18n';
import type { ItemData } from '../types';

let cache: Map<string, ItemData> | null = null;
let loading: Promise<Map<string, ItemData>> | null = null;

/** The bundled SRD equipment, loaded once from the backend. */
export function loadSrdItems(): Promise<Map<string, ItemData>> {
  if (cache) return Promise.resolve(cache);
  loading ??= api
    .listSrdItems()
    .then((items) => {
      cache = new Map(items.map((item) => [item.id, item]));
      return cache;
    })
    .catch((e) => {
      console.error('Failed to load SRD items:', e);
      loading = null;
      return new Map<string, ItemData>();
    });
  return loading;
}

/** The SRD equipment for a component (empty until loaded). */
export function useSrdItems(): Map<string, ItemData> {
  const [items, setItems] = useState(() => cache ?? new Map<string, ItemData>());
  useEffect(() => {
    let active = true;
    if (!cache) void loadSrdItems().then((loaded) => active && setItems(loaded));
    return () => {
      active = false;
    };
  }, []);
  return items;
}

/** "Light armor, AC 11 + DEX", "Martial weapon, 1d8 slashing" … in the app language. */
export function itemSummary(item: ItemData): string {
  if (item.armor) {
    const dex = item.armor.dex_max === 0 ? '' : item.armor.dex_max ? translate('gear.dexMax', { max: item.armor.dex_max }) : translate('gear.dex');
    return translate('gear.armor', {
      category: translate(`gear.category.${item.armor.category}` as TranslationKey),
      ac: item.armor.base,
      dex,
    });
  }
  if (item.kind === 'shield') return translate('gear.shield');
  if (item.weapon) {
    return translate('gear.weapon', {
      category: translate(`gear.category.${item.weapon.category}` as TranslationKey),
      damage: item.weapon.damage.replace('d', translate('gear.die')),
      type: translate(`fight.damageType.${item.weapon.damage_type}` as TranslationKey),
    });
  }
  if (item.kind === 'potion') return translate('gear.potion', { heal: (item.heal ?? '').replace('d', translate('gear.die')) });
  return translate('gear.treasure');
}
