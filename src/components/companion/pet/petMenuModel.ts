import type React from 'react';
import { emitTo } from '@tauri-apps/api/event';
import {
  Activity,
  Box,
  Camera,
  Clipboard,
  Cookie,
  Download,
  Drama,
  Eye,
  Hand,
  ImageIcon,
  Layers,
  MessageCircle,
  PanelLeftOpen,
  PersonStanding,
  Repeat,
  Settings2,
  Smile,
  Sparkles,
  Timer,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  FRAME_RATES,
  PET_MOODS,
  PET_PICK_EMOTION_EVENT,
  PET_PRESETS,
  type PetFigureChoice,
  type PetPrefs,
  type PetSize,
  type PetState,
} from '../../../services/desktopPet';
import type { MotionPackItem } from '../../../types/generated/MotionPackItem';
import type { TranslationKey } from '../../../i18n';
import { PET_FOODS, type PetFood } from '../petFood';
import { minutesLeft, TIMER_PRESETS_MIN, type PetTimerState } from '../petTimer';

/** A menu longer than this is unusable; models with more parts show the first ones. */
export const MAX_MENU_PARTS = 30;

/** One entry of the pet's menu: a sector of the ring (with a sub arc) or a native menu item. */
export interface PetMenuItem {
  id: string;
  label: string;
  /** Drawn in the ring; without one, `glyph` (an emoji or a short text). */
  icon?: LucideIcon;
  glyph?: string;
  checked?: boolean;
  enabled?: boolean;
  /** Something that runs now (e.g. minutes left), shown on the sector. */
  badge?: string;
  action?: () => void;
  children?: PetMenuItem[];
}

export type PetSetting =
  | {
      kind: 'toggle';
      id: string;
      label: string;
      checked: boolean;
      enabled?: boolean;
      set: (on: boolean) => void;
    }
  | {
      kind: 'choice';
      id: string;
      label: string;
      value: string | number;
      options: { value: string | number; label: string; enabled?: boolean }[];
      set: (value: string | number) => void;
    };

export interface PetSettingGroup {
  id: string;
  title: string;
  items: PetSetting[];
}

/** Programs the pet steps back for: the last one in front to add, the ignored ones to allow again. */
export interface PetIgnoredApps {
  lastApp: string;
  ignored: string[];
  ignore: (name: string) => void;
  allow: (name: string) => void;
}

export interface PetParts {
  names: string[];
  hidden: string[];
  toggle: (name: string) => void;
}

export interface PetMenuModel {
  title: string;
  /** The ring's sectors (in the native menu the first items). */
  actions: PetMenuItem[];
  /** The switches; in the ring behind "More" (the settings card). */
  settings: PetSettingGroup[];
  apps: PetIgnoredApps;
  parts: PetParts;
  openApp: () => void;
  hide: () => void;
}

export interface PetMenuArgs {
  pet: PetState | null;
  prefs: PetPrefs;
  statusOpen: boolean;
  canSit: boolean;
  currentHeight: number;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  tEmotion: (emotion: string) => string;
  openCompose: () => void;
  pat: () => void;
  parts: string[];
  hiddenParts: string[];
  togglePart: (name: string) => void;
  peeking: boolean;
  startPeek: () => void;
  endPeek: () => void;
  feeding: boolean;
  /** Its favourite food once the user found it out (marked with a heart). */
  favoriteFood?: PetFood['id'] | null;
  startFeeding: (food: PetFood) => void;
  stopFeeding: () => void;
  timer: PetTimerState | null;
  startAlarm: (kind: 'timer' | 'pomodoro', minutes?: number) => void;
  stopAlarm: () => void;
  /** Offered when the 3D figure lacks walking or sitting motions. */
  motionPack: MotionPackItem | null;
  loadMotionPack: (pack: MotionPackItem) => void;
  /** The program in front before the menu opened (the pet itself never counts). */
  lastApp: string;
  setStatusOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPrefs: React.Dispatch<React.SetStateAction<PetPrefs>>;
  resizeTo: (wanted: number) => void;
  askTool: (tool: 'take_screenshot' | 'read_clipboard') => void;
  /** Opens the settings card (ring only; the native menu shows the switches itself). */
  openSettings: () => void;
  openApp: () => void;
  hide: () => void;
}

/** A face for each mood in the ring (the label says it in words). */
const MOOD_GLYPHS: Record<(typeof PET_MOODS)[number], string> = {
  joy: '😊',
  love: '🥰',
  amusement: '😄',
  surprise: '😮',
  curiosity: '🤔',
  embarrassment: '😳',
  sadness: '😢',
  anger: '😠',
  neutral: '😐',
};

