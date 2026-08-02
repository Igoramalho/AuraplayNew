using System.Net;
using System.Text;
using AuraPlay.Services;
using Microsoft.Extensions.Logging.Abstractions;

var tests = new (string Name, Func<Task> Run)[]
{
    ("Home e Unicode", TestHomeAndUnicodeAsync),
    ("Pesquisa local e paginação", TestSearchAsync),
    ("Pesquisa remota", TestRemoteSearchAsync),
    ("Detalhes", TestDetailsAsync),
    ("Temporadas e episódios", TestEpisodesAsync),
    ("Playback", TestPlaybackAsync),
    ("success=false", TestUnsuccessfulEnvelopeAsync),
    ("JSON inválido", TestInvalidJsonAsync),
    ("CancellationToken", TestCancellationAsync)
	,("Favoritos: salvar, reabrir e desfavoritar", TestFavoritesPersistenceAsync)
	,("Favoritos: JSON inválido preservado", TestInvalidFavoritesAsync)
	,("HLS: metadados seguros da playlist", TestHlsPlaylistDiagnosticsAsync)
	,("HLS: política segura de escopos transitórios", TestPlaybackScopePolicyAsync)
	,("Janela: caption region segura", TestWindowCaptionRegionPolicyAsync)
};

foreach (var test in tests)
{
    await test.Run();
    Console.WriteLine($"PASS: {test.Name}");
}

return;

static AuraPlayApiClient CreateClient(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> responder)
{
    var httpClient = new HttpClient(new StubHandler(responder))
    {
        BaseAddress = new Uri("https://api.test/")
    };
    return new AuraPlayApiClient(httpClient, NullLogger<AuraPlayApiClient>.Instance);
}

static HttpResponseMessage Json(string content, HttpStatusCode status = HttpStatusCode.OK) => new(status)
{
    Content = new StringContent(content, Encoding.UTF8, "application/json")
};

