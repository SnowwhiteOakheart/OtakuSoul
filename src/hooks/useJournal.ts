import { useEffect } from 'react';
import { api } from '../services/api';
import { translate } from '../i18n';
import { useAppStore } from '../store/useAppStore';
import { llmTarget } from '../store/helpers';
import { toast } from '../components/ui/feedback';
import { presentedAs } from '../utils/groupChat';
import { dayPeriod, eveningCheckInInstruction, eveningDue, monthPeriod, plansForTomorrow, type JournalPeriod } from '../utils/journal';
import type { JournalOutcome } from '../types';

const FIRST_CHECK_MS = 30_000;
const CHECK_INTERVAL_MS = 5 * 60_000;
/** After a failed attempt the same entry is tried again at the earliest this much later. */
const RETRY_AFTER_MS = 30 * 60_000;

/** Entries handled in this run (written or already there), and failed ones by time. */
const done = new Set<string>();
const failedAt = new Map<string, number>();

/** Whether the AI may be used now: set up, ready and not busy. */
function aiReady(): boolean {
  const state = useAppStore.getState();
  if (!state.settingsLoaded || !state.onboardingCompleted || state.isGenerating) return false;
  return state.selectedBackend !== 'local' || state.serverStatus.state === 'running';
}

/**
 * Writes one journal entry of the open chat's character for `period`; `replace` rewrites an
 * existing one (from the diary tab). The character's chats of the period are what it reads.
 */
export async function writeJournal(period: JournalPeriod, replace = false): Promise<JournalOutcome | null> {
  const state = useAppStore.getState();
  const character = state.activeCharacter;
  if (!character) return null;
  const date = new Date(period.from * 1000);
  const title = period.kind === 'evening'
    ? translate('journal.eveningTitle', { date: date.toLocaleDateString(state.appLanguage) })
    : translate('journal.monthlyTitle', { month: date.toLocaleDateString(state.appLanguage, { month: 'long', year: 'numeric' }) });
  const periodLabel = period.kind === 'evening'
    ? date.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : date.toLocaleDateString('en', { month: 'long', year: 'numeric' });
  const outcome = await api.writeJournalEntry({
    character_id: character.id,
    chat_character_id: character.id,
    character_name: presentedAs(character, state.replyLanguage).name,
    user_name: state.activePersona.name,
    kind: period.kind,
    period: period.period,
    title,
    period_label: periodLabel,
    from: period.from,
    to: period.to,
    replace,
    ...llmTarget(state),
  });
  if (outcome.status === 'written') await useAppStore.getState().fetchCognitiveOverview().catch(() => undefined);
  return outcome;
}

/** Writes `period` unless handled in this run or failed a short while ago. */
async function writeOnce(period: JournalPeriod, charId: string): Promise<JournalOutcome | null> {
  const key = `${charId}|${period.kind}|${period.period}`;
  if (done.has(key) || Date.now() - (failedAt.get(key) ?? 0) < RETRY_AFTER_MS) return null;
  try {
    const outcome = await writeJournal(period);
    // "Nothing happened yet" is asked again later (the user may still write today).
    if (outcome && outcome.status !== 'empty') done.add(key);
    return outcome;
  } catch (e) {
    failedAt.set(key, Date.now());
    console.warn('Journal entry failed:', e);
    return null;
  }
}

/** One look: the review of last month first, then the evening reflection with its message. */
async function check() {
  const { journal, activeCharacter } = useAppStore.getState();
  if (!journal.enabled || !activeCharacter || !aiReady()) return;
  const now = new Date();
  const name = presentedAs(activeCharacter, useAppStore.getState().replyLanguage).name;

  if (journal.monthly) {
    const outcome = await writeOnce(monthPeriod(now), activeCharacter.id);
    if (outcome?.status === 'written') toast.info(translate('journal.monthlyWritten', { name }));
  }
  if (!eveningDue(journal, now) || !aiReady()) return;
  const outcome = await writeOnce(dayPeriod(now), activeCharacter.id);
  if (outcome?.status !== 'written' || !outcome.entry) return;
  toast.info(translate('journal.eveningWritten', { name }));

  const state = useAppStore.getState();
  if (!state.journal.check_in || state.activeCharacter?.id !== activeCharacter.id || !state.activeChatId
    || state.proactive.muted_character_ids.includes(activeCharacter.id) || !aiReady()) return;
  // Not twice in a row: after a message on their own the user answers first.
  const own = new Set(state.proactive.sent.map((s) => s.message_id));
  const messages = state.storedMessages;
  const lastUser = messages.map((m) => m.role).lastIndexOf('user');
  if (lastUser < 0 || messages.slice(lastUser + 1).some((m) => own.has(m.id))) return;
  const intentions = await api.getIntentions(activeCharacter.id, state.activePersona.name, false).catch(() => []);
  const reflection = outcome.entry.entry_text;
  const stored = await state.writeOnOwn((who) => eveningCheckInInstruction(who, state.activePersona.name, reflection, plansForTomorrow(intentions, now)));
  if (stored) {
    useAppStore.getState().recordProactive({ at: Math.floor(Date.now() / 1000), chat_id: stored.chat_id, message_id: stored.id, intention_id: null });
  }
}

/**
 * Journaling mode (settings: "Evening reflection and monthly review"): in the evening the
 * character of the open chat reflects on the day in their diary and may send a good-night
 * message; in a new month they look back on the last one. Each once per period.
 */
export function useJournal(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    let running = false;
    const run = () => {
      if (running) return;
      running = true;
      void check().catch((e) => console.warn('Journal check failed:', e)).finally(() => { running = false; });
    };
    const first = window.setTimeout(run, FIRST_CHECK_MS);
    const timer = window.setInterval(run, CHECK_INTERVAL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [enabled]);
}
