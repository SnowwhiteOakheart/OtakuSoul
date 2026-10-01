// OpenAI-compatible chat endpoint for the end-to-end test: streams canned replies, and a
// recognizable summary when the app asks for one. No model, no network.
import http from 'node:http';

const REPLY =
  '*lächelt und rückt näher* "Das ist eine gute Frage! Lass mich kurz nachdenken." ' +
  '*tippt sich ans Kinn* "Ich glaube, wir sollten morgen zusammen zum Fushimi-Inari-Schrein gehen. ' +
  'Dort gibt es tausend rote Tore, und am Ende des Weges hat man einen wunderschönen Blick über ganz Kyoto. ' +
  'Bring bequeme Schuhe mit, es sind viele Stufen, und vergiss deine Kamera nicht."';
export const SUMMARY = 'Testzusammenfassung: Kai und die Figur planten einen Ausflug zum Fushimi-Inari-Schrein.';

export function startMockLlm() {
  const stats = { chat: 0, summary: 0, lastChatSystemPrompt: '', lastChatMessages: [] };
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
      if (isSummary) stats.summary += 1;
      if (isChat) {
        stats.chat += 1;
        stats.lastChatSystemPrompt = system;
        stats.lastChatMessages = request.messages ?? [];
      }
      const text = isSummary ? SUMMARY : REPLY;
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      // A few chunks, like a real stream.
      for (const piece of text.match(/.{1,40}/gs) ?? []) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      res.end();
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
