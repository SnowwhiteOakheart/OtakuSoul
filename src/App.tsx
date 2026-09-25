import { Header } from './components/Header';
import { ChatView } from './components/chat/ChatView';
import { SettingsView } from './components/settings/SettingsView';
import { StageView } from './components/stage/StageView';
import { CompanionView } from './components/companion/CompanionView';
import { useAppStore } from './store/useAppStore';
import './App.css';

export function App() {
  const { activeTab } = useAppStore();

  return (
    <div className="flex flex-col w-screen h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <Header />
      <main className="flex-1 flex overflow-hidden">
        {activeTab === 'chat' && <ChatView />}
        {activeTab === 'stage' && <StageView />}
        {activeTab === 'companion' && <CompanionView />}
        {activeTab === 'settings' && <SettingsView />}
      </main>
    </div>
  );
}

export default App;
