import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { ClockWidget } from './ClockWidget';
import { DiceRoller } from './DiceRoller';
import { EncounterTracker } from './EncounterTracker';
import { soundFx } from '../../services/soundFx';
import {
  Compass,
  Volume2,
  VolumeX,
  Flame,
  Plus,
  Edit3,
  Check,
  Radio,
} from 'lucide-react';

export const StageView = () => {
  const {
    stageState,
    fetchStageState,
    updateWorldState,
    setClockProgress,
    addClock,
    deleteClock,
  } = useAppStore();

  const [isEditingWorld, setIsEditingWorld] = useState(false);
  const [locationInput, setLocationInput] = useState('');
  const [weatherInput, setWeatherInput] = useState('');
  const [timeInput, setTimeInput] = useState('');
  const [dangerInput, setDangerInput] = useState(2);
  const [questInput, setQuestInput] = useState('');

  // Audio Ambiance state
  const [isAmbianceActive, setIsAmbianceActive] = useState(false);
  const [isMuted, setIsMuted] = useState(soundFx.getIsMuted());

  // New Clock Modal
  const [showClockModal, setShowClockModal] = useState(false);
  const [newClockName, setNewClockName] = useState('Verstärkung naht');
  const [newClockMax, setNewClockMax] = useState(6);
  const [newClockType, setNewClockType] = useState<'danger' | 'progress' | 'mystery'>('danger');

  useEffect(() => {
    fetchStageState();
  }, [fetchStageState]);

  useEffect(() => {
    if (stageState?.world) {
      setLocationInput(stageState.world.location);
      setWeatherInput(stageState.world.weather);
      setTimeInput(stageState.world.time_of_day);
      setDangerInput(stageState.world.danger_level);
      setQuestInput(stageState.world.active_quest);
    }
  }, [stageState?.world]);

  const handleSaveWorld = () => {
    updateWorldState({
      location: locationInput.trim(),
      weather: weatherInput.trim(),
      time_of_day: timeInput.trim(),
      danger_level: dangerInput,
      active_quest: questInput.trim(),
    });
    setIsEditingWorld(false);
  };

  const handleToggleAmbiance = () => {
    const active = soundFx.toggleCampfireAmbiance();
    setIsAmbianceActive(active);
  };

  const handleToggleMute = () => {
    const nextMute = !isMuted;
    soundFx.setMuted(nextMute);
    setIsMuted(nextMute);
    if (nextMute) {
      setIsAmbianceActive(false);
    }
  };

  const handleCreateClock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClockName.trim()) return;
    addClock({
      id: `clock_${Date.now()}`,
      name: newClockName.trim(),
      current: 0,
      max: newClockMax,
      clock_type: newClockType,
    });
    setShowClockModal(false);
    setNewClockName('');
  };

  const world = stageState?.world;

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-y-auto p-4 lg:p-6 space-y-6">
      {/* 1. World & Atmosphere Banner */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900/90 via-purple-950/20 to-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur relative">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-3.5 mb-3.5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Compass className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                Soul Stage: Spielleiter & Abenteuer-Bühne
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-900/60 border border-purple-500/30 text-purple-300 font-mono">
                  Tabletop Core
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Atmosphäre, Kampagnen-Clocks, Deterministische Würfel & Taktischer Kampf
              </p>
            </div>
          </div>

          {/* Sound Synthesizer Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleAmbiance}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                isAmbianceActive
                  ? 'bg-amber-600/30 text-amber-200 border-amber-500/50 shadow-md shadow-amber-950/40'
                  : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${isAmbianceActive ? 'animate-spin' : ''}`} />
              <span>{isAmbianceActive ? 'Lagerfeuer-Atmosphäre Aktiv' : 'Atmosphäre Starten'}</span>
              {isAmbianceActive && (
                <span className="flex gap-0.5 items-end h-3">
                  <span className="w-0.5 h-2 bg-amber-400 animate-pulse" />
                  <span className="w-0.5 h-3 bg-amber-400 animate-pulse delay-75" />
                  <span className="w-0.5 h-1.5 bg-amber-400 animate-pulse delay-150" />
                </span>
              )}
            </button>

            <button
              onClick={handleToggleMute}
              className={`p-2 rounded-xl border transition ${
                isMuted
                  ? 'bg-rose-950/40 text-rose-400 border-rose-500/40'
                  : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:text-white'
              }`}
              title={isMuted ? 'Ton aktivieren' : 'Stummschalten'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setIsEditingWorld(!isEditingWorld)}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title="Weltzustand bearbeiten"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* World State Overview or Editor */}
        {!isEditingWorld ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/60">
              <span className="text-[11px] text-slate-400 block mb-0.5">Aktueller Ort</span>
              <span className="font-bold text-slate-200 line-clamp-1">
                {world?.location || 'Unbekannt'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/60">
              <span className="text-[11px] text-slate-400 block mb-0.5">Tageszeit & Wetter</span>
              <span className="font-bold text-purple-200 line-clamp-1">
                {world?.time_of_day} • {world?.weather}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/60 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 block mb-0.5">Gefahrenstufe</span>
                <span className="font-bold text-slate-200">Stufe {world?.danger_level} von 5</span>
              </div>
              <div className="flex gap-1 text-amber-500">
                {Array.from({ length: world?.danger_level || 1 }).map((_, i) => (
                  <Flame key={i} className="w-3.5 h-3.5 fill-amber-500/40" />
                ))}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/60 sm:col-span-2 lg:col-span-1">
              <span className="text-[11px] text-slate-400 block mb-0.5">Aktuelle Quest / Fokus</span>
              <span className="font-semibold text-slate-300 line-clamp-1">
                {world?.active_quest}
              </span>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-slate-950/80 border border-purple-500/40 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Ort</label>
                <input
                  type="text"
                  value={locationInput}
                  onChange={(e) => setLocationInput(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Tageszeit</label>
                <input
                  type="text"
                  value={timeInput}
                  onChange={(e) => setTimeInput(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Wetter</label>
                <input
                  type="text"
                  value={weatherInput}
                  onChange={(e) => setWeatherInput(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="text-[11px] text-slate-400 block mb-1">Quest / Ziel</label>
                <input
                  type="text"
                  value={questInput}
                  onChange={(e) => setQuestInput(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Gefahrenstufe (1-5)
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={dangerInput}
                  onChange={(e) => setDangerInput(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setIsEditingWorld(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSaveWorld}
                className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" />
                Übernehmen
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Middle Grid: Campaign Clocks & Dice Roller */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Campaign Clocks */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100">Kampagnen-Clocks (Spannungs-Uhren)</h3>
              <p className="text-[11px] text-slate-400">
                Klicke auf Segmente, um Fortschritt oder Bedrohung zu steigern
              </p>
            </div>
            <button
              onClick={() => setShowClockModal(true)}
              className="px-3 py-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 text-xs font-semibold flex items-center gap-1.5 border border-purple-500/40 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Neue Uhr
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {stageState?.clocks.map((clock) => (
              <ClockWidget
                key={clock.id}
                clock={clock}
                onUpdateProgress={(id, val) => setClockProgress(id, val)}
                onDelete={(id) => deleteClock(id)}
              />
            ))}

            {(!stageState?.clocks || stageState.clocks.length === 0) && (
              <div className="col-span-full p-8 text-center text-xs text-slate-500 italic">
                Keine aktiven Kampagnen-Clocks vorhanden.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Dice Roller Station */}
        <DiceRoller />
      </div>

      {/* 3. Bottom: Tactical Encounter & Combat Tracker */}
      <EncounterTracker />

      {/* Modal: New Clock */}
      {showClockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateClock}
            className="w-full max-w-sm p-4 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl space-y-3"
          >
            <h4 className="text-xs font-bold text-slate-100">Neue Kampagnen-Uhr anlegen</h4>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Name der Uhr</label>
              <input
                type="text"
                value={newClockName}
                onChange={(e) => setNewClockName(e.target.value)}
                placeholder="Verstärkung der Wachen, Giftwirkung..."
                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Segmente</label>
                <select
                  value={newClockMax}
                  onChange={(e) => setNewClockMax(Number(e.target.value))}
                  className="w-full px-2 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none"
                >
                  <option value={4}>4 Segmente</option>
                  <option value={6}>6 Segmente</option>
                  <option value={8}>8 Segmente</option>
                  <option value={12}>12 Segmente</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Typ</label>
                <select
                  value={newClockType}
                  onChange={(e) => setNewClockType(e.target.value as any)}
                  className="w-full px-2 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none"
                >
                  <option value="danger">Gefahr (Rot)</option>
                  <option value="progress">Fortschritt (Gold)</option>
                  <option value="mystery">Mysterium (Lila)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClockModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold"
              >
                Uhr Erstellen
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
