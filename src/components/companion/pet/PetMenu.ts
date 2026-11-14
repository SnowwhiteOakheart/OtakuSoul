import { Menu } from '@tauri-apps/api/menu';
import { emitTo } from '@tauri-apps/api/event';
import type React from 'react';
import { api } from '../../../services/api';
import {
  FRAME_RATES,
  PET_MOODS,
  PET_PICK_EMOTION_EVENT,
  PET_PRESETS,
  type PetPrefs,
  type PetSize,
  type PetState,
} from '../../../services/desktopPet';
import type { MotionPackItem } from '../../../types/generated/MotionPackItem';
import { lacksPetMotions, recommendedMotionPack } from '../../../utils/motionPacks';
import type { TranslationKey } from '../../../i18n';
import { PET_FOODS, type PetFood } from '../petFood';
import { minutesLeft, TIMER_PRESETS_MIN, type PetTimerState } from '../petTimer';

interface OpenPetMenuArgs {
  pet: PetState | null;
  prefs: PetPrefs;
  statusOpen: boolean;
  canSit: boolean;
  currentHeight: number;
  currentLanguage: string;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  tEmotion: (emotion: string) => string;
  openCompose: () => void;
  pat: () => Promise<void>;
  peeking: boolean;
  startPeek: () => void;
  endPeek: () => void;
  feeding: boolean;
  startFeeding: (food: PetFood) => void;
  stopFeeding: () => void;
  timer: PetTimerState | null;
  startAlarm: (kind: 'timer' | 'pomodoro', minutes?: number) => void;
  stopAlarm: () => void;
  loadMotionPack: (pack: MotionPackItem) => Promise<void>;
  setStatusOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPrefs: React.Dispatch<React.SetStateAction<PetPrefs>>;
  resizeTo: (wanted: number) => Promise<void>;
  askTool: (tool: 'take_screenshot' | 'read_clipboard') => Promise<void>;
  toggleDesktopPet: (enabled: boolean) => Promise<unknown>;
}

