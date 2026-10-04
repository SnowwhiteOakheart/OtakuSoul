import type { TranslationKey } from '../../i18n';

/** What a companion tool can do, shown before it is approved. */
export type ToolEffect =
  | 'network'
  | 'readsSystem'
  | 'readsFiles'
  | 'writesFiles'
  | 'runsCode'
  | 'readsScreen'
  | 'readsClipboard'
  | 'controlsDesktop'
  | 'external';

const EFFECTS: Record<string, ToolEffect[]> = {
  web_search: ['network'],
  browse_web: ['network'],
  open_external_url: ['network', 'controlsDesktop'],
  get_system_info: ['readsSystem'],
  get_hardware_specs: ['readsSystem'],
  system_health_report: ['readsSystem'],
  get_environment_snapshot: ['readsSystem'],
  take_screenshot: ['readsScreen'],
  read_clipboard: ['readsClipboard'],
  media_control: ['controlsDesktop'],
  app_control: ['controlsDesktop'],
  gui_action: ['controlsDesktop'],
  execute_code: ['runsCode', 'writesFiles', 'network'],
  set_timer: [],
  plan_and_execute: [],
};

/** Effects of a call; `file_organizer` depends on its action, MCP and unknown tools are external. */
export const toolEffects = (toolName: string, args: unknown): ToolEffect[] => {
  if (toolName === 'file_organizer') {
    const action = String((args as { action?: unknown } | null)?.action ?? 'list').trim().toLowerCase();
    return ['list', 'search', 'preview'].includes(action) ? ['readsFiles'] : ['readsFiles', 'writesFiles'];
  }
  return EFFECTS[toolName] ?? ['external'];
};

export const effectLabel = (effect: ToolEffect): TranslationKey => `comp.effect.${effect}` as TranslationKey;
