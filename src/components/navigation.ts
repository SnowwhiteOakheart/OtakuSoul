import {
  BookOpen,
  Bot,
  Compass,
  Dice5,
  Layers,
  MessageSquare,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { TranslationKey } from '../i18n';
import type { AppTab } from '../store/useAppStore';

export interface NavItem {
  tab: AppTab;
  label: TranslationKey;
  icon: LucideIcon;
}

export interface NavGroup {
  label: TranslationKey;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'nav.groupPlay',
    items: [
      { tab: 'chat', label: 'nav.chat', icon: MessageSquare },
      { tab: 'stage', label: 'nav.stage', icon: Dice5 },
      { tab: 'companion', label: 'nav.companion', icon: Bot },
    ],
  },
  {
    label: 'nav.groupLibrary',
    items: [
      { tab: 'characters', label: 'nav.characters', icon: Users },
      { tab: 'lorebooks', label: 'nav.lorebooks', icon: BookOpen },
      { tab: 'hub', label: 'nav.hub', icon: Compass },
    ],
  },
  {
    label: 'nav.groupSystem',
    items: [
      { tab: 'integrations', label: 'nav.integrations', icon: Layers },
      { tab: 'settings', label: 'nav.settings', icon: Settings },
    ],
  },
];

/** Tabs in display order; Ctrl+1...8 follows this order. */
export const SHORTCUT_TABS = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.tab));