const FIGURES: { choice: PetFigureChoice; label: TranslationKey; icon: LucideIcon; has: (pet: PetState | null) => boolean }[] = [
  { choice: 'chat', label: 'pet.figureChat', icon: Sparkles, has: () => true },
  { choice: '3d', label: 'pet.figure3d', icon: Box, has: (pet) => !!pet?.vrmPath },
  { choice: 'inochi2d', label: 'pet.figureInochi2d', icon: Layers, has: (pet) => !!pet?.inochi2dPath },
  { choice: 'live2d', label: 'pet.figureLive2d', icon: Drama, has: (pet) => !!pet?.live2dPath },
  { choice: 'portrait', label: 'pet.figurePortrait', icon: ImageIcon, has: (pet) => !!pet?.portraitPath },
];

const SIZES: { key: PetSize; label: TranslationKey; glyph: string }[] = [
  { key: 'small', label: 'pet.sizeSmall', glyph: 'S' },
  { key: 'medium', label: 'pet.sizeMedium', glyph: 'M' },
  { key: 'large', label: 'pet.sizeLarge', glyph: 'L' },
];

/** The pet's on/off switches. */
type PetSwitch = { [K in keyof PetPrefs]: PetPrefs[K] extends boolean ? K : never }[keyof PetPrefs];

