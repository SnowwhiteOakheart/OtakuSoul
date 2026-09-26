import { lazy, Suspense } from 'react';
import { Header } from './components/Header';
import { SafetyCountdownBanner } from './components/companion/SafetyCountdownBanner';
import { useAppStore } from './store/useAppStore';
import './App.css';

const ChatView = lazy(() => import('./components/chat/ChatView').then((module) => ({ default: module.ChatView })));
const CharacterLibraryView = lazy(() => import('./components/characters/CharacterLibraryView').then((module) => ({ default: module.CharacterLibraryView })));
const LorebookView = lazy(() => import('./components/lorebook/LorebookView').then((module) => ({ default: module.LorebookView })));
const SettingsView = lazy(() => import('./components/settings/SettingsView').then((module) => ({ default: module.SettingsView })));
const StageView = lazy(() => import('./components/stage/StageView').then((module) => ({ default: module.StageView })));
const CompanionView = lazy(() => import('./components/companion/CompanionView').then((module) => ({ default: module.CompanionView })));

export function App() {
  const { activeTab } = useAppStore();

  return (
    <div className="flex flex-col w-screen h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans relative">
      <Header />
      <main className="flex-1 flex overflow-hidden">
        <Suspense fallback={<div className="flex-1 grid place-items-center text-sm text-purple-300">Ansicht wird geladen…</div>}>
          {activeTab === 'chat' && <ChatView />}
          {activeTab === 'characters' && <CharacterLibraryView />}
          {activeTab === 'lorebooks' && <LorebookView />}
          {activeTab === 'stage' && <StageView />}
          {activeTab === 'companion' && <CompanionView />}
          {activeTab === 'settings' && <SettingsView />}
        </Suspense>
      </main>
      <SafetyCountdownBanner />
    </div>
  );
}

export default App;
