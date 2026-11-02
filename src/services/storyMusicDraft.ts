import { MUSIC_MOODS, isMusicMood, type MusicMood } from './stageMusic';

/**
 * The music a new story asks for (`extensions.otakusoul_music`, `docs/stage_music.md`): a sound
 * of the whole story and one ACE-Step caption per mood. Captions are English, the language
 * ACE-Step understands best.
 */
export interface StoryMusicDraft {
  style: string;
  moods: Partial<Record<MusicMood, string>>;
  /** Soft wordless singing in the background of the quiet moods. */
  vocals: boolean;
}

/** Story genres with a music suggestion of their own (the wizard's genres). */
export type MusicGenre = 'fantasy' | 'adventure' | 'slice_of_life' | 'comedy' | 'romance' | 'mystery' | 'scifi' | 'horror';

/** A ready-made suggestion per genre, used until the chat model suggests a better one. */
export const GENRE_MUSIC: Record<MusicGenre, Omit<StoryMusicDraft, 'vocals'>> = {
  fantasy: {
    style: 'orchestral fantasy, celtic harp, strings, wooden flute, warm and wondrous',
    moods: {
      calm: 'gentle harp and flute over soft strings, peaceful village at dawn, slow tempo',
      tavern: 'lively folk band, fiddle, lute and hand drum, cheerful inn, dancing rhythm',
      adventure: 'sweeping strings and horns, open road through green hills, heroic, mid tempo',
      mystery: 'celesta and low strings, ancient ruins at night, hushed, slow',
      combat: 'driving orchestral percussion, brass stabs, fast strings, urgent battle',
    },
  },
  adventure: {
    style: 'cinematic adventure score, strings, brass, ethnic percussion, bold and bright',
    moods: {
      calm: 'soft guitar and strings by the campfire, warm night, slow tempo',
      adventure: 'soaring brass theme, galloping strings, wide landscapes, energetic',
      tension: 'pulsing low strings, ticking percussion, narrow escape, suspense',
      combat: 'pounding drums, brass fanfares, fast strings, action chase',
    },
  },
  slice_of_life: {
    style: 'warm acoustic pop instrumental, piano, acoustic guitar, light percussion, cozy',
    moods: {
      calm: 'soft piano and acoustic guitar, sunny afternoon in a small town, relaxed',
      tavern: 'jazzy cafe trio, brushed drums, upright bass, cozy coffee shop',
      romance: 'tender piano melody with light strings, shy feelings, gentle tempo',
      sorrow: 'solo piano, rain on the window, quiet and wistful',
    },
  },
  comedy: {
    style: 'playful orchestral comedy, pizzicato strings, bassoon, xylophone, bouncy',
    moods: {
      calm: 'light pizzicato and flute, sunny everyday mischief, easy tempo',
      tavern: 'bouncy ragtime piano and clarinet, crowded festival, cheerful',
      tension: 'sneaky pizzicato and muted brass, tiptoeing, comic suspense',
      combat: 'frantic brass and xylophone, slapstick chase, fast tempo',
    },
  },
  romance: {
    style: 'romantic chamber music, piano, strings, soft woodwinds, tender and warm',
    moods: {
      calm: 'soft piano and cello, quiet evening walk, slow tempo',
      romance: 'heartfelt piano and violin duet, blossoms in the wind, swelling strings',
      tension: 'hesitant piano with trembling strings, unspoken words, restrained',
      sorrow: 'lonely violin over sparse piano, farewell at the station, slow',
    },
  },
  mystery: {
    style: 'noir mystery score, muted piano, upright bass, low clarinet, smoky and tense',
    moods: {
      calm: 'muted piano and brushed drums, quiet office at night, slow tempo',
      mystery: 'celesta, low clarinet and sparse piano, clues in the dark, hushed',
      tension: 'pulsing double bass and ticking clock percussion, closing in, suspense',
      sorrow: 'lonely saxophone over soft piano, rain-soaked street, melancholic',
    },
  },
  scifi: {
    style: 'atmospheric synthwave and ambient score, analog synths, pads, electronic pulses',
    moods: {
      calm: 'warm synth pads and soft arpeggios, drifting through space, slow tempo',
      mystery: 'glassy synth textures and distant pings, derelict station, eerie',
      tension: 'throbbing bass synth and ticking sequencer, alarm lights, suspense',
      combat: 'aggressive synth bass, fast electronic drums, laser fight, driving',
      boss: 'massive distorted synths and choir pads, colossal machine, epic',
    },
  },
  horror: {
    style: 'dark ambient horror score, drones, prepared piano, dissonant strings, unsettling',
    moods: {
      calm: 'faint music box and soft drone, empty house at dusk, uneasy calm',
      mystery: 'creaking strings and whispers of wind, dark corridor, slow and eerie',
      tension: 'rising dissonant strings and heartbeat drum, something is near',
      combat: 'violent string stabs and pounding low drums, desperate struggle',
      sorrow: 'detuned piano and cold drone, loss in the dark, slow',
    },
  },
};

