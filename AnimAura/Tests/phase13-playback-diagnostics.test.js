const fs = require('fs');

const csharp = fs.readFileSync('MainPage.xaml.cs', 'utf8');
const html = fs.readFileSync('Resources/Raw/auraplay.html', 'utf8');

assert(csharp.includes('await StartPlaybackDiagnosticsAsync'), 'session-start não é aguardado antes da resposta de playback.');
assert(csharp.includes('PlaybackDiagnosticFileName = "playback-diagnostics.txt"'), 'Nome constante do diagnóstico ausente.');
assert(csharp.includes('Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AuraPlay")'), 'Diretório previsível do diagnóstico ausente.');
assert(csharp.includes('CoreWebView2WebResourceContext.All'), 'Filtro não cobre todos os contextos HLS no escopo atual.');
assert(csharp.includes('episodeIdHash='), 'Hash do episódio não é registrado.');
assert(csharp.includes('responseCount='), 'Quantidade de respostas não é registrada.');
assert(csharp.includes('e.ResourceContext.ToString()'), 'ResourceContext não é diagnosticado.');
assert(!csharp.includes('mediaUri.AbsoluteUri'), 'URL completa pode estar sendo registrada.');
assert(!csharp.includes('header.Value}'), 'Valor de header pode estar sendo registrado.');

for (const eventName of ['source-assigned', 'load-called', 'play-requested', 'loadedmetadata', 'canplay', 'playing', 'error']) {
    assert(html.includes(`'${eventName}'`) || csharp.includes(`"${eventName}"`), `Evento ${eventName} não está instrumentado.`);
}
assert(html.includes("canPlayType('application/vnd.apple.mpegurl')"), 'Teste HLS principal ausente.');
assert(html.includes("canPlayType('application/x-mpegURL')"), 'Teste HLS alternativo ausente.');
assert(html.includes('mediaErrorMessage: video.error?.message'), 'MediaError.message ausente.');
assert(html.includes('readyState: video.readyState'), 'readyState ausente.');
assert(html.includes('networkState: video.networkState'), 'networkState ausente.');
assert(html.includes('currentSrcPresent: Boolean(video.currentSrc)'), 'currentSrcPresent ausente.');
const nativeEngineStart = html.indexOf("activePlaybackEngine = 'native'", html.indexOf('async function startPlaybackEngine'));
const nativeSourceAssigned = html.indexOf("reportPlaybackDiagnostic('source-assigned')", nativeEngineStart);
const nativeLoad = html.indexOf('video.load();', nativeEngineStart);
assert(nativeEngineStart >= 0 && nativeSourceAssigned > nativeEngineStart && nativeSourceAssigned < nativeLoad, 'source-assigned não ocorre antes de video.load() no caminho nativo.');
const hlsEngineBody = html.slice(html.indexOf('function startHlsJsPlayback'), html.indexOf('async function startPlaybackEngine'));
assert(!hlsEngineBody.includes('video.src = playback.url'), 'Caminho hls.js atribui video.src diretamente.');
assert(html.includes("event: 'mse-capabilities'"), 'Diagnóstico de disponibilidade do MediaSource ausente.');
assert(html.includes('mediaSourcePresent: Boolean(window.MediaSource)'), 'Presença do MediaSource não é registrada.');
assert(html.includes("typeof window.MediaSource?.isTypeSupported === 'function'"), 'isTypeSupported não é verificado.');
assert(html.includes('sourceBufferPresent: Boolean(window.SourceBuffer)'), 'SourceBuffer não é verificado.');
assert(html.includes('managedMediaSourcePresent: Boolean(window.ManagedMediaSource)'), 'ManagedMediaSource não é verificado.');
assert(html.includes("event: 'mse-codec-support'"), 'Resultado de MediaSource.isTypeSupported não é reportado.');
assert(csharp.includes('HlsPlaylistDiagnostics.Parse(playlist)'), 'Playlist HLS não é analisada de modo sanitizado.');
assert(csharp.includes('event=playlist-metadata'), 'Metadados seguros da playlist não são registrados.');
assert(!csharp.includes('playlist}{Environment.NewLine}'), 'Conteúdo integral da playlist pode estar sendo registrado.');
assert(csharp.includes('event=mse-codec-support mimeType={mime} codecs={codec} supported='), 'Resultado true/false com MIME e codecs não é preservado.');
assert(!html.includes('xhrSetup:') && !html.includes('fetchSetup:'), 'Valores transitórios de headers foram duplicados no JavaScript.');

console.log('PASS: criação e segurança do diagnóstico de playback');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}
