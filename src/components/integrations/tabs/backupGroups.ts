import { BookOpen, Bot, Brain, Settings, Swords, User, Users, type LucideIcon } from 'lucide-react';
import type { TranslationKey } from '../../../i18n';
import type { BackupGroupSelection } from '../../../types';

/** The groups a backup (and a sync state) can hold, in display order. */
export const BACKUP_GROUPS = [
  { key: 'characters', label: 'int.group.characters', icon: Users },
  { key: 'lorebooks', label: 'int.group.lorebooks', icon: BookOpen },
  { key: 'personas', label: 'int.group.personas', icon: User },
  { key: 'memory', label: 'int.group.memory', icon: Brain },
  { key: 'stage', label: 'int.group.stage', icon: Swords },
  { key: 'companion', label: 'int.group.companion', icon: Bot },
  { key: 'settings', label: 'int.group.settings', icon: Settings },
] as const satisfies readonly { key: keyof BackupGroupSelection; label: TranslationKey; icon: LucideIcon }[];
