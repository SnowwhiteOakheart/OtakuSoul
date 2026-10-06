import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import { ArrowRight, Command, Cpu, Download, FileText, Globe, Image, Key, Layers, Mic, Palette, Search, Settings2, Sliders, Sparkles, Terminal, Users } from 'lucide-react';
import type { IntegrationsTab, SettingsSection } from '../store/useAppStore';
import { revealSetting } from '../utils/revealSetting';
import { useTranslation } from '../i18n';
import { useAppStore } from '../store/useAppStore';
import { ModalOverlay } from './ui/ModalOverlay';
import { NAV_GROUPS } from './navigation';

interface CommandPaletteProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

interface PaletteCommand {
  id: string;
  label: string;
  category: string;
  icon: typeof Command;
  run: () => void;
  /** Extra search words (other languages, synonyms); not shown. */
  keywords?: string;
}

export const CommandPalette = ({ open, onOpen, onClose }: CommandPaletteProps) => {
  const { t, currentLanguage } = useTranslation();
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setIsLogViewerOpen = useAppStore((state) => state.setIsLogViewerOpen);
  const setIsUpdaterOpen = useAppStore((state) => state.setIsUpdaterOpen);
  const setIsPersonaManagerOpen = useAppStore((state) => state.setIsPersonaManagerOpen);
  const openSettingsSection = useAppStore((state) => state.openSettingsSection);
  const setIntegrationsTab = useAppStore((state) => state.setIntegrationsTab);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const close = useCallback(() => {
    setQuery('');
    setActiveIndex(0);
    onClose();
  }, [onClose]);

  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      if (open) close();
      else onOpen();
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [open, onOpen, close]);

  const commands: PaletteCommand[] = [
    ...NAV_GROUPS.flatMap((group) =>
      group.items.map((item) => ({
        id: `view-${item.tab}`,
        label: t(item.label),
        category: t(group.label),
        icon: item.icon,
        run: () => setActiveTab(item.tab),
      }))
    ),
    // Settings pages and single options: a jump opens the page and, for an option, scrolls to it.
    ...([
      ['general', 'settings.appearance', Palette, 'appearance design general allgemein erscheinungsbild оформление'],
      ['server', 'settings.tabServer', Cpu, 'llama server gpu layers context kontext локальный'],
      ['providers', 'settings.tabProviders', Key, 'cloud api key openrouter anthropic openai anbieter провайдер'],
      ['sampler', 'settings.tabSampler', Sliders, 'temperature temperatur top_p preset сэмплер'],
      ['prompt', 'settings.tabPrompt', FileText, 'system prompt vorlage template промпт'],
      ['image', 'settings.tabImage', Image, 'image bild stable diffusion lora flux sdxl vram изображение'],
      ['voice', 'settings.tabVoice', Mic, 'voice stimme tts stt sprache kokoro whisper rvc голос речь'],
      ['hub', 'settings.tabHub', Download, 'gguf model modell download huggingface модель'],
    ] as const).map(([section, label, icon, keywords]) => ({
      id: `settings-${section}`,
      label: t(label),
      category: t('settings.title'),
      icon,
      keywords,
      run: () => openSettingsSection(section as SettingsSection),
    })),
    ...([
      ['setting-language', 'settings.language', Globe, 'language sprache oberfläche interface язык'],
      ['setting-reply-language', 'settings.replyLanguage', Globe, 'reply language antwortsprache язык ответов'],
      ['setting-theme', 'settings.theme', Palette, 'theme farbe dark light hell dunkel тема цвет'],
      ['setting-close-to-tray', 'settings.closeToTray', Settings2, 'tray close schließen beenden quit трей закрыть'],
      ['setting-avatars', 'settings.avatarDefaults', Users, 'avatar vrm live2d аватар'],
      ['setting-avatar-motions', 'motions.title', Users, 'motion bewegung animation vrma geste gesture движение анимация'],
      ['setting-system', 'settings.systemTitle', Terminal, 'logs version update daten data логи'],
    ] as const).map(([anchor, label, icon, keywords]) => ({
      id: `option-${anchor}`,
      label: t(label),
      category: t('settings.title'),
      icon,
      keywords,
      run: () => {
        openSettingsSection('general');
        revealSetting(anchor);
      },
    })),
    ...([
      ['web', 'int.tabWeb', Globe, 'web client mobile handy phone веб'],
      ['discord', 'Discord', Layers, 'discord bot rpc'],
      ['image', 'int.tabImage', Image, 'studio galerie gallery generate erzeugen галерея'],
      ['backup', 'int.tabBackup', Download, 'backup sicherung profile export бэкап'],
    ] as const).map(([tab, label, icon, keywords]) => ({
      id: `integrations-${tab}`,
      label: label === 'Discord' ? label : t(label),
      category: t('nav.integrations'),
      icon,
      keywords,
      run: () => {
        setIntegrationsTab(tab as IntegrationsTab);
        setActiveTab('integrations');
      },
    })),
    {
      id: 'manage-personas',
      label: t('palette.personas'),
      category: t('palette.actions'),
      icon: Users,
      run: () => setIsPersonaManagerOpen(true),
    },
    {
      id: 'open-logs',
      label: t('header.logs'),
      category: t('palette.actions'),
      icon: Terminal,
      run: () => setIsLogViewerOpen(true),
    },
    {
      id: 'check-updates',
      label: t('header.update'),
      category: t('palette.actions'),
      icon: Sparkles,
      run: () => setIsUpdaterOpen(true),
    },
  ];

  const normalizedQuery = query.trim().toLocaleLowerCase(currentLanguage);
  const filteredCommands = normalizedQuery
    ? commands.filter((command) =>
        `${command.label} ${command.category} ${command.keywords ?? ''}`.toLocaleLowerCase(currentLanguage).includes(normalizedQuery)
      )
    : commands;
  const selectedIndex = Math.min(activeIndex, Math.max(filteredCommands.length - 1, 0));

  const runCommand = (command: PaletteCommand) => {
    close();
    command.run();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && filteredCommands.length > 0) {
      event.preventDefault();
      setActiveIndex((selectedIndex + 1) % filteredCommands.length);
    } else if (event.key === 'ArrowUp' && filteredCommands.length > 0) {
      event.preventDefault();
      setActiveIndex((selectedIndex - 1 + filteredCommands.length) % filteredCommands.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const command = filteredCommands[selectedIndex];
      if (command) runCommand(command);
    }
  };

  if (!open) return null;

  return (
    <ModalOverlay
      onClose={close}
      closeOnBackdrop
      aria-labelledby="command-palette-title"
      className="fixed inset-0 z-[10000] flex items-start justify-center bg-black/70 px-4 pt-[12vh] backdrop-blur-sm"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-800 px-4">
          <Search className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
          <input
            data-autofocus
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-results"
            aria-activedescendant={filteredCommands.length > 0 ? `command-${filteredCommands[selectedIndex]?.id}` : undefined}
            aria-label={t('palette.searchLabel')}
            placeholder={t('palette.placeholder')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="h-14 min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-hidden placeholder:text-slate-400"
          />
          <Command className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
        </div>

        <h2 id="command-palette-title" className="sr-only">
          {t('palette.title')}
        </h2>
        <div id="command-palette-results" role="listbox" className="max-h-80 overflow-y-auto p-2">
          {filteredCommands.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-slate-400">{t('palette.noResults')}</p>
          ) : (
            filteredCommands.map((command, index) => {
              const Icon = command.icon;
              const isActive = index === selectedIndex;
              return (
                <button
                  id={`command-${command.id}`}
                  key={command.id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => runCommand(command)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-hidden transition-colors ${
                    isActive ? 'bg-accent-600/20 text-slate-100' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-accent-300' : 'text-slate-400'}`} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{command.label}</span>
                  <span className="text-xs text-slate-400">{command.category}</span>
                  {isActive && <ArrowRight className="h-4 w-4 shrink-0 text-accent-400" aria-hidden />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </ModalOverlay>
  );
};
