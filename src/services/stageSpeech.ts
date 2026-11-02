import { create } from 'zustand';
import { api } from './api';
import { audioPlayer } from './audioPlayer';
import type { EmotionResult, SceneTurnMessage } from '../types';

/** The sentence the Stage voice is speaking right now, with who speaks and how it feels. */
export interface StageSpeechLine {
  /** Changes with every sentence (keeps the bubble's animation fresh). */
  id: number;
  speaker: string;
  role: SceneTurnMessage['sender_role'];
  text: string;
  emotion: EmotionResult | null;
}

interface StageSpeechState {
  line: StageSpeechLine | null;
}

export const useStageSpeech = create<StageSpeechState>(() => ({ line: null }));

/** After the last sentence the bubble stays a moment, so it can still be read. */
export const LINGER_MS = 1500;

const SENTENCE = /[^.!?…]+(?:[.!?…]+[”"')\]]*|$)/g;

/** Sentences of a spoken text, in order (no empty pieces). */
export function splitSentences(text: string): string[] {
  const plain = text.replace(/\s+/g, ' ').trim();
  const pieces = plain.match(SENTENCE)?.map((s) => s.trim()).filter(Boolean) ?? [];
  // Very short pieces ("Oh." "Hm!") join the next one; a bubble that flickers is no help.
  const joined: string[] = [];
  for (const piece of pieces) {
    const last = joined.at(-1);
    if (last !== undefined && last.length < 12) joined[joined.length - 1] = `${last} ${piece}`;
    else joined.push(piece);
  }
  return joined;
}

/**
 * When each sentence plays inside a clip from `start` to `end` (audio clock, seconds): the
 * clip's time shared by the sentences' length, as speech takes about as long as it has letters.
 */
export function sentenceTimeline(sentences: string[], start: number, end: number) {
  const total = sentences.reduce((sum, s) => sum + s.length, 0) || 1;
  const span = Math.max(0, end - start);
  let at = start;
  return sentences.map((text) => {
    const from = at;
    at += (span * text.length) / total;
    return { text, start: from, end: at };
  });
}

let session = 0;
let nextId = 1;
const timers = new Set<ReturnType<typeof setTimeout>>();
/** The clip scheduled last; clips play in order, so only its end removes the bubble. */
let lastClip = 0;

function later(ms: number, run: () => void) {
  const timer = setTimeout(() => {
    timers.delete(timer);
    run();
  }, Math.max(0, ms));
  timers.add(timer);
}

/** Removes the bubble and forgets what was planned (the voice stopped). */
export function clearStageSpeech() {
  session += 1;
  timers.forEach(clearTimeout);
  timers.clear();
  useStageSpeech.setState({ line: null });
}

/**
 * A clip of `message` (one part of its text) is scheduled from `start` to `end`: its sentences
 * show one after another while it plays; the feeling of each is read before it shows.
 */
export function scheduleSpeech(message: Pick<SceneTurnMessage, 'sender_name' | 'sender_role'>, text: string, start: number, end: number) {
  const current = session;
  const now = audioPlayer.now();
  const clip = ++lastClip;
  for (const sentence of sentenceTimeline(splitSentences(text), start, end)) {
    const emotion = api.classifyTextEmotion(sentence.text).catch(() => null);
    later((sentence.start - now) * 1000, () => {
      if (current !== session) return;
      void emotion.then((result) => {
        if (current !== session) return;
        useStageSpeech.setState({
          line: { id: nextId++, speaker: message.sender_name, role: message.sender_role, text: sentence.text, emotion: result ?? null },
        });
      });
    });
  }
  later((end - now) * 1000 + LINGER_MS, () => {
    // Only when nothing else was planned after this clip.
    if (current === session && clip === lastClip) useStageSpeech.setState({ line: null });
  });
}
