// OpenAI-compatible chat endpoint for the end-to-end test: streams canned replies, and a
// recognizable summary when the app asks for one. No model, no network.
import http from 'node:http';

const REPLY =
  '*lächelt und rückt näher* "Das ist eine gute Frage! Lass mich kurz nachdenken." ' +
  '*tippt sich ans Kinn* "Ich glaube, wir sollten morgen zusammen zum Fushimi-Inari-Schrein gehen. ' +
  'Dort gibt es tausend rote Tore, und am Ende des Weges hat man einen wunderschönen Blick über ganz Kyoto. ' +
  'Bring bequeme Schuhe mit, es sind viele Stufen, und vergiss deine Kamera nicht."';
export const TRANSLATION = '*lächelt* "Testübersetzung: Das ist eine gute Frage!"';
export const STAGE_NARRATION =
  'Der Nebel lichtet sich, und vor euch ragt ein uraltes Tor aus schwarzem Stein auf. Runen glimmen schwach in der Dämmerung, ' +
  'und irgendwo hinter den Mauern schlägt eine Glocke dreimal.';
export const SUMMARY = 'Testzusammenfassung: Kai und die Figur planten einen Ausflug zum Fushimi-Inari-Schrein.';

/** 0.1 s of silence, 8 kHz mono. */
function silentWav() {
  const samples = 800;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF'); wav.writeUInt32LE(36 + samples * 2, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  return wav;
}

