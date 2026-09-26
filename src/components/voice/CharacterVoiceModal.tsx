import { useState, useEffect } from 'react';
import { X, Play, Save } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../services/api';
import { TtsEngine, TtsFilterMode, VoiceConfig, ScannedVoice } from '../../types';
import { audioPlayer } from '../../services/audioPlayer';

interface CharacterVoiceModalProps {
  onClose: () => void;
}

export function CharacterVoiceModal({ onClose }: CharacterVoiceModalProps) {
  const { activeCharacter, activeVoiceConfig, saveVoiceConfigForCharacter } = useAppStore();
  
  const [engine, setEngine] = useState<TtsEngine>('disabled');
  const [voiceId, setVoiceId] = useState<string>('');
  const [rate, setRate] = useState<number>(0);
  const [pitch, setPitch] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0);
  const [filterMode, setFilterMode] = useState<TtsFilterMode>('dialogue_only');
  const [customRegex, setCustomRegex] = useState('');
  
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState('');
  const [openaiEndpoint, setOpenaiEndpoint] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [openaiModel, setOpenaiModel] = useState('');

  const [availableVoices, setAvailableVoices] = useState<ScannedVoice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (activeVoiceConfig) {
      setEngine(activeVoiceConfig.engine);
      setVoiceId(activeVoiceConfig.voice_id);
      setRate(parseInt(activeVoiceConfig.rate.replace('%', ''), 10) || 0);
      setPitch(parseInt(activeVoiceConfig.pitch.replace('Hz', ''), 10) || 0);
      setVolume(parseInt(activeVoiceConfig.volume.replace('%', ''), 10) || 0);
      setFilterMode(activeVoiceConfig.filter_mode);
      setCustomRegex(activeVoiceConfig.custom_regex);
      setElevenLabsApiKey(activeVoiceConfig.elevenlabs_api_key);
      setOpenaiEndpoint(activeVoiceConfig.openai_endpoint);
      setOpenaiApiKey(activeVoiceConfig.openai_api_key);
      setOpenaiModel(activeVoiceConfig.openai_model);
    }
  }, [activeVoiceConfig]);

  useEffect(() => {
    async function loadVoices() {
      if (engine === 'disabled') return;
      setIsLoadingVoices(true);
      try {
        const voices = await api.listAvailableVoices(engine);
        setAvailableVoices(voices);
        
        // Auto-select first if none selected and voices available
        if (voices.length > 0 && (!voiceId || !voices.find(v => v.id === voiceId))) {
          setVoiceId(voices[0].id);
        }
      } catch (error) {
        console.error('Failed to load voices:', error);
      } finally {
        setIsLoadingVoices(false);
      }
    }
    loadVoices();
  }, [engine]);

  const handleSave = async () => {
    if (!activeCharacter) return;
    
    const config: VoiceConfig = {
      engine,
      voice_id: voiceId,
      rate: `${rate >= 0 ? '+' : ''}${rate}%`,
      pitch: `${pitch >= 0 ? '+' : ''}${pitch}Hz`,
      volume: `${volume >= 0 ? '+' : ''}${volume}%`,
      filter_mode: filterMode,
      custom_regex: customRegex,
      elevenlabs_api_key: elevenLabsApiKey,
      openai_endpoint: openaiEndpoint,
      openai_api_key: openaiApiKey,
      openai_model: openaiModel,
    };

    await saveVoiceConfigForCharacter(activeCharacter.id, config);
    onClose();
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const config: VoiceConfig = {
        engine,
        voice_id: voiceId,
        rate: `${rate >= 0 ? '+' : ''}${rate}%`,
        pitch: `${pitch >= 0 ? '+' : ''}${pitch}Hz`,
        volume: `${volume >= 0 ? '+' : ''}${volume}%`,
        filter_mode: filterMode,
        custom_regex: customRegex,
        elevenlabs_api_key: elevenLabsApiKey,
        openai_endpoint: openaiEndpoint,
        openai_api_key: openaiApiKey,
        openai_model: openaiModel,
      };
      
      const testText = "Hallo! Wie geht es dir heute? Das ist ein Test meiner Stimme.";
      const audioUrl = await api.synthesizeSpeech(testText, config);
      await audioPlayer.playDataUrl(audioUrl);
    } catch (e) {
      console.error('Test failed:', e);
    } finally {
      setIsTesting(false);
    }
  };

  const groupedVoices = availableVoices.reduce((acc, voice) => {
    let group = 'Andere';
    const loc = voice.locale.toLowerCase();
    if (loc.includes('de')) group = 'Deutsch';
    else if (loc.includes('ja')) group = 'Japanisch';
    else if (loc.includes('en')) group = 'Englisch';
    
    if (!acc[group]) acc[group] = [];
    acc[group].push(voice);
    return acc;
  }, {} as Record<string, ScannedVoice[]>);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl shadow-2xl w-[600px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
          <h2 className="text-xl font-semibold text-slate-100">Stimme anpassen</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">TTS Engine</label>
              <select
                value={engine}
                onChange={(e) => setEngine(e.target.value as TtsEngine)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 outline-none focus:border-purple-500/50"
              >
                <option value="disabled">Deaktiviert</option>
                <option value="edge">Edge-TTS (Kostenlos)</option>
                <option value="elevenlabs">ElevenLabs</option>
                <option value="openai">OpenAI / Lokal (VITS)</option>
              </select>
            </div>

            {engine !== 'disabled' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Stimme</label>
                  {isLoadingVoices ? (
                    <div className="text-sm text-slate-400">Stimmen werden geladen...</div>
                  ) : (
                    <select
                      value={voiceId}
                      onChange={(e) => setVoiceId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 outline-none focus:border-purple-500/50"
                    >
                      {Object.entries(groupedVoices).map(([group, voices]) => (
                        <optgroup key={group} label={group}>
                          {voices.map(v => (
                            <option key={v.id} value={v.id}>{v.name} ({v.gender})</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1 flex justify-between">
                      <span>Geschwindigkeit (Rate)</span>
                      <span>{rate}%</span>
                    </label>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={rate}
                      onChange={(e) => setRate(Number(e.target.value))}
                      className="w-full accent-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1 flex justify-between">
                      <span>Tonhöhe (Pitch)</span>
                      <span>{pitch}Hz</span>
                    </label>
                    <input
                      type="range"
                      min="-20"
                      max="20"
                      value={pitch}
                      onChange={(e) => setPitch(Number(e.target.value))}
                      className="w-full accent-purple-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Filter Modus</label>
                    <select
                      value={filterMode}
                      onChange={(e) => setFilterMode(e.target.value as TtsFilterMode)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 outline-none focus:border-purple-500/50"
                    >
                      <option value="all">Alles vorlesen</option>
                      <option value="dialogue_only">Nur Dialog (in Anführungszeichen)</option>
                      <option value="strip_actions">Aktionen (zwischen Sternchen) entfernen</option>
                    </select>
                  </div>
                </div>

                {engine === 'elevenlabs' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">API Key</label>
                    <input
                      type="password"
                      value={elevenLabsApiKey}
                      onChange={(e) => setElevenLabsApiKey(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 outline-none focus:border-purple-500/50"
                      placeholder="sk-..."
                    />
                  </div>
                )}

                {engine === 'openai' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">API Endpoint</label>
                      <input
                        type="text"
                        value={openaiEndpoint}
                        onChange={(e) => setOpenaiEndpoint(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 outline-none focus:border-purple-500/50"
                        placeholder="http://127.0.0.1:5000/v1"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Model</label>
                        <input
                          type="text"
                          value={openaiModel}
                          onChange={(e) => setOpenaiModel(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 outline-none focus:border-purple-500/50"
                          placeholder="tts-1"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">API Key</label>
                        <input
                          type="password"
                          value={openaiApiKey}
                          onChange={(e) => setOpenaiApiKey(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 outline-none focus:border-purple-500/50"
                          placeholder="sk-..."
                        />
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 flex justify-between bg-slate-900">
          <button
            onClick={handleTest}
            disabled={engine === 'disabled' || isTesting}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            {isTesting ? 'Testet...' : 'Testen'}
          </button>
          
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 hover:bg-slate-800 text-slate-300 rounded-lg transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors shadow-lg shadow-purple-500/20"
            >
              <Save className="w-4 h-4" />
              Speichern
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
