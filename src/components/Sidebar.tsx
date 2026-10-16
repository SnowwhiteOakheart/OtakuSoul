import { useEffect, useState } from 'react';
import {
  ChevronsLeft,
  ChevronsRight,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useTranslation, type TranslationKey } from '../i18n';
import { NAV_GROUPS, SHORTCUT_TABS } from './navigation';
import { usePersistentFlag } from '../hooks/usePersistentFlag';

const COLLAPSED_STORAGE_KEY = 'otakusoul.sidebarCollapsed';

const loadCollapsed = (): boolean => {
  try {
    const stored = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (stored !== null) return stored === 'true';
  } catch {
    // Storage can be unavailable (private mode, blocked site data); fall through to the default.
  }
  return window.innerWidth < 1200;
};

export const Sidebar = () => {
  const { t } = useTranslation();
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  // Optional context for newcomers; the compact navigation is the default.
  const [showHints, setShowHints] = usePersistentFlag('navHints', false);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, String(!prev));
      } catch {
        // Preference just won't persist.
      }
      return !prev;
    });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (event.key === ',') {
        event.preventDefault();
        setActiveTab('settings');
        return;
      }
      const tab = SHORTCUT_TABS[Number(event.key) - 1];
      if (tab && /^[1-9]$/.test(event.key)) {
        event.preventDefault();
        setActiveTab(tab);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTab]);

  return (
    <nav
      aria-label={t('nav.main')}
      className={`shrink-0 flex flex-col border-r border-slate-800 bg-slate-900/60 transition-[width] duration-200 ${
        collapsed ? 'w-14' : 'w-60'
      }`}
    >
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-4">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label} className="px-2 space-y-1">
            {collapsed ? (
              groupIndex > 0 && <div className="mx-2 mb-3 border-t border-slate-800" aria-hidden />
            ) : (
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                {t(group.label)}
              </p>
            )}
            {group.items.map(({ tab, label, icon: Icon }) => {
              const isActive = activeTab === tab;
              const shortcut = t('nav.shortcut', { key: SHORTCUT_TABS.indexOf(tab) + 1 });
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={collapsed ? t(label) : undefined}
                  title={collapsed ? `${t(label)} (${shortcut})` : shortcut}
                  className={`group relative w-full flex rounded-xl text-sm outline-hidden transition-all focus-visible:ring-2 focus-visible:ring-accent-400 ${
                    collapsed ? 'items-center justify-center px-2.5 py-2' : 'items-start gap-2.5 px-2 py-2'
                  } ${
                    isActive
                      ? 'bg-accent-500/15 text-accent-100 ring-1 ring-inset ring-accent-400/20 shadow-sm shadow-accent-950/20'
                      : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-100'
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent-400" aria-hidden />
                  )}
                  <span
                    className={`flex shrink-0 items-center justify-center transition-colors ${
                      collapsed
                        ? ''
                        : isActive
                          ? 'h-8 w-8 rounded-lg bg-accent-400/15 text-accent-200'
                          : 'h-8 w-8 rounded-lg bg-slate-800/70 text-slate-400 group-hover:bg-slate-700/70 group-hover:text-slate-200'
                    }`}
                    aria-hidden
                  >
                    <Icon className="w-[18px] h-[18px]" />
                  </span>
                  {!collapsed && (
                    <span className="min-w-0 flex-1 pt-1 text-left">
                      <span className="block truncate font-medium leading-5">{t(label)}</span>
                      {showHints && (
                        <span
                          className={`mt-0.5 block whitespace-normal text-[11px] leading-[1.35] ${
                            isActive ? 'text-accent-200/75' : 'text-slate-400'
                          }`}
                          data-nav-hint={tab}
                        >
                          {t(`nav.hint.${tab}` as TranslationKey)}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="border-t border-slate-800 p-2 space-y-1">
        {!collapsed && (
          <button
            type="button"
            onClick={() => setShowHints(!showHints)}
            aria-pressed={showHints}
            className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-slate-400 outline-hidden hover:bg-slate-800/70 hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-accent-400"
          >
            {showHints ? <EyeOff className="h-4 w-4 shrink-0" /> : <Eye className="h-4 w-4 shrink-0" />}
            <span className="truncate">{showHints ? t('nav.hideHints') : t('nav.showHints')}</span>
          </button>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
          title={collapsed ? t('nav.expand') : t('nav.collapse')}
          className="w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-slate-400 outline-hidden hover:bg-slate-800/70 hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-accent-400"
        >
          {collapsed ? <ChevronsRight className="w-[18px] h-[18px] shrink-0" /> : <ChevronsLeft className="w-[18px] h-[18px] shrink-0" />}
          {!collapsed && <span className="truncate">{t('nav.collapseShort')}</span>}
        </button>
      </div>
    </nav>
  );
};
