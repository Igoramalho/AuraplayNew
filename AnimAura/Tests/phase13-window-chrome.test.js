const fs = require('fs');

const chrome = fs.readFileSync('WindowChrome.cs', 'utf8');
const page = fs.readFileSync('MainPage.xaml.cs', 'utf8');
const html = fs.readFileSync('Resources/Raw/auraplay.html', 'utf8');

const sizeBlock = slice(chrome, 'else if (args.DidSizeChange)', '\n\t\t\t}\n\t\t};');
assert(!sizeBlock.includes('RemoveSystemBorder'), 'DidSizeChange reaplica a borda nativa.');
assert(!sizeBlock.includes('ConfigureOverlappedPresenter'), 'DidSizeChange reconfigura o presenter.');
assert(sizeBlock.includes('resizeTimer.Stop()') && sizeBlock.includes('resizeTimer.Start()'), 'Resize não é consolidado por debounce.');
const presenterBlock = slice(chrome, 'if (args.DidPresenterChange', 'else if (args.DidSizeChange)');
assert((presenterBlock.match(/RemoveSystemBorder\(/g) || []).length === 1, 'Mudança de presenter não aplica ajuste exatamente uma vez.');
assert(chrome.includes('chromeMutationInProgress') && chrome.includes('updateInProgress') && chrome.includes('updatePending'), 'Proteções de reentrância ausentes.');
assert(chrome.includes('ConfiguredWindows.Add(nativeWindow)'), 'Handler duplicado não é impedido.');
assert(chrome.includes('nativeWindow.Closed') && chrome.includes('resizeTimer.Stop()'), 'Ciclo do handler não termina ao fechar.');
for (const forbidden of ['cleanupPlaybackEngine', 'activeHls', 'activeEpisodeSession', 'ClearPlaybackHeaderRule']) {
  assert(!presenterBlock.includes(forbidden) && !sizeBlock.includes(forbidden), `Ciclo normal da janela toca em ${forbidden}.`);
}
assert(chrome.includes('WindowCaptionRegionPolicy.Calculate'), 'Caption region não usa política testável.');
assert(html.includes('const ENABLE_GLOBAL_DIAGNOSTICS = true;'), 'Diagnóstico global não pode ser desativado por constante.');
const observer = slice(html, 'function observeGlobalUiAction', "document.addEventListener('click'");
assert(!observer.includes('preventDefault') && !observer.includes('stopPropagation') && !observer.includes('stopImmediatePropagation'), 'Observador global interfere no clique.');
assert(html.includes("{ capture: true, passive: true }"), 'Observador global não é passivo.');
assert(html.includes("'ui-action-timeout'") && html.includes('elapsedMs >= 3000'), 'Timeout diagnóstico ausente.');
assert(page.includes('MaxPlaybackDiagnosticBytes = 2 * 1024 * 1024') && page.includes('PlaybackDiagnosticRotationCount = 2'), 'Limite/rotação do log ausente.');
assert(page.includes('window-command-received') && chrome.includes('appwindow-changed'), 'Comandos nativos não são diagnosticados.');
assert(!/Naruto/.test(chrome + observer), 'Hardcode de Naruto na correção da janela.');
assert((html.match(/<video id="mainVideo"/g) || []).length === 1, 'Correção criou um segundo vídeo.');
assert(chrome.includes('case "window-restore":') && chrome.includes('ExitPictureInPicture'), 'window-restore perdeu semântica exclusiva de PiP.');
assert(!presenterBlock.includes('window-restore'), 'Presenter Restored foi confundido com window-restore.');
console.log('PASS: ciclo nativo da janela, caption e diagnóstico global seguro');

function slice(text, start, end) {
  const from = text.indexOf(start); const to = text.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, `Bloco não localizado: ${start}`); return text.slice(from, to);
}
function assert(value, message) { if (!value) throw new Error(message); }
