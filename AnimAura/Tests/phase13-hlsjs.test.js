const fs = require('fs');
const path = require('path');

const html = fs.readFileSync('Resources/Raw/auraplay.html', 'utf8');
const csharp = fs.readFileSync('MainPage.xaml.cs', 'utf8');
const hlsPath = path.resolve('Resources/Raw/hls.min.js');
const licensePath = path.resolve('Resources/Raw/hls.LICENSE.txt');
const Hls = require(hlsPath);

assert(fs.existsSync(hlsPath) && fs.statSync(hlsPath).size > 500000, 'hls.js local ausente ou incompleto.');
assert(fs.existsSync(licensePath) && fs.readFileSync(licensePath, 'utf8').includes('Apache License'), 'Licença do hls.js ausente.');
assert(Hls.version === '1.6.13', `Versão inesperada do hls.js: ${Hls.version}`);
assert(html.includes('<script src="__AURAPLAY_MEDIA_BASE_URL__hls.min.js"></script>'), 'Biblioteca local não é referenciada pelo pacote MAUI.');
assert(!/https?:\/\/[^"']*hls(?:\.min)?\.js/i.test(html), 'hls.js está sendo carregado por CDN.');
assert(html.includes("if (hlsSupported) return startHlsJsPlayback(playback);"), 'HLS suportado não seleciona hls.js.');
assert(html.includes("activePlaybackEngine = 'native'"), 'Fonte não HLS não preserva o caminho nativo.');
assert((html.match(/let activeHls = null/g) || []).length === 1, 'Mais de um estado de instância Hls foi criado.');
for (const cleanup of ['activeHls.stopLoad()', 'activeHls.detachMedia()', 'activeHls.destroy()']) {
    assert(html.includes(cleanup), `Limpeza ausente: ${cleanup}`);
}
assert(html.indexOf('cleanupPlaybackEngine(true);', html.indexOf('async function openApiEpisode')) < html.indexOf("requestAuraApi('playback'", html.indexOf('async function openApiEpisode')), 'Troca de episódio não limpa a instância anterior antes da nova fonte.');
assert(html.includes("if (playerWasVisible) {\n\t\t\t\t\tcancelActiveEpisodeSession('playback-cancelled');"), 'Voltar do player não cancela a sessão e destrói a instância.');
assert(html.includes("if (data?.fatal) {\n\t\t\t\t\t\tcleanupPlaybackEngine(true);"), 'Erro fatal não destrói a instância.');
assert(html.includes('hlsMediaRecoveryAttempts < 1'), 'Recuperação de mídia não está limitada a uma tentativa.');
assert((html.match(/recoverMediaError\(\)/g) || []).length === 1, 'Existe mais de um caminho de recoverMediaError.');
assert(!html.includes('xhrSetup:') && !html.includes('fetchSetup:'), 'Headers foram duplicados no JavaScript.');
assert(!html.includes('new window.Hls({ debug: true'), 'Debug inseguro do hls.js foi ativado.');
assert(html.includes("video.addEventListener('loadedmetadata'" ) && html.includes('video.currentTime = Math.min(pendingResumeTime'), 'Progresso não é restaurado após metadata.');
assert(html.includes('episode.id || `${currentAnime.id}:${episode.number}`'), 'Histórico não preserva o UUID real do episódio.');
assert(html.includes('configureSubtitleTracks(playback.subtitleTracks ?? [])'), 'Legenda externa retornada pela API deixou de ser configurada.');
assert(csharp.includes('CoreWebView2WebResourceContext.All'), 'ResourceContext da regra de headers foi reduzido indevidamente.');
assert(!csharp.includes('SetHeader("') && !csharp.includes('Referer'), 'Header foi hardcodado.');
assert(!html.includes('LibVLC') && !csharp.includes('LibVLC'), 'LibVLC foi adicionado indevidamente.');
assert(!html.includes('eval('), 'eval foi introduzido no HTML do aplicativo.');
assert(html.includes('class ScopeAwareHlsLoader extends BaseLoader'), 'Wrapper mínimo do loader oficial não foi criado.');
const scopedLoaderBody = html.slice(html.indexOf('class ScopeAwareHlsLoader'), html.indexOf('function reportHlsDiagnostic'));
assert(scopedLoaderBody.indexOf('requestPlaybackScope(sessionId, context)') < scopedLoaderBody.indexOf('super.load(context, config, callbacks)'), 'Loader inicia antes da confirmação do escopo.');
assert(html.includes("type: 'playback-scope-prepare'"), 'Ponte privada de preparação de escopo ausente.');
assert(html.includes('context.frag?.relurl'), 'URL relativa não é classificada.');
assert(html.includes("event.data?.type === 'playback-scope-ready'"), 'Confirmação nativa do escopo não é aguardada.');
assert(html.includes('hlsForbiddenErrors >= 3'), 'Falhas 403 persistentes não encerram a sessão de forma limitada.');
const scopePolicy = fs.readFileSync('Services/PlaybackScopePolicy.cs', 'utf8');
assert(scopePolicy.includes('MaxOriginsPerSession = 3'), 'Limite de origens por sessão ausente.');
assert(scopePolicy.includes('MaxPrefixesPerOrigin = 4'), 'Limite de prefixos por origem ausente.');
assert(scopePolicy.includes('MaxRulesPerSession = 8'), 'Limite total de regras ausente.');
assert(csharp.includes('FixedTimeEquals') && csharp.includes('stale-session'), 'Mensagem de sessão antiga não é rejeitada.');
assert(scopePolicy.includes('requestedUri.Scheme != Uri.UriSchemeHttps'), 'HTTPS não é obrigatório para escopos dinâmicos.');
assert(!csharp.includes('AddWebResourceRequestedFilter("*"'), 'Filtro global foi introduzido.');
assert(csharp.includes('fragment-scope-cleanup'), 'Escopos dinâmicos não são diagnosticados na limpeza.');
assert(html.includes("if (context?.frag) return 'fragment';"), 'FragmentContext sem type não é normalizado como fragment.');
assert(html.includes("fragment: 'fragment', frag: 'fragment', part: 'part', key: 'key'"), 'Aliases seguros do loader não foram declarados explicitamente.');
assert(scopePolicy.includes('["frag"] = PlaybackResourceKind.Fragment') && scopePolicy.includes('["part"] = PlaybackResourceKind.Part') && scopePolicy.includes('["key"] = PlaybackResourceKind.Key'), 'Política nativa não normaliza os tipos HLS legítimos.');
assert(scopePolicy.includes('TryNormalizeResourceKind'), 'Validação de resource-kind foi removida em vez de normalizada.');
assert(csharp.includes('QueuePlaybackResourceKindDiagnostic(receivedResourceKind') && csharp.includes('received={safeReceivedKind} normalized={safeNormalizedKind}'), 'Diagnóstico categórico de resource-kind ausente.');
assert(html.includes('const canonicalEpisodes = Array.isArray(anime?.episodes) ? anime.episodes.map'), 'Player não captura snapshot canônico dos episódios.');
assert(html.includes('activeEpisodeSession === session') && html.includes('isCurrentEpisodeSession(session)'), 'Resposta atrasada não é validada contra a sessão ativa.');
assert(!html.includes('const episode = currentAnime.episodes[currentEpIndex];\n                episode.src = playback.url;'), 'Resposta da API ainda escreve pelo índice global mutável.');
assert(html.includes("cancelApiChannel('playback', reason)"), 'GET de playback não é cancelado com a sessão.');
assert(html.includes("finally {\n\t\t\t\tif (activeEpisodeSession === session) isChangingEpisode = false;"), 'isChangingEpisode não é liberado por finally condicionado.');
assert(html.includes('function renderEpisodesList(episodes = playerEpisodes'), 'Lista lateral ainda depende apenas de currentAnime global.');
assert(html.includes('const count = playerEpisodes.length;') && html.includes('renderEpisodesList(playerEpisodes, activeEpisodeId)'), 'Badge e lista não usam o mesmo snapshot.');
assert(!html.includes('Cannot set properties of undefined'), 'Mensagem JavaScript crua foi incorporada à interface.');
assert(!/Naruto/.test(html.slice(html.indexOf('async function openApiEpisode'), html.indexOf("document.getElementById('detailsBackBtn')"))), 'Fluxo do player contém hardcode de Naruto.');

console.log('PASS: integração controlada do hls.js local 1.6.13');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}
