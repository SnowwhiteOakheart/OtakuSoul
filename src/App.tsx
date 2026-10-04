import { lazy, Suspense, useState } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { SafetyCountdownBanner } from './components/companion/SafetyCountdownBanner';
import { useAppStore } from './store/useAppStore';
import { useTabHistory } from './hooks/useTabHistory';
import { useTranslation } from './i18n';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { FeedbackHost } from './components/ui/feedback';
import { CommandPalette } from './components/CommandPalette';
import { ViewSkeleton } from './components/ui';
import './App.css';

const ChatView = lazy(() => import('./components/chat/ChatView').then((module) => ({ default: module.ChatView })));
const CharacterLibraryView = lazy(() => import('./components/characters/CharacterLibraryView').then((module) => ({ default: module.CharacterLibraryView })));
const LorebookView = lazy(() => import('./components/lorebook/LorebookView').then((module) => ({ default: module.LorebookView })));
const SettingsView = lazy(() => import('./components/settings/SettingsView').then((module) => ({ default: module.SettingsView })));
const StageView = lazy(() => import('./components/stage/StageView').then((module) => ({ default: module.StageView })));
const CompanionView = lazy(() => import('./components/companion/CompanionView').then((module) => ({ default: module.CompanionView })));
const HubView = lazy(() => import('./components/hub/HubView').then((module) => ({ default: module.HubView })));
const IntegrationsView = lazy(() => import('./components/integrations/IntegrationsView').then((module) => ({ default: module.IntegrationsView })));
const FloatingCompanionOverlay = lazy(() => import('./components/companion/FloatingCompanionOverlay').then((module) => ({ default: module.FloatingCompanionOverlay })));
const CharacterAiAssistantModal = lazy(() => import('./components/characters/CharacterAiAssistantModal').then((module) => ({ default: module.CharacterAiAssistantModal })));
const LogViewerModal = lazy(() => import('./components/logging/LogViewerModal').then((module) => ({ default: module.LogViewerModal })));
const FirstRunWizard = lazy(() => import('./components/onboarding/FirstRunWizard').then((module) => ({ default: module.FirstRunWizard })));
const PersonaManagerModal = lazy(() => import('./components/characters/PersonaManagerModal').then((module) => ({ default: module.PersonaManagerModal })));
const UpdaterModal = lazy(() => import('./components/updater/UpdaterModal').then((module) => ({ default: module.UpdaterModal })));

export function App() {
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const activeTab = useAppStore((s) => s.activeTab);
  const onboardingCompleted = useAppStore((s) => s.onboardingCompleted);
  const isPersonaManagerOpen = useAppStore((s) => s.isPersonaManagerOpen);
  const setIsPersonaManagerOpen = useAppStore((s) => s.setIsPersonaManagerOpen);
  const { t } = useTranslation();
  const isOverlayMode =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('overlay') === 'true';
  useTabHistory(!isOverlayMode);

  if (isOverlayMode) {
    return (
      <div className="w-screen h-screen bg-transparent overflow-hidden font-sans">
        <Suspense fallback={null}>
          <FloatingCompanionOverlay />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-screen h-screen bg-app text-slate-100 overflow-hidden font-sans relative">
      <Header onOpenCommandPalette={() => setIsCommandPaletteOpen(true)} />
      <div className="flex-1 flex min-h-0">
      <Sidebar />
      <main className="flex-1 flex min-w-0 overflow-hidden">
        <ErrorBoundary resetKey={activeTab}>
          <Suspense fallback={<ViewSkeleton label={t('common.loadingView')} />}>
            {activeTab === 'chat' && <ChatView />}
            {activeTab === 'characters' && <CharacterLibraryView />}
            {activeTab === 'hub' && <HubView />}
            {activeTab === 'lorebooks' && <LorebookView />}
            {activeTab === 'stage' && <StageView />}
            {activeTab === 'companion' && <CompanionView />}
            {activeTab === 'integrations' && <IntegrationsView />}
            {activeTab === 'settings' && <SettingsView />}
          </Suspense>
        </ErrorBoundary>
      </main>
      </div>
      <SafetyCountdownBanner />
      <Suspense fallback={null}>
        <CharacterAiAssistantModal />
        <LogViewerModal />
        <UpdaterModal />
        {isPersonaManagerOpen && <PersonaManagerModal onClose={() => setIsPersonaManagerOpen(false)} />}
        {!onboardingCompleted && <FirstRunWizard />}
      </Suspense>
      <FeedbackHost />
      <CommandPalette
        open={isCommandPaletteOpen}
        onOpen={() => setIsCommandPaletteOpen(true)}
        onClose={() => setIsCommandPaletteOpen(false)}
      />
    </div>
  );
}

export default App;