export async function openPetContextMenu({
  pet,
  prefs,
  statusOpen,
  canSit,
  currentHeight,
  currentLanguage,
  t,
  tEmotion,
  openCompose,
  pat,
  peeking,
  startPeek,
  endPeek,
  feeding,
  startFeeding,
  stopFeeding,
  timer,
  startAlarm,
  stopAlarm,
  loadMotionPack,
  setStatusOpen,
  setPrefs,
  resizeTo,
  askTool,
  toggleDesktopPet,
}: OpenPetMenuArgs): Promise<void> {
  // A 3D figure without walking or sitting motions: the menu offers the motion pack.
  const motionPack =
    pet?.vrmPath && lacksPetMotions(pet.motions ?? [])
      ? recommendedMotionPack((await api.getMotionPacks(currentLanguage).catch(() => [])) ?? [])
      : null;
  // The program in front before the menu opened (the pet itself never counts).
  const lastApp = await api.getPetLastApp().catch(() => '');
  const ignoreApp = (name: string) =>
    setPrefs((p) => (p.ignoredApps.includes(name) ? p : { ...p, ignoredApps: [...p.ignoredApps, name] }));
  const sizes: { key: PetSize; label: string }[] = [
    { key: 'small', label: t('pet.sizeSmall') },
    { key: 'medium', label: t('pet.sizeMedium') },
    { key: 'large', label: t('pet.sizeLarge') },
  ];
  const menu = await Menu.new({
    items: [
      { text: pet?.characterName ?? t('pet.title'), enabled: false },
      { item: 'Separator' },
      { text: t('pet.compose'), action: openCompose },
      { text: t('pet.pat'), action: () => void pat() },
      ...(motionPack ? [{ text: t('pet.loadMotions'), action: () => void loadMotionPack(motionPack) }] : []),
      { text: t(statusOpen ? 'pet.hideStatus' : 'pet.showStatus'), action: () => setStatusOpen((open) => !open) },
      {
        text: t('pet.mood'),
        items: PET_MOODS.map((mood) => ({
          text: tEmotion(mood),
          checked: pet?.emotion === mood,
          action: () => void emitTo('main', PET_PICK_EMOTION_EVENT, mood).catch(() => {}),
        })),
      },
      {
        text: t('pet.figure'),
        items: [
          {
            text: t('pet.figureChat'),
            checked: prefs.figure === 'chat',
            action: () => setPrefs((p) => ({ ...p, figure: 'chat' })),
          },
          {
            text: t('pet.figure3d'),
            checked: prefs.figure === '3d',
            enabled: !!pet?.vrmPath,
            action: () => setPrefs((p) => ({ ...p, figure: '3d' })),
          },
          {
            text: t('pet.figureInochi2d'),
            checked: prefs.figure === 'inochi2d',
            enabled: !!pet?.inochi2dPath,
            action: () => setPrefs((p) => ({ ...p, figure: 'inochi2d' })),
          },
          {
            text: t('pet.figureLive2d'),
            checked: prefs.figure === 'live2d',
            enabled: !!pet?.live2dPath,
            action: () => setPrefs((p) => ({ ...p, figure: 'live2d' })),
          },
          {
            text: t('pet.figurePortrait'),
            checked: prefs.figure === 'portrait',
            enabled: !!pet?.portraitPath,
            action: () => setPrefs((p) => ({ ...p, figure: 'portrait' })),
          },
        ],
      },
      {
        text: t('pet.frameRate'),
        items: FRAME_RATES.map((fps) => ({
          text: t('pet.frameRateValue', { fps }),
          checked: prefs.frameRate === fps,
          action: () => setPrefs((p) => ({ ...p, frameRate: fps })),
        })),
      },
      {
        text: t('pet.pose'),
        items: [
          { key: 'auto' as const, label: t('pet.poseAuto') },
          { key: 'stand' as const, label: t('pet.poseStand') },
          { key: 'sit' as const, label: t('pet.poseSit') },
        ].map(({ key, label }) => ({
          text: label,
          checked: prefs.pose === key,
          // Sitting on the ground needs a VRM figure (its own pose).
          enabled: key !== 'sit' || canSit,
          action: () => setPrefs((p) => ({ ...p, pose: key })),
        })),
      },
      {
        text: t('pet.size'),
        items: sizes.map(({ key, label }) => ({
          text: label,
          checked: currentHeight === PET_PRESETS[key],
          action: () => void resizeTo(PET_PRESETS[key]),
        })),
      },
      {
        text: t('pet.idleActions'),
        checked: prefs.idleActions,
        action: () => setPrefs((p) => ({ ...p, idleActions: !p.idleActions })),
      },
      {
        text: t('pet.batterySaver'),
        checked: prefs.batterySaver,
        action: () => setPrefs((p) => ({ ...p, batterySaver: !p.batterySaver })),
      },
      {
        text: t('pet.quietAtNight'),
        checked: prefs.quietAtNight,
        action: () => setPrefs((p) => ({ ...p, quietAtNight: !p.quietAtNight })),
      },
      {
        text: t('pet.reactToDesktop'),
        checked: prefs.reactToDesktop,
        action: () => setPrefs((p) => ({ ...p, reactToDesktop: !p.reactToDesktop })),
      },
      {
        text: t('pet.chatBubbles'),
        checked: prefs.chatBubbles,
        action: () => setPrefs((p) => ({ ...p, chatBubbles: !p.chatBubbles })),
      },
      {
        text: t('pet.physics'),
        checked: prefs.physics,
        action: () => setPrefs((p) => ({ ...p, physics: !p.physics })),
      },
      {
        text: t('pet.rideWindows'),
        checked: prefs.rideWindows,
        enabled: prefs.physics,
        action: () => setPrefs((p) => ({ ...p, rideWindows: !p.rideWindows })),
      },
      {
        text: t('pet.eventRemarks'),
        checked: prefs.eventRemarks,
        action: () => setPrefs((p) => ({ ...p, eventRemarks: !p.eventRemarks })),
      },
      {
        text: t('pet.ambientLight'),
        checked: prefs.ambientLight,
        action: () => setPrefs((p) => ({ ...p, ambientLight: !p.ambientLight })),
      },
      {
        text: t('pet.hideInFullscreen'),
        checked: prefs.hideInFullscreen,
        action: () => setPrefs((p) => ({ ...p, hideInFullscreen: !p.hideInFullscreen })),
      },
      peeking
        ? { text: t('pet.peekEnd'), action: endPeek }
        : { text: t('pet.peek'), enabled: prefs.physics, action: startPeek },
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
      {
        text: timer
          ? t('pet.timerRunning', { phase: t(`pet.timerPhase.${timer.phase}` as TranslationKey), minutes: minutesLeft(timer, Date.now()) })
          : t('pet.timer'),
        items: [
          ...TIMER_PRESETS_MIN.map((minutes) => ({
            text: t('pet.timerMinutes', { minutes }),
            action: () => startAlarm('timer', minutes),
          })),
          { text: t('pet.pomodoro'), action: () => startAlarm('pomodoro') },
          ...(timer ? [{ item: 'Separator' as const }, { text: t('pet.timerStop'), action: stopAlarm }] : []),
        ],
      },
      {
        text: t('pet.ignoredApps'),
        items: [
          lastApp && !prefs.ignoredApps.includes(lastApp)
            ? { text: t('pet.ignoreLastApp', { name: lastApp }), action: () => ignoreApp(lastApp) }
            : { text: t('pet.ignoreNoApp'), enabled: false },
          ...prefs.ignoredApps.map((name) => ({
            text: t('pet.ignoreRemove', { name }),
            action: () => setPrefs((p) => ({ ...p, ignoredApps: p.ignoredApps.filter((a) => a !== name) })),
          })),
        ],
      },
      { item: 'Separator' },
      { text: t('pet.lookAtScreen'), action: () => void askTool('take_screenshot') },
      { text: t('pet.readClipboard'), action: () => void askTool('read_clipboard') },
      { item: 'Separator' },
      { text: t('pet.openApp'), action: () => void api.showMainWindow() },
      { text: t('pet.hide'), action: () => void toggleDesktopPet(false) },
    ],
  });
  await menu.popup();
}