/** Builds the pet's whole menu once; the ring, the settings card and the native menu all show it. */
export function buildPetMenu(a: PetMenuArgs): PetMenuModel {
  const { t, prefs, pet } = a;
  const toggle = (key: PetSwitch, label: TranslationKey, enabled = true): PetSetting => ({
    kind: 'toggle',
    id: key,
    label: t(label),
    checked: !!prefs[key],
    enabled,
    set: (on) => a.setPrefs((p) => ({ ...p, [key]: on })),
  });

  const actions: PetMenuItem[] = [
    { id: 'compose', label: t('pet.compose'), icon: MessageCircle, action: a.openCompose },
    { id: 'pat', label: t('pet.pat'), icon: Hand, action: a.pat },
    {
      id: 'feed',
      label: t('pet.feed'),
      icon: Cookie,
      children: [
        ...PET_FOODS.map((food) => ({
          id: `feed-${food.id}`,
          label:
            food.id === a.favoriteFood
              ? t('pet.foodFavorite', { food: t(`pet.food.${food.id}` as TranslationKey) })
              : t(`pet.food.${food.id}` as TranslationKey),
          glyph: food.emoji,
          action: () => a.startFeeding(food),
        })),
        ...(a.feeding ? [{ id: 'feed-stop', label: t('pet.feedStop'), icon: X, action: a.stopFeeding }] : []),
      ],
    },
    {
      id: 'timer',
      label: a.timer
        ? t('pet.timerRunning', {
            phase: t(`pet.timerPhase.${a.timer.phase}` as TranslationKey),
            minutes: minutesLeft(a.timer, Date.now()),
          })
        : t('pet.timer'),
      icon: Timer,
      badge: a.timer ? String(minutesLeft(a.timer, Date.now())) : undefined,
      children: [
        ...TIMER_PRESETS_MIN.map((minutes) => ({
          id: `timer-${minutes}`,
          label: t('pet.timerMinutes', { minutes }),
          glyph: String(minutes),
          action: () => a.startAlarm('timer', minutes),
        })),
        { id: 'pomodoro', label: t('pet.pomodoro'), icon: Repeat, action: () => a.startAlarm('pomodoro') },
        ...(a.timer ? [{ id: 'timer-stop', label: t('pet.timerStop'), icon: X, action: a.stopAlarm }] : []),
      ],
    },
    {
      id: 'mood',
      label: t('pet.mood'),
      icon: Smile,
      children: PET_MOODS.map((mood) => ({
        id: `mood-${mood}`,
        label: t('pet.moodPick', { mood: a.tEmotion(mood) }),
        glyph: MOOD_GLYPHS[mood],
        checked: pet?.emotion === mood,
        action: () => void emitTo('main', PET_PICK_EMOTION_EVENT, mood).catch(() => {}),
      })),
    },
    {
      id: 'look',
      label: t('pet.lookGroup'),
      icon: Eye,
      children: [
        { id: 'screen', label: t('pet.lookAtScreen'), icon: Camera, action: () => a.askTool('take_screenshot') },
        { id: 'clipboard', label: t('pet.readClipboard'), icon: Clipboard, action: () => a.askTool('read_clipboard') },
        {
          id: 'status',
          label: t(a.statusOpen ? 'pet.hideStatus' : 'pet.showStatus'),
          icon: Activity,
          checked: a.statusOpen,
          action: () => a.setStatusOpen((open) => !open),
        },
        a.peeking
          ? { id: 'peek', label: t('pet.peekEnd'), icon: PanelLeftOpen, checked: true, action: a.endPeek }
          : { id: 'peek', label: t('pet.peek'), icon: PanelLeftOpen, enabled: prefs.physics, action: a.startPeek },
      ],
    },
    {
      id: 'figure',
      label: t('pet.figureGroup'),
      icon: PersonStanding,
      children: [
        // Only the kinds this character has (the settings card names all of them).
        ...FIGURES.filter(({ has }) => has(pet)).map(({ choice, label, icon }) => ({
          id: `figure-${choice}`,
          label: t(label),
          icon,
          checked: prefs.figure === choice,
          action: () => a.setPrefs((p) => ({ ...p, figure: choice })),
        })),
        ...SIZES.map(({ key, label, glyph }) => ({
          id: `size-${key}`,
          label: `${t('pet.size')}: ${t(label)}`,
          glyph,
          checked: a.currentHeight === PET_PRESETS[key],
          action: () => a.resizeTo(PET_PRESETS[key]),
        })),
        ...(a.motionPack
          ? [{ id: 'motions', label: t('pet.loadMotions'), icon: Download, action: () => a.loadMotionPack(a.motionPack!) }]
          : []),
      ],
    },
    { id: 'more', label: t('pet.more'), icon: Settings2, action: a.openSettings },
  ];

  const settings: PetSettingGroup[] = [
    {
      id: 'motion',
      title: t('pet.groupMotion'),
      items: [
        toggle('physics', 'pet.physics'),
        toggle('rideWindows', 'pet.rideWindows', prefs.physics),
        toggle('idleActions', 'pet.idleActions'),
        {
          kind: 'choice',
          id: 'pose',
          label: t('pet.pose'),
          value: prefs.pose,
          options: [
            { value: 'auto', label: t('pet.poseAuto') },
            { value: 'stand', label: t('pet.poseStand') },
            // Sitting on the ground needs a VRM figure (its own pose).
            { value: 'sit', label: t('pet.poseSit'), enabled: a.canSit },
          ],
          set: (pose) => a.setPrefs((p) => ({ ...p, pose: pose as PetPrefs['pose'] })),
        },
        {
          kind: 'choice',
          id: 'figure',
          label: t('pet.figure'),
          value: prefs.figure,
          options: FIGURES.map(({ choice, label, has }) => ({ value: choice, label: t(label), enabled: has(pet) })),
          set: (figure) => a.setPrefs((p) => ({ ...p, figure: figure as PetFigureChoice })),
        },
      ],
    },
    {
      id: 'reactions',
      title: t('pet.groupReactions'),
      items: [
        toggle('chatBubbles', 'pet.chatBubbles'),
        toggle('reactToDesktop', 'pet.reactToDesktop'),
        toggle('eventRemarks', 'pet.eventRemarks'),
        toggle('commentPrograms', 'pet.commentPrograms'),
        toggle('desktopLipSync', 'pet.desktopLipSync'),
      ],
    },
    {
      id: 'life',
      title: t('pet.groupLife'),
      items: [
        toggle('needs', 'pet.needsPref'),
        toggle('breakReminder', 'pet.breakReminder'),
        toggle('focusMode', 'pet.focusMode'),
        toggle('chasePointer', 'pet.chasePointer', prefs.physics),
        toggle('props', 'pet.propsPref'),
        toggle('traces', 'pet.traces'),
        // The place for the weather is typed in the app's Desktop-Pet tab.
        toggle('weather', 'pet.weather', prefs.weatherCity.trim().length > 0),
        toggle('nudgeWindows', 'pet.nudgeWindows', prefs.physics),
      ],
    },
    {
      id: 'display',
      title: t('pet.groupDisplay'),
      items: [
        {
          kind: 'choice',
          id: 'frameRate',
          label: t('pet.frameRate'),
          value: prefs.frameRate,
          options: FRAME_RATES.map((fps) => ({ value: fps, label: t('pet.frameRateValue', { fps }) })),
          set: (fps) => a.setPrefs((p) => ({ ...p, frameRate: fps as PetPrefs['frameRate'] })),
        },
        toggle('batterySaver', 'pet.batterySaver'),
        toggle('quietAtNight', 'pet.quietAtNight'),
        toggle('hideInFullscreen', 'pet.hideInFullscreen'),
        toggle('ambientLight', 'pet.ambientLight'),
      ],
    },
  ];

  return {
    title: pet?.characterName ?? t('pet.title'),
    actions,
    settings,
    apps: {
      lastApp: a.lastApp,
      ignored: prefs.ignoredApps,
      ignore: (name) =>
        a.setPrefs((p) => (p.ignoredApps.includes(name) ? p : { ...p, ignoredApps: [...p.ignoredApps, name] })),
      allow: (name) => a.setPrefs((p) => ({ ...p, ignoredApps: p.ignoredApps.filter((app) => app !== name) })),
    },
    parts: { names: a.parts.slice(0, MAX_MENU_PARTS), hidden: a.hiddenParts, toggle: a.togglePart },
    openApp: a.openApp,
    hide: a.hide,
  };
}
