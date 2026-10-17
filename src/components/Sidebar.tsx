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
      className={`relative isolate shrink-0 flex flex-col overflow-hidden border-r border-slate-800/80 bg-linear-to-b from-slate-900/95 via-slate-900/80 to-slate-950/90 shadow-xl shadow-black/10 transition-[width] duration-200 ${
        collapsed ? 'w-14' : 'w-60'
      }`}
    >
      <div
        className="pointer-events-none absolute -top-20 left-1/2 -z-10 h-64 w-64 -translate-x-1/2 rounded-full bg-accent-500/10 blur-3xl"
        aria-hidden
      />
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-3">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div
            key={group.label}
            className={
              collapsed
                ? 'px-2 space-y-1'
                : `mx-2 rounded-2xl border border-slate-800/60 bg-slate-950/20 p-1.5 shadow-sm shadow-black/5 ${
                    showHints ? 'space-y-1' : 'space-y-0.5'
                  }`
            }
          >
            {collapsed ? (
              groupIndex > 0 && <div className="mx-2 mb-3 border-t border-slate-800" aria-hidden />
            ) : (
              <p className="flex items-center gap-2 px-2 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                <span>{t(group.label)}</span>
                <span className="h-px flex-1 bg-linear-to-r from-slate-700/70 to-transparent" aria-hidden />
              </p>
            )}
            {group.items.map(({ tab, label, icon: Icon }) => {
              const isActive = activeTab === tab;
              const index = SHORTCUT_TABS.indexOf(tab);
              const shortcut = tab === 'settings' ? t('nav.shortcut', { key: ',' }) : index < 9 ? t('nav.shortcut', { key: index + 1 }) : '';
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={collapsed ? t(label) : undefined}
                  title={collapsed ? (shortcut ? `${t(label)} (${shortcut})` : t(label)) : shortcut || undefined}
                  className={`group relative w-full flex rounded-xl text-sm outline-hidden transition-all focus-visible:ring-2 focus-visible:ring-accent-400 ${
                    collapsed
                      ? 'items-center justify-center px-2.5 py-2'
                      : `items-start gap-2.5 px-2 ${showHints ? 'py-2' : 'py-1.5'}`
                  } ${
                    isActive
                      ? 'border border-accent-400/30 bg-linear-to-r from-accent-600/30 via-accent-500/15 to-indigo-500/10 text-accent-100 shadow-md shadow-accent-950/25'
                      : 'border border-transparent text-slate-400 hover:border-slate-700/60 hover:bg-slate-800/70 hover:text-slate-100 hover:shadow-sm'
                  }`}
                >
                  {isActive && (
                    <>
                      <span className="absolute -left-px top-2 bottom-2 w-0.5 rounded-full bg-accent-300 shadow-[0_0_10px_var(--theme-accent)]" aria-hidden />
                      <span className="absolute inset-x-7 top-0 h-px bg-linear-to-r from-transparent via-accent-300/70 to-transparent" aria-hidden />
                    </>
                  )}
                  <span
                    className={`flex shrink-0 items-center justify-center transition-all ${
                      collapsed
                        ? isActive
                          ? 'text-accent-200 drop-shadow-[0_0_6px_var(--theme-accent)]'
                          : ''
                        : isActive
                          ? 'h-8 w-8 rounded-lg border border-accent-300/35 bg-linear-to-br from-accent-500 to-indigo-600 text-white shadow-md shadow-accent-950/50'
                          : 'h-8 w-8 rounded-lg border border-slate-700/50 bg-slate-800/80 text-slate-400 shadow-inner group-hover:-translate-y-0.5 group-hover:border-accent-500/30 group-hover:text-slate-200'
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

      <div className="relative border-t border-slate-800/80 bg-slate-950/25 p-2 space-y-1 backdrop-blur-sm">
        <span className="absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-accent-400/35 to-transparent" aria-hidden />
        {!collapsed && (
          <button
            type="button"
            onClick={() => setShowHints(!showHints)}
            aria-pressed={showHints}
            className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-slate-400 outline-hidden transition-colors hover:bg-slate-800/70 hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-accent-400"
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
          className="w-full flex items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 text-sm text-slate-400 outline-hidden transition-colors hover:border-slate-700/60 hover:bg-slate-800/70 hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-accent-400"
        >
          {collapsed ? <ChevronsRight className="w-[18px] h-[18px] shrink-0" /> : <ChevronsLeft className="w-[18px] h-[18px] shrink-0" />}
          {!collapsed && <span className="truncate">{t('nav.collapseShort')}</span>}
        </button>
      </div>
    </nav>
  );
};
