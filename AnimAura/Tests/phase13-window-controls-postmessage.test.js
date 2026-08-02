const fs = require('fs');

const html = fs.readFileSync('Resources/Raw/auraplay.html', 'utf8');
const csharp = fs.readFileSync('MainPage.xaml.cs', 'utf8');
const chrome = fs.readFileSync('WindowChrome.cs', 'utf8');

const controls = slice(html, "// Integração com os controles da janela nativa .NET MAUI.", 'window.onload');
for (const action of ['minimize', 'maximize', 'close']) {
  assert(!html.includes(`auraplay://window/${action}`), `${action} ainda navega por custom scheme.`);
  assert(controls.includes(`handleWindowControl('${action}')`), `${action} não usa o canal privado.`);
}
assert(!controls.includes('window.location') && !controls.includes('location.assign') && !controls.includes('location.replace'), 'Controle da janela ainda navega o WebView.');
assert(!html.includes('auraplay://window/') && !csharp.includes('auraplay://window/'), 'Receptor legado do custom scheme de janela ainda existe.');
assert(html.includes("type: 'window-command', commandId, action"), 'Canal postMessage não envia commandId/action.');
assert(html.includes("event.data?.type === 'window-command-result'"), 'Resultado nativo não é recebido.');
assert(csharp.includes('action is "minimize" or "maximize" or "close" or "fullscreen-enter" or "fullscreen-exit" or "pip-enter" or "pip-exit" or "pip-restore" or "window-restore"'), 'Allowlist nativa não é explícita/completa.');

const signal = slice(html, 'function signalNativeWindow', 'function reportPlayerLifecycle');
for (const forbidden of ['cleanupPlaybackEngine(', 'cancelActiveEpisodeSession(', 'clearNativePlaybackHeaders(', 'switchNav(', 'requestPlayerExit(']) {
  assert(!signal.includes(forbidden), `Comando normal toca no player: ${forbidden}`);
}
assert(signal.includes('windowCommandPending = true') && signal.includes('windowCommandPending = pendingWindowCommands.size > 0'), 'windowCommandPending não é liberado no timeout.');

const resultHandler = slice(html, "if (event.data?.type === 'window-command-result')", "if (event.data?.type === 'playback-scope-ready')");
assert(resultHandler.includes('windowCommandPending = pendingWindowCommands.size > 0'), 'windowCommandPending não é liberado no resultado.');
assert(resultHandler.includes("'window-session-preserved'") && resultHandler.includes("'unexpected-playback-cleanup'"), 'Preservação da sessão não é diagnosticada.');

const unload = slice(html, "window.addEventListener('pagehide'", '// Layer-fixed Volume Slider');
assert(unload.includes("'document-pagehide'") && unload.includes("'document-beforeunload'") && unload.includes("'document-unload'"), 'Diagnóstico de unload incompleto.');
assert(html.includes('shutdownCleanupPerformed') && html.includes('if (shutdownCleanupPerformed) return false'), 'Cleanup de fechamento não é idempotente.');

const openEpisode = slice(html, 'async function openApiEpisode', "document.getElementById('detailsBackBtn')");
assert(openEpisode.includes("ANIME_DATABASE.find(item => item.id === detailsAnimeId) || currentAnime"), 'Snapshot canônico do anime não é usado.');
assert(openEpisode.includes('canonicalEpisodes') && openEpisode.includes('episodes: canonicalEpisodes'), 'Episódios canônicos são perdidos ao criar sessão.');

const maximize = slice(chrome, 'case "maximize":', 'case "fullscreen-enter":');
assert(maximize.includes('presenter.Restore()') && maximize.includes('presenter?.Maximize()'), 'Maximize não alterna Restore/Maximize.');
for (const forbidden of ['cleanupPlaybackEngine', 'activeHls', 'ClearPlaybackHeaderRule', 'SetPresenter']) assert(!maximize.includes(forbidden), `Maximize altera playback: ${forbidden}`);
assert((html.match(/<video id="mainVideo"/g) || []).length === 1, 'Controle criou ou substituiu mainVideo.');
assert(!/Naruto/.test(controls + signal + resultHandler), 'Hardcode de Naruto na correção.');
assert(!/url=|host=|headers?=/i.test(resultHandler), 'Diagnóstico novo expõe URL/header.');

console.log('PASS: minimizar, maximizar/restaurar e fechar usam postMessage sem navegar o WebView');

function slice(text, start, end) {
  const from = text.indexOf(start); const to = text.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, `Bloco não localizado: ${start}`); return text.slice(from, to);
}
function assert(value, message) { if (!value) throw new Error(message); }
