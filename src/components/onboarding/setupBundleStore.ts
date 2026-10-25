import { create } from 'zustand';
import { api } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { errorMessage } from '../../utils/errors';
import { DEFAULT_IMG_CONFIG } from '../settings/sections/ImageSettings';
import { downloadStarter } from './OnboardingParts';
import { withCardVoice } from '../../services/characterVoice';
import { DEFAULT_VOICE_DESCRIPTION } from '../../utils/setupBundle';
import type { RuntimeKind, StarterModel, TtsModelInfo, ImageModelInfo } from '../../types';

export type BundleKind = 'chat' | 'image' | 'tts';

export type PartStatus =
  | { phase: 'idle' }
  | { phase: 'runtime' }
  | { phase: 'download'; percent: number }
  | { phase: 'done' }
  | { phase: 'failed'; error: string };

/** A speech model and voice to give the chosen character once the wizard knows it. */
export interface PendingVoice {
  modelId: string;
  /** `''` for VoiceDesign: the character's own description is the voice. */
  voiceId: string;
}

interface BundleState {
  status: Record<BundleKind, PartStatus>;
  running: boolean;
  pendingVoice: PendingVoice | null;
  setStatus: (kind: BundleKind, status: PartStatus) => void;
  reset: () => void;
}

const idle = (): Record<BundleKind, PartStatus> => ({ chat: { phase: 'idle' }, image: { phase: 'idle' }, tts: { phase: 'idle' } });

/**
 * Progress of the "load everything" step of the first-run wizard. It lives outside the wizard's
 * steps, so going on while models download keeps the progress (and the voice to apply).
 */
export const useSetupBundle = create<BundleState>((set) => ({
  status: idle(),
  running: false,
  pendingVoice: null,
  setStatus: (kind, status) => set((s) => ({ status: { ...s.status, [kind]: status } })),
  reset: () => set({ status: idle(), running: false, pendingVoice: null }),
}));

/** What the user chose to download (null = left out). */
export interface BundleChoice {
  chat: StarterModel | null;
  image: ImageModelInfo | null;
  tts: { model: TtsModelInfo; voiceId: string } | null;
}

/** Installs the recommended build of a runtime unless one is installed. */
async function ensureRuntime(kind: RuntimeKind) {
  if (await api.getRuntime(kind).catch(() => null)) return;
  const variants = await api.listRuntimeVariants(kind);
  const variant = variants.find((v) => v.recommended) ?? variants[0];
  if (!variant) throw new Error(`no ${kind} runtime for this system`);
  await api.installRuntime(kind, variant.backend);
}

async function setUpChat(starter: StarterModel) {
  const { setStatus } = useSetupBundle.getState();
  setStatus('chat', { phase: 'runtime' });
  await ensureRuntime('llama');
  if (starter.file.runtime === 'prism') await ensureRuntime('prism');
  setStatus('chat', { phase: 'download', percent: 0 });
  const app = useAppStore.getState();
  const installed = app.scannedModels.find((m) => m.path.endsWith(starter.file.filename));
  if (installed) {
    await app.selectLocalModel(installed.path);
    if (starter.mmproj && !starter.mmproj_installed) {
      await app.downloadVisionProjector({ ...starter.mmproj, runtime: 'standard' }, installed.path);
    }
  } else {
    // Progress comes from the store (`downloadProgress`), as everywhere else.
    await downloadStarter(starter, true);
  }
  const after = useAppStore.getState();
  if (!after.serverConfig.model_path.endsWith(starter.file.filename)) {
    throw new Error(after.hfError || 'download failed');
  }
}

async function setUpImage(model: ImageModelInfo) {
  const { setStatus } = useSetupBundle.getState();
  setStatus('image', { phase: 'runtime' });
  await ensureRuntime('sd');
  if (!model.installed) {
    setStatus('image', { phase: 'download', percent: 0 });
    const unlisten = await api.onImageModelProgress((p) => {
      if (p.model_id === model.id) setStatus('image', { phase: 'download', percent: p.percent });
    });
    try {
      await api.downloadImageModel(model.id, false);
    } finally {
      unlisten();
    }
  }
  const app = useAppStore.getState();
  await app.saveImageGenConfig({ ...(app.imageGenConfig ?? DEFAULT_IMG_CONFIG), provider: 'local', local_model_id: model.id });
}

async function setUpTts(model: TtsModelInfo, voiceId: string) {
  const { setStatus } = useSetupBundle.getState();
  setStatus('tts', { phase: 'runtime' });
  await ensureRuntime('crisp');
  if (!model.installed) {
    setStatus('tts', { phase: 'download', percent: 0 });
    const unlisten = await api.onTtsModelProgress((p) => {
      if (p.model_id === model.id) setStatus('tts', { phase: 'download', percent: p.percent });
    });
    try {
      await api.downloadTtsModel(model.id);
    } finally {
      unlisten();
    }
  }
  useSetupBundle.setState({ pendingVoice: { modelId: model.id, voiceId } });
  // Finished after the wizard closed: the character is chosen by now.
  if (useAppStore.getState().onboardingCompleted) await applyPendingVoice();
}

/**
 * Downloads and sets up the chosen models one after another (chat first: the app needs it most).
 * A part that fails is marked and the others still run.
 */
export async function runBundle(choice: BundleChoice) {
  const store = useSetupBundle.getState();
  if (store.running) return;
  useSetupBundle.setState({ running: true });
  const steps: [BundleKind, (() => Promise<void>) | null][] = [
    ['chat', choice.chat && (() => setUpChat(choice.chat!))],
    ['image', choice.image && (() => setUpImage(choice.image!))],
    ['tts', choice.tts && (() => setUpTts(choice.tts!.model, choice.tts!.voiceId))],
  ];
  try {
    for (const [kind, step] of steps) {
      if (!step) continue;
      try {
        await step();
        store.setStatus(kind, { phase: 'done' });
      } catch (e) {
        store.setStatus(kind, { phase: 'failed', error: errorMessage(e) });
      }
    }
  } finally {
    useSetupBundle.setState({ running: false });
  }
}

/**
 * Gives the active character the downloaded speech model and voice (once; the wizard calls it
 * after the character step and at the end).
 */
export async function applyPendingVoice() {
  const { pendingVoice } = useSetupBundle.getState();
  const app = useAppStore.getState();
  const character = app.activeCharacter;
  if (!pendingVoice || !character) return;
  const base = withCardVoice(app.activeVoiceConfig ?? (await api.getCharacterVoiceConfig(character.id)), character);
  // VoiceDesign speaks with the description of the card (or the character's own one).
  const design = pendingVoice.voiceId === '';
  await app.saveVoiceConfigForCharacter(character.id, {
    ...base,
    engine: 'local',
    local_model_id: pendingVoice.modelId,
    voice_id: pendingVoice.voiceId,
    openai_instructions: design ? base.openai_instructions?.trim() || DEFAULT_VOICE_DESCRIPTION : base.openai_instructions,
  });
  useSetupBundle.setState({ pendingVoice: null });
}