static void Assert(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

static async Task TestHomeAndUnicodeAsync()
{
    var client = CreateClient((request, _) =>
    {
        Assert(request.RequestUri?.PathAndQuery == "/api/home", "Rota incorreta para Home.");
        return Task.FromResult(Json("""{"success":true,"data":{"featured":[{"id":"a","title":"日本語 — Ação"}],"popularSeason":[],"recentReleases":[],"updatedAt":"2026-08-01T00:00:00Z","stale":false}}"""));
    });
    var result = await client.GetHomeAsync();
    Assert(result.Featured.Single().Title == "日本語 — Ação", "Unicode não foi preservado.");
}

static async Task TestSearchAsync()
{
    var client = CreateClient((request, _) =>
    {
        Assert(request.RequestUri?.PathAndQuery == "/api/search?q=Naruto%20Shippuden&page=2&limit=5", "Rota ou encoding incorreto na pesquisa local.");
        return Task.FromResult(Json("""{"success":true,"data":[{"id":"a","title":"Naruto Shippuden"}],"meta":{"page":2,"limit":5,"count":1,"total":11,"hasNextPage":true}}"""));
    });
    var result = await client.SearchAsync("Naruto Shippuden", 2, 5);
    Assert(result.Page == 2 && result.Count == 1 && result.Total == 11 && result.HasNextPage, "Paginação local incorreta.");
}

static async Task TestRemoteSearchAsync()
{
    var client = CreateClient((request, _) =>
    {
        Assert(request.RequestUri?.AbsolutePath == "/api/search/remote", "Rota incorreta para pesquisa remota.");
        return Task.FromResult(Json("""{"success":true,"data":[{"anilistId":20,"title":"Naruto"}],"meta":{"page":1,"limit":3,"count":1,"hasNextPage":false}}"""));
    });
    var result = await client.SearchRemoteAsync("Naruto", 1, 3);
    Assert(result.Items.Single().AnilistId == 20, "Resultado remoto incorreto.");
}

static async Task TestDetailsAsync()
{
    var client = CreateClient((request, _) =>
    {
        Assert(request.RequestUri?.AbsolutePath == "/api/anime/catalog-id", "Rota incorreta para detalhes.");
        return Task.FromResult(Json("""{"success":true,"data":{"id":"catalog-id","title":"Título","description":"Descrição","genres":["Ação"],"seasons":[{"id":"s1","number":1,"title":"Temporada 1","displayOrder":1}]}}"""));
    });
    var result = await client.GetAnimeAsync("catalog-id");
    Assert(result.Description == "Descrição" && result.Seasons.Single().Id == "s1", "Detalhes incorretos.");
}

static async Task TestEpisodesAsync()
{
    var client = CreateClient((request, _) =>
    {
        Assert(request.RequestUri?.AbsolutePath == "/api/episodes/catalog-id", "Rota incorreta para episódios.");
        return Task.FromResult(Json("""{"success":true,"data":{"animeId":"catalog-id","playbackStatus":"READY","seasons":[{"id":"s1","number":1,"title":"Temporada 1","episodes":[{"id":"e1","number":1,"title":"Começo","available":true}]}]}}"""));
    });
    var result = await client.GetEpisodesAsync("catalog-id");
    Assert(result.Seasons.Single().Episodes.Single().Id == "e1", "Agrupamento de episódios incorreto.");
}

static async Task TestPlaybackAsync()
{
    var client = CreateClient((request, _) =>
    {
        Assert(request.RequestUri?.AbsolutePath == "/api/playback/episode-id", "Rota incorreta para playback.");
        return Task.FromResult(Json("""{"success":true,"data":{"url":"https://media.test/path/master.m3u8","headers":{"X-Test":"value"},"subtitleTracks":[{"url":"https://media.test/sub.vtt","language":"pt-BR","label":"Português","default":true}]}}"""));
    });
    var result = await client.GetPlaybackAsync("episode-id");
    Assert(result.Url.EndsWith("master.m3u8", StringComparison.Ordinal) && result.Headers["X-Test"] == "value" && result.SubtitleTracks.Single().Language == "pt-BR", "Contrato de playback incorreto.");
}

static async Task TestUnsuccessfulEnvelopeAsync()
{
    var client = CreateClient((_, _) => Task.FromResult(Json("""{"success":false,"error":{"code":"not_found","message":"Não encontrado"}}""", HttpStatusCode.NotFound)));
    try
    {
        await client.GetAnimeAsync("missing");
        throw new InvalidOperationException("success=false não gerou exceção.");
    }
    catch (AuraPlayApiException exception)
    {
        Assert(exception.Code == "not_found" && exception.StatusCode == HttpStatusCode.NotFound, "Erro da API não foi preservado.");
    }
}

static async Task TestInvalidJsonAsync()
{
    var client = CreateClient((_, _) => Task.FromResult(Json("{invalid")));
    try
    {
        await client.GetHomeAsync();
        throw new InvalidOperationException("JSON inválido não gerou exceção.");
    }
    catch (AuraPlayApiException exception)
    {
        Assert(exception.Code == "invalid_json", "Código de JSON inválido incorreto.");
    }
}

static async Task TestCancellationAsync()
{
    var client = CreateClient(async (_, cancellationToken) =>
    {
        await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
        return Json("{}");
    });
    using var cancellationSource = new CancellationTokenSource();
    cancellationSource.Cancel();
    try
    {
        await client.GetHomeAsync(cancellationSource.Token);
        throw new InvalidOperationException("Cancelamento não foi propagado.");
    }
    catch (OperationCanceledException)
    {
    }
}

static async Task TestFavoritesPersistenceAsync()
{
	var directory = Path.Combine(Path.GetTempPath(), $"auraplay-favorites-{Guid.NewGuid():N}");
	try
	{
		var store = new FavoritesStore(directory, NullLogger<FavoritesStore>.Instance);
		var savedJson = """{"version":1,"items":[{"animeId":"catalog-uuid","title":"Título"}]}""";
		var saved = await store.SaveEncodedAsync(Convert.ToBase64String(Encoding.UTF8.GetBytes(savedJson)));
		Assert(saved && File.Exists(store.FilePath) && !File.Exists(store.FilePath + ".tmp"), "Escrita atômica do favorito falhou.");
		var reopened = new FavoritesStore(directory, NullLogger<FavoritesStore>.Instance);
		Assert(await reopened.LoadAsync() == savedJson, "Favorito não foi restaurado após reabrir.");
		var emptyJson = """{"version":1,"items":[]}""";
		Assert(await reopened.SaveEncodedAsync(Convert.ToBase64String(Encoding.UTF8.GetBytes(emptyJson))), "Desfavoritar não foi salvo.");
		Assert(await reopened.LoadAsync() == emptyJson, "Favorito removido reapareceu.");
	}
	finally
	{
		if (Directory.Exists(directory)) Directory.Delete(directory, true);
	}
}

static async Task TestInvalidFavoritesAsync()
{
	var directory = Path.Combine(Path.GetTempPath(), $"auraplay-favorites-invalid-{Guid.NewGuid():N}");
	Directory.CreateDirectory(directory);
	try
	{
		var store = new FavoritesStore(directory, NullLogger<FavoritesStore>.Instance);
		await File.WriteAllTextAsync(store.FilePath, "{invalid", Encoding.UTF8);
		var loaded = await store.LoadAsync();
		Assert(loaded == """{"version":1,"items":[]}""", "JSON inválido não iniciou vazio.");
		Assert(Directory.GetFiles(directory, "favorites.invalid-*.json").Length == 1, "JSON inválido não foi preservado.");
	}
	finally
	{
		if (Directory.Exists(directory)) Directory.Delete(directory, true);
	}
}

static Task TestHlsPlaylistDiagnosticsAsync()
{
	const string master = """
		#EXTM3U
		#EXT-X-STREAM-INF:BANDWIDTH=1800000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2",AUDIO="audio"
		https://private.example/variant.m3u8?token=secret
		#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=854x480,CODECS="avc1.4d401e,mp4a.40.2"
		variant-low.m3u8
		""";
	var masterResult = HlsPlaylistDiagnostics.Parse(master);
	Assert(masterResult.VariantCount == 2, "Quantidade de variantes incorreta.");
	Assert(masterResult.Codecs.Contains("avc1.64001f") && masterResult.Codecs.Contains("mp4a.40.2"), "CODECS não foram extraídos.");
	Assert(masterResult.Resolutions.SequenceEqual(["1280x720", "854x480"]), "Resoluções não foram extraídas com segurança.");
	Assert(masterResult.AudioPresent && masterResult.VideoPresent, "Presença de áudio/vídeo incorreta.");
	Assert(masterResult.SegmentType == "unknown", "URL de variante foi confundida com segmento.");
	var unknownContainerProbes = HlsPlaylistDiagnostics.CreateProbes(masterResult.Container, masterResult.Codecs);
	Assert(unknownContainerProbes.Any(probe => probe.Mime == "video/mp4" && probe.Codec == "avc1.64001f,mp4a.40.2"), "Container desconhecido impediu o teste combinado observado.");
	Assert(unknownContainerProbes.Any(probe => probe.Mime == "video/mp4" && probe.Codec == "avc1.64001f"), "Codec de vídeo isolado não foi testado.");
	Assert(unknownContainerProbes.Any(probe => probe.Mime == "audio/mp4" && probe.Codec == "mp4a.40.2"), "Codec de áudio isolado não foi testado.");
	Assert(unknownContainerProbes.Any(probe => probe.Codec == "avc1.64001f, mp4a.40.2"), "Forma combinada com espaço não foi testada.");
	Assert(unknownContainerProbes.All(probe => !probe.Codec.Contains("hev", StringComparison.OrdinalIgnoreCase) && !probe.Codec.Contains("av01", StringComparison.OrdinalIgnoreCase) && !probe.Codec.Contains("vp9", StringComparison.OrdinalIgnoreCase)), "Codec não observado foi incluído.");

	const string media = """
		#EXTM3U
		#EXT-X-KEY:METHOD=AES-128,URI="https://private.example/key?token=secret"
		#EXT-X-MAP:URI="init.mp4"
		segment-1.m4s?token=secret
		""";
	var mediaResult = HlsPlaylistDiagnostics.Parse(media);
	Assert(mediaResult.EncryptionPresent && mediaResult.InitializationMapPresent, "Criptografia ou EXT-X-MAP não detectados.");
	Assert(mediaResult.SegmentType == "fMP4" && mediaResult.Container == "mp4", "Contêiner fMP4 não detectado.");
	var probes = HlsPlaylistDiagnostics.CreateProbes(mediaResult.Container, masterResult.Codecs);
	Assert(probes.Any(probe => probe.Mime == "video/mp4" && probe.Codec.Contains("avc1.64001f", StringComparison.Ordinal)), "Probe de vídeo observado não foi criado.");
	Assert(probes.Any(probe => probe.Mime == "audio/mp4" && probe.Codec == "mp4a.40.2"), "Probe de áudio observado não foi criado.");
	Assert(!string.Join('|', masterResult.Codecs).Contains("private.example", StringComparison.Ordinal), "URL vazou para o diagnóstico.");
	return Task.CompletedTask;
}

static Task TestWindowCaptionRegionPolicyAsync()
{
	var normal = WindowCaptionRegionPolicy.Calculate(1200, 800, 1d);
	Assert(normal == new CaptionRegion(210, 0, 770, 56), "Caption normal calculada incorretamente.");
	Assert(!normal.Contains(80, 120), "Menu lateral foi coberto pela caption.");
	Assert(!normal.Contains(320, 120), "Botão Voltar foi coberto pela caption.");
	Assert(!normal.Contains(500, 300), "Player foi coberto pela caption.");
	Assert(!normal.Contains(900, 220), "Card de episódio foi coberto pela caption.");
	Assert(!normal.Contains(600, 730), "Controles do player foram cobertos pela caption.");
	var scaled = WindowCaptionRegionPolicy.Calculate(1800, 1200, 1.5d);
	Assert(scaled.Y == 0 && scaled.Height == 84 && scaled.X == 315, "Escala 150% não foi aplicada corretamente.");
	var invalid = WindowCaptionRegionPolicy.Calculate(-50, -20, double.NaN);
	Assert(invalid.Width >= 0 && invalid.Height >= 0 && invalid.X >= 0 && invalid.Y == 0, "Tamanho inválido produziu região negativa.");
	var narrow = WindowCaptionRegionPolicy.Calculate(300, 200, 2d);
	Assert(narrow.Width >= 0 && narrow.X <= 300 && narrow.Height <= 200, "Janela estreita produziu caption inválida.");
	return Task.CompletedTask;
}

static Task TestPlaybackScopePolicyAsync()
{
	var master = new Uri("https://media-a.example.test/master/session/index.m3u8");
	var level = new Uri("https://media-a.example.test/levels/quality/index.m3u8");
	var otherDirectory = PlaybackScopePolicy.Analyze(master, level, "https://media-a.example.test/fragments/video/0001.ts?signature=test", "fragment");
	Assert(otherDirectory.Accepted && otherDirectory.SameOrigin, "Fragmento HTTPS em outro diretório do mesmo host foi rejeitado.");
	Assert(!otherDirectory.InsideMasterDirectory && !otherDirectory.InsideLevelDirectory, "Diretório diferente foi classificado incorretamente.");
	Assert(otherDirectory.Extension == ".ts" && !otherDirectory.FilterPattern.Contains('?'), "Query vazou para o filtro do escopo.");

	var subdomain = PlaybackScopePolicy.Analyze(master, level, "https://segments.example.test/video/0001.m4s", "fragment");
	Assert(subdomain.Accepted && !subdomain.SameOrigin, "Subdomínio HTTPS legítimo não foi classificado separadamente.");
	Assert(PlaybackScopePolicy.Analyze(master, level, "http://media-a.example.test/video/0001.ts", "fragment").RejectionReason == "insecure-scheme", "Esquema inseguro não foi rejeitado.");
	Assert(PlaybackScopePolicy.Analyze(master, level, "https://media-a.example.test:8443/video/0001.ts", "fragment").RejectionReason == "unexpected-port", "Porta inesperada não foi rejeitada.");
	Assert(PlaybackScopePolicy.Analyze(master, level, "javascript:alert(1)", "fragment").Accepted == false, "Esquema javascript foi aceito.");
	Assert(PlaybackScopePolicy.Analyze(master, level, "https://media-a.example.test/video/0001.ts", "other").RejectionReason == "resource-kind", "Tipo arbitrário de recurso foi aceito.");
	Assert(PlaybackScopePolicy.Analyze(master, level, "https://media-a.example.test/video/0001.ts", "frag").NormalizedResourceKind == "fragment", "Alias frag não foi normalizado.");
	Assert(PlaybackScopePolicy.Analyze(master, level, "https://media-a.example.test/video/0001.m4s", "part").Accepted, "Parte HLS legítima foi rejeitada.");
	Assert(PlaybackScopePolicy.Analyze(master, level, "https://media-a.example.test/key/current.bin", "key").Accepted, "Chave HLS legítima foi rejeitada.");
	Assert(PlaybackScopePolicy.Analyze(master, level, "https://media-a.example.test/sub/title.vtt", "subtitle").Accepted, "Legenda HLS legítima foi rejeitada.");
	Assert(!PlaybackScopePolicy.Analyze(master, level, "https://media-a.example.test/asset.js", "script").Accepted, "Script foi aceito como recurso HLS.");
	Assert(PlaybackScopePolicy.CheckLimits(false, 3, 0, 3) == "origin-limit", "Limite de origens não foi aplicado.");
	Assert(PlaybackScopePolicy.CheckLimits(true, 1, 4, 4) == "prefix-limit", "Limite de prefixos não foi aplicado.");
	Assert(PlaybackScopePolicy.CheckLimits(true, 1, 1, 8) == "rule-limit", "Limite total de regras não foi aplicado.");
	return Task.CompletedTask;
}

sealed class StubHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> responder) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => responder(request, cancellationToken);
}
