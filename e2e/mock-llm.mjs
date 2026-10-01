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

export function startMockLlm() {
  const stats = { chat: 0, summary: 0, translate: 0, stagePlanner: 0, stageNarrator: 0, lastChatSystemPrompt: '', lastChatMessages: [] };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) {
        res.writeHead(404).end();
        return;
      }
      const request = JSON.parse(body || '{}');
      const system = request.messages?.[0]?.content ?? '';
      const isSummary = system.includes('running summary');
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
      const isPlanner = system.includes('GAME MASTER PLANNER');
      const isNarrator = system.includes('GAME MASTER NARRATOR');
      if (isPlanner) stats.stagePlanner += 1;
      if (isNarrator) stats.stageNarrator += 1;
      const text = isPlanner
        ? JSON.stringify({ narration_plan: 'Ein altes Tor taucht aus dem Nebel auf.', next_actor: null })
        : isNarrator
          ? STAGE_NARRATION
          : isSummary
            ? SUMMARY
            : isTranslation
              ? TRANSLATION
              : REPLY;
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      // A few chunks, like a real stream; the Stage narrator slowly, so live text can be observed.
      const pieces = text.match(/.{1,40}/gs) ?? [];
      const delay = isNarrator ? 250 : 0;
      (async () => {
        for (const piece of pieces) {
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
