import { Menu, type MenuOptions } from '@tauri-apps/api/menu';
import { PET_PRESETS, type PetSize } from '../../../services/desktopPet';
import type { TranslationKey } from '../../../i18n';
import { PET_FOODS, type PetFood } from '../petFood';
import { MAX_MENU_PARTS, type PetMenuItem, type PetMenuModel, type PetSetting } from './petMenuModel';

type NativeItem = NonNullable<MenuOptions['items']>[number];

/** A ring entry as native item: entries with a sub arc become submenus. */
function nativeItem(item: PetMenuItem): NativeItem {
  const text = item.glyph && !item.icon ? `${item.glyph}  ${item.label}` : item.label;
  if (item.children) return { text, enabled: item.enabled ?? true, items: item.children.map(nativeItem) };
  return {
    text,
    enabled: item.enabled ?? true,
    ...(item.checked !== undefined ? { checked: item.checked } : {}),
    action: item.action,
  };
}

function nativeSetting(setting: PetSetting): NativeItem {
  if (setting.kind === 'toggle') {
    return {
      text: setting.label,
      checked: setting.checked,
      enabled: setting.enabled ?? true,
      action: () => setting.set(!setting.checked),
    };
  }
  return {
    text: setting.label,
    items: setting.options.map((option) => ({
      text: option.label,
      checked: setting.value === option.value,
      enabled: option.enabled ?? true,
      action: () => setting.set(option.value),
    })),
  };
}

/**
 * The native right-click menu (Shift+right click, and where the ring has no room): the same
 * entries as the ring, the switches grouped in submenus instead of one long list.
 */
export async function openPetContextMenu(
  model: PetMenuModel,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): Promise<void> {
  const { apps, parts } = model;
  const menu = await Menu.new({
    items: [
      { text: model.title, enabled: false },
      { item: 'Separator' },
      // "More" opens the settings card of the ring; here the groups follow directly.
      ...model.actions.filter((item) => item.id !== 'more').map(nativeItem),
      { item: 'Separator' },
      ...model.settings.map((group) => ({ text: group.title, items: group.items.map(nativeSetting) })),
      {
        text: t('pet.ignoredApps'),
        items: [
          apps.lastApp && !apps.ignored.includes(apps.lastApp)
            ? { text: t('pet.ignoreLastApp', { name: apps.lastApp }), action: () => apps.ignore(apps.lastApp) }
            : { text: t('pet.ignoreNoApp'), enabled: false },
          ...apps.ignored.map((name) => ({ text: t('pet.ignoreRemove', { name }), action: () => apps.allow(name) })),
        ],
      },
      ...(parts.names.length > 1
        ? [
            {
              text: t('pet.parts'),
              items: parts.names.map((name) => ({
                text: name,
                checked: !parts.hidden.includes(name),
                action: () => parts.toggle(name),
              })),
            },
          ]
        : []),
      { item: 'Separator' },
      { text: t('pet.openApp'), action: model.openApp },
      { text: t('pet.hide'), action: model.hide },
    ],
  });
  await menu.popup();
}

interface GuestMenuArgs {
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  currentHeight: number;
  resizeTo: (wanted: number) => Promise<void>;
  startFeeding: (food: PetFood) => void;
  stopFeeding: () => void;
  feeding: boolean;
  parts: string[];
  hiddenParts: string[];
  togglePart: (name: string) => void;
  dismiss: () => void;
}

/** The guest pet's right-click menu: only what changes the guest itself (size, food, parts, goodbye). */
export async function openGuestMenu({
  t,
  currentHeight,
  resizeTo,
  startFeeding,
  stopFeeding,
  feeding,
  parts,
  hiddenParts,
  togglePart,
  dismiss,
}: GuestMenuArgs): Promise<void> {
  const sizes: { key: PetSize; label: string }[] = [
    { key: 'small', label: t('pet.sizeSmall') },
    { key: 'medium', label: t('pet.sizeMedium') },
    { key: 'large', label: t('pet.sizeLarge') },
  ];
  const menu = await Menu.new({
    items: [
      {
        text: t('pet.size'),
        items: sizes.map(({ key, label }) => ({
          text: label,
          checked: currentHeight === PET_PRESETS[key],
          action: () => void resizeTo(PET_PRESETS[key]),
        })),
      },
      {
        text: t('pet.feed'),
        items: [
          ...PET_FOODS.map((food) => ({
            text: `${food.emoji} ${t(`pet.food.${food.id}` as TranslationKey)}`,
            action: () => startFeeding(food),
          })),
          ...(feeding ? [{ item: 'Separator' as const }, { text: t('pet.feedStop'), action: stopFeeding }] : []),
        ],
      },
      ...(parts.length > 1
        ? [
            {
              text: t('pet.parts'),
              items: parts.slice(0, MAX_MENU_PARTS).map((name) => ({
                text: name,
                checked: !hiddenParts.includes(name),
                action: () => togglePart(name),
              })),
            },
          ]
        : []),
      { item: 'Separator' },
      { text: t('pet.guestDismiss'), action: dismiss },
    ],
  });
  await menu.popup();
}
