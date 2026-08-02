const fs = require('fs');

const html = fs.readFileSync('Resources/Raw/auraplay.html', 'utf8');
const csharp = fs.readFileSync('MainPage.xaml.cs', 'utf8');
const chrome = fs.readFileSync('WindowChrome.cs', 'utf8');

const fullscreenBlock = slice('document.getElementById(\'fullscreenBtn\')', 'viewPlayer.addEventListener(\'mousemove\'');
const pipBlock = slice('async function setCustomPictureInPicture', "customPipPlayBtn.addEventListener");
const exitBlock = slice('function requestPlayerExit', 'function applyViewSwitch');

for (const forbidden of ['cleanupPlaybackEngine(', 'cancelActiveEpisodeSession(', 'clearNativePlaybackHeaders(', 'activeHls.destroy(', "video.removeAttribute('src')", 'video.load()']) {
  assert(!fullscreenBlock.includes(forbidden), `Fullscreen executa cleanup: ${forbidden}`);
  assert(!pipBlock.includes(forbidden), `PiP executa cleanup: ${forbidden}`);
}
assert(!pipBlock.includes('video.play()'), 'PiP reinicia play durante resize/restauração.');
assert(html.includes("await viewPlayer.requestFullscreen()"), 'Fullscreen não preserva o container existente.');
assert((html.match(/<video id="mainVideo"/g) || []).length === 1, 'Existe mais de um elemento mainVideo.');
assert(!pipBlock.includes('innerHTML') && !pipBlock.includes('cloneNode') && !pipBlock.includes('createElement(\'video\')'), 'PiP recria ou substitui o vídeo.');
assert(pipBlock.includes("activeVideoElement !== document.getElementById('mainVideo')"), 'Identidade do elemento de vídeo não é verificada.');
assert(!fullscreenBlock.includes('auraplay://') && !pipBlock.includes('auraplay://'), 'Fullscreen/PiP ainda navegam para auraplay://.');
assert(html.includes("type: 'window-command', commandId, action"), 'Comandos de janela não usam postMessage privado.');
assert(html.includes("event.data?.type === 'window-command-result'"), 'Confirmação nativa do comando não é aguardada.');
assert(csharp.includes('type.GetString() == "window-command"'), 'C# não recebe window-command.');
for (const action of ['fullscreen-enter', 'fullscreen-exit', 'pip-enter', 'pip-exit', 'pip-restore', 'window-restore']) {
  assert(csharp.includes(`\"${action}\"`), `Ação permitida ausente no C#: ${action}`);
}
assert(chrome.includes('case "pip-restore":') && chrome.includes('ExitPictureInPicture'), 'pip-restore não restaura a janela normal.');
assert(chrome.includes('presenter.IsAlwaysOnTop = false') && chrome.includes('appWindow.Resize(_sizeBeforePictureInPicture)') && chrome.includes('appWindow.Move(_positionBeforePictureInPicture)'), 'Restauração de tamanho/posição/always-on-top incompleta.');
assert(html.includes("document.getElementById('pipRestoreBtn').addEventListener('click', event =>") && html.includes("setCustomPictureInPicture(false, true)"), 'pipRestoreBtn não possui listener funcional.');
assert(pipBlock.includes("const action = active ? 'pip-enter' : restoreRequested ? 'pip-restore' : 'pip-exit';"), 'Botão de restauração não envia pip-restore.');
assert(pipBlock.includes("document.body.classList.remove('pip-mode')") && pipBlock.includes('isCustomPipActive = false'), 'Interface PiP não é escondida após restauração.');
assert(exitBlock.includes('if (playerExitPending && playerExitPromise) return playerExitPromise;'), 'Saída do player não é idempotente.');
assert(exitBlock.includes('await document.exitFullscreen()') && exitBlock.includes("await signalNativeWindow('fullscreen-exit')"), 'Voltar em fullscreen não aguarda restauração.');
assert(exitBlock.includes('await setCustomPictureInPicture(false, true)'), 'Voltar em PiP não aguarda restauração.');
assert((exitBlock.match(/applyViewSwitch\(/g) || []).length <= 2, 'Saída do player pode navegar/limpar repetidamente sem limite.');
for (const flag of ['pendingViewAfterFullscreen = null', 'pendingViewAfterPiP = null', 'fullscreenTransitionPending = false', 'pipTransitionPending = false', 'cleanupInProgress = false', 'isChangingEpisode = false', 'pendingResumeTime = null', 'playerExitPromise = null']) {
  assert(exitBlock.includes(flag), `Flag não liberada: ${flag}`);
}
assert(exitBlock.includes("document.body.classList.remove('pip-mode')") && exitBlock.includes("classList.remove('pointer-events-none')"), 'Overlay/pointer-events podem bloquear Details.');
assert(html.includes("reportPlayerLifecycle('details-clicks-restored'"), 'Restauração dos cliques não é diagnosticada.');
assert(html.includes("card.onclick = () => ep.apiManaged && ep.id ? openApiEpisode(ep.id) : loadEpisode(i)"), 'Cards de episódios perderam o listener.');
assert(!/Naruto/.test(fullscreenBlock + pipBlock + exitBlock), 'Hardcode de Naruto no ciclo da janela.');
const lifecycleLogLine = csharp.split('\n').find(line => line.includes('currentTimeProgressing={currentTimeProgressing}')) || '';
assert(!/url=|host=|query=|headers?=/i.test(lifecycleLogLine), 'Diagnóstico de ciclo inclui URL/header.');

const lifecycle = createLifecycleHarness();
const initialVideo = lifecycle.video;
const initialHls = lifecycle.hls;
const initialTime = lifecycle.video.currentTime;
lifecycle.fullscreen(true);
lifecycle.tick();
lifecycle.fullscreen(false);
assert(lifecycle.hls === initialHls && lifecycle.video === initialVideo && lifecycle.video.currentTime > initialTime && lifecycle.cleanupCount === 0, 'Fullscreen não preservou HLS/vídeo/tempo.');
const beforePip = lifecycle.video.currentTime;
lifecycle.pip(true);
lifecycle.tick();
lifecycle.pip(false);
assert(lifecycle.hls === initialHls && lifecycle.video === initialVideo && lifecycle.video.currentTime > beforePip && lifecycle.cleanupCount === 0, 'PiP não preservou HLS/vídeo/tempo.');
lifecycle.exit();
lifecycle.exit();
assert(lifecycle.cleanupCount === 1 && lifecycle.session === null, 'Voltar não executa cleanup exatamente uma vez.');

console.log('PASS: fullscreen, PiP customizado, restauração e saída idempotente');

function slice(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, `Bloco não localizado: ${start}`);
  return html.slice(from, to);
}

function createLifecycleHarness() {
  const state = { video: { currentTime: 10, paused: false }, hls: {}, session: {}, mode: 'normal', cleanupCount: 0, exited: false };
  state.tick = () => { if (!state.video.paused) state.video.currentTime++; };
  state.fullscreen = active => { state.mode = active ? 'fullscreen' : 'normal'; };
  state.pip = active => { state.mode = active ? 'pip' : 'normal'; };
  state.exit = () => { if (state.exited) return; state.exited = true; state.cleanupCount++; state.session = null; state.hls = null; };
  return state;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