/** Lyrics for soft wordless singing; few tags, so ACE-Step doesn't sing them. */
export const BACKGROUND_VOCALS = '[Intro]\n[Verse]\nooh, aah\nooh, aah\n[Outro]';
const VOCAL_MOODS: MusicMood[] = ['calm', 'mystery', 'romance', 'sorrow'];
const VOCAL_CAPTION = 'soft wordless vocals far in the background';
const MAX_CAPTION = 300;

export const genreMusic = (genre: MusicGenre): StoryMusicDraft => ({
  style: GENRE_MUSIC[genre].style,
  moods: { ...GENRE_MUSIC[genre].moods },
  vocals: false,
});

/** The `otakusoul_music` section of the story (set = the story's id); null without moods. */
export function musicSection(draft: StoryMusicDraft, set: string): Record<string, unknown> | null {
  const moods: Record<string, Record<string, unknown>> = {};
  for (const mood of MUSIC_MOODS) {
    const caption = draft.moods[mood]?.trim();
    if (!caption) continue;
    moods[mood] =
      draft.vocals && VOCAL_MOODS.includes(mood)
        ? { caption: `${caption}, ${VOCAL_CAPTION}`, lyrics: BACKGROUND_VOCALS, vocal_language: 'en' }
        : { caption };
  }
  if (Object.keys(moods).length === 0) return null;
  return { set, style: draft.style.trim(), moods };
}

export interface StoryContext {
  genre: string;
  title: string;
  situation: string;
  location: string;
  party: string[];
}

/** Prompt for the chat model: one JSON object with the sound and a caption per mood. */
export function musicPrompt(context: StoryContext, moods: MusicMood[]) {
  const system = [
    'You write prompts for ACE-Step, a music generator, for the background music of a role-play story.',
    'Answer with one JSON object only, no other text:',
    '{"style": "<the sound of the whole story>", "moods": {"<mood>": "<caption>"}}',
    'Write in English. "style": genre, main instruments and character, at most 15 words.',
    'Each caption: instruments, atmosphere, a picture of the scene and the tempo, at most 25 words.',
    'Instrumental music only: no lyrics, no singer, no artist or song names.',
    `Write a caption for exactly these moods: ${moods.join(', ')}.`,
  ].join('\n');
  const user = [
    `Genre: ${context.genre}`,
    `Title: ${context.title}`,
    context.location && `Place: ${context.location}`,
    context.situation && `Situation: ${context.situation}`,
    context.party.length > 0 && `Characters: ${context.party.join(', ')}`,
  ]
    .filter(Boolean)
    .join('\n');
  return { system, user };
}

const clean = (value: unknown) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_CAPTION) : '';

/**
 * Reads the model's answer: the first JSON object in it (code fences and thoughts around it are
 * fine). Unknown moods are dropped; null when nothing usable is in it.
 */
export function parseMusicSuggestion(text: string): Omit<StoryMusicDraft, 'vocals'> | null {
  const body = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const { style, moods } = parsed as { style?: unknown; moods?: unknown };
  const captions: Partial<Record<MusicMood, string>> = {};
  if (moods && typeof moods === 'object') {
    for (const [mood, caption] of Object.entries(moods as Record<string, unknown>)) {
      const key = mood.trim().toLowerCase();
      const value = clean(caption);
      if (isMusicMood(key) && value) captions[key] = value;
    }
  }
  if (Object.keys(captions).length === 0) return null;
  return { style: clean(style), moods: captions };
}