export function startMockLlm() {
  const stats = { chat: 0, summary: 0, translate: 0, stagePlanner: 0, stageNarrator: 0, lastChatSystemPrompt: '', lastChatMessages: [] };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      // OpenAI-compatible text-to-speech: a short silent WAV, so voices can be tested offline.
      if (req.method === 'POST' && req.url.endsWith('/audio/speech')) {
        const { input = '', model = '' } = JSON.parse(body || '{}');
        stats.tts = (stats.tts ?? 0) + 1;
        (stats.ttsInputs ??= []).push(input);
        (stats.ttsModels ??= []).push(model);
        res.writeHead(200, { 'Content-Type': 'audio/wav' }).end(silentWav());
        return;
      }
      if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) {
        res.writeHead(404).end();
        return;
      }
      const request = JSON.parse(body || '{}');
      const system = request.messages?.[0]?.content ?? '';
      const isStageSummary = system.includes('[SOUL STAGE — SUMMARY]') || system.includes('[STAGE — SUMMARY]');
      const isSummary = system.includes('running summary');
      if (isStageSummary) {
        stats.stageSummary = (stats.stageSummary ?? 0) + 1;
        if (stats.failStageSummary) { res.writeHead(500).end('summary failed'); return; }
      }
      // Chat replies (every prompt template starts with this heading); other calls such as
      // the memory pipeline only get the canned reply.
      const isChat = system.includes('# Role & Identity');
      const isTranslation = system.includes('translator for roleplay');
      if (isSummary) stats.summary += 1;
      if (isTranslation) stats.translate += 1;
      if (isChat) {
        stats.chat += 1;
        stats.lastChatSystemPrompt = system;
        stats.lastChatMessages = request.messages ?? [];
      }
      const isRouting = system.includes('[SOUL STAGE — ROUTING]') || system.includes('[STAGE — ROUTING]');
      if (isRouting) {
        stats.routing = (stats.routing ?? 0) + 1;
        stats.lastRoutingPrompt = system;
      }
      // Soul Memory pipeline (router agent): the stage hands it a character's view of the scene.
      if (JSON.stringify(request.messages ?? []).includes('=== RECENT MESSAGES ===')) {
        stats.memoryRouter = (stats.memoryRouter ?? 0) + 1;
        (stats.memoryRequests ??= []).push(JSON.stringify(request.messages));
      }
      const isArcArchive = system.includes('[SOUL STAGE — ARC ARCHIVE]') || system.includes('[STAGE — ARC ARCHIVE]');
      const isAudit = system.includes('[SOUL STAGE — CONSISTENCY]') || system.includes('[STAGE — CONSISTENCY]');
      if (isArcArchive) { stats.arcArchive = (stats.arcArchive ?? 0) + 1; stats.lastArcArchivePrompt = system; }
      if (isAudit) { stats.audit = (stats.audit ?? 0) + 1; stats.lastAuditPrompt = system; }
      const isPlanner = system.includes('GAME MASTER PLANNER');
      const isNarrator = system.includes('GAME MASTER NARRATOR');
      if (isPlanner) { stats.stagePlanner += 1; stats.lastPlannerMessages = request.messages ?? []; }
      if (isNarrator) {
        stats.stageNarrator += 1;
        stats.lastNarratorMessages = request.messages ?? [];
      }
      const isNpc = system.includes('[SOUL STAGE — NPC]') || system.includes('[STAGE — NPC]');
      if (isNpc) { stats.stageNpc = (stats.stageNpc ?? 0) + 1; stats.lastNpcMessages = request.messages ?? []; }
      const isCompanion = !isNpc && (system.includes('React in the first person') || system.includes('React to what is happening'));
      if (isCompanion) {
        stats.stageCompanion = (stats.stageCompanion ?? 0) + 1;
        stats.lastCompanionMessages = request.messages ?? [];
        const name = system.match(/^You are (.+?)(?:\.\n|\. React)/)?.[1];
        if (name) {
          stats.companionMessagesByName ??= {};
          stats.companionMessagesByName[name] = request.messages ?? [];
        }
      }
      const stageSummary = 'Stage-Zusammenfassung: Die Gruppe versprach, das Tor zu öffnen.' +
        (JSON.stringify(request.messages).includes('SECRET_PASSWORD') ? ' PRIVATE whisper to Ayu: SECRET_PASSWORD.' : '') +
        (JSON.stringify(request.messages).includes('SECRET_THOUGHT') ? ' PRIVATE thought: SECRET_THOUGHT.' : '');
      const plannerAmbient = stats.ambient ?? null;
      const text = stats.memoryRouterResult && JSON.stringify(request.messages ?? []).includes('=== RECENT MESSAGES ===')
        ? JSON.stringify(stats.memoryRouterResult)
        : isArcArchive ? 'ARC_SUMMARY: Das Tor wurde geöffnet, der Wächter ist frei.'
        : isAudit ? JSON.stringify(stats.auditResult ?? { prune_keys: [], updated_facts: {} })
        : isRouting ? JSON.stringify({ next_actor: stats.routeTo ?? 'PLAYER' }) : isStageSummary ? stageSummary : isPlanner
        ? JSON.stringify({
            narration_plan: 'Ein altes Tor taucht aus dem Nebel auf.',
            next_actor: stats.spawnNpc?.name ?? null,
            bg_image: stats.stageBackground ?? null,
            ambient_audio: plannerAmbient,
            story_arc_updates: stats.arcUpdates ?? [],
            overlay_updates: stats.overlayUpdates ?? [],
            lore_card_updates: stats.loreUpdates ?? [],
            spawn_npcs: stats.spawnNpc ? [stats.spawnNpc] : [],
            despawn_npcs: stats.despawnNpc ? [stats.despawnNpc] : [],
            resource_delta: { target: 'PLAYER', hp_delta: -5, stress_delta: 10 },
            condition_updates: [{ target: 'PLAYER', add: 'Erschöpft', turns: 3 }],
          })
        : isNarrator
          ? STAGE_NARRATION
          : isSummary
            ? SUMMARY
            : isTranslation
              ? TRANSLATION
              : REPLY;
      for (const [matches, flag, cancelled] of [
        [isRouting, 'stallRouting', 'cancelledRouting'],
        [isArcArchive, 'stallArcArchive', 'cancelledArcArchive'],
        [isAudit, 'stallAudit', 'cancelledAudit'],
      ]) {
        if (matches && stats[flag]) {
          res.on('close', () => { stats[cancelled] = (stats[cancelled] ?? 0) + 1; });
          return;
        }
      }
      if (isPlanner && stats.stallPlanner) {
        res.on('close', () => { stats.cancelledPlanner = (stats.cancelledPlanner ?? 0) + 1; });
        return;
      }
      if (isNarrator && stats.stallStage) {
        res.on('close', () => { stats.cancelledStage = (stats.cancelledStage ?? 0) + 1; });
        return;
      }
      if (isChat && stats.stallChat) {
        res.on('close', () => { stats.cancelledChat = (stats.cancelledChat ?? 0) + 1; });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      // A few chunks, like a real stream; the Stage narrator slowly, so live text can be observed.
      const pieces = text.match(/.{1,40}/gs) ?? [];
      const delay = isNarrator ? 250 : 0;
      // `stallChatAfter`: a chat reply stops after that many pieces and hangs (user presses stop).
      const stallAfter = isChat && Number.isInteger(stats.stallChatAfter) ? stats.stallChatAfter : null;
      if (stallAfter !== null) res.on('close', () => { stats.cancelledChat = (stats.cancelledChat ?? 0) + 1; });
      (async () => {
        for (const [index, piece] of pieces.entries()) {
          if (stallAfter !== null && index >= stallAfter) return;
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
          if (delay) await new Promise((r) => setTimeout(r, delay));
        }
        res.write('data: [DONE]\n\n');
        res.end();
      })();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}/v1/chat/completions`,
        stats,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}
