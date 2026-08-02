param(
    [switch]$ValidatePublishedApi
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$htmlPath = Join-Path $projectRoot 'Resources\Raw\auraplay.html'
$mainPagePath = Join-Path $projectRoot 'MainPage.xaml.cs'
$clientPath = Join-Path $projectRoot 'Services\AuraPlayApiClient.cs'
$programPath = Join-Path $projectRoot 'MauiProgram.cs'

$html = Get-Content -Raw -Encoding utf8 -LiteralPath $htmlPath
$mainPage = Get-Content -Raw -Encoding utf8 -LiteralPath $mainPagePath
$client = Get-Content -Raw -Encoding utf8 -LiteralPath $clientPath
$program = Get-Content -Raw -Encoding utf8 -LiteralPath $programPath

function Assert-Phase13([bool]$condition, [string]$message) {
    if (-not $condition) { throw "FASE 13: $message" }
}

Assert-Phase13 ($program.Contains('https://auraplay-api.vercel.app/')) 'BaseAddress pública ausente.'
Assert-Phase13 ($program.Contains('AddSingleton<IAuraPlayApiClient, AuraPlayApiClient>')) 'Cliente da API não está registrado por DI.'
Assert-Phase13 ($client.Contains('GetAsync<HomeResponse>("api/home"')) 'Home não usa /api/home.'
Assert-Phase13 ($client.Contains('api/search?q=')) 'Pesquisa local não usa /api/search.'
Assert-Phase13 ($client.Contains('api/search/remote?q=')) 'Pesquisa remota não usa /api/search/remote.'
Assert-Phase13 ($client.Contains('api/anime/{Uri.EscapeDataString(animeId)}')) 'Detalhes não usam /api/anime/{id}.'
Assert-Phase13 ($client.Contains('api/episodes/{Uri.EscapeDataString(animeId)}')) 'Episódios não usam /api/episodes/{animeId}.'
Assert-Phase13 ($client.Contains('api/playback/{Uri.EscapeDataString(episodeId)}')) 'Playback não usa /api/playback/{episodeId}.'

Assert-Phase13 ($html.Contains('featured: (response?.featured ?? []).map(mapApiAnime)')) 'Destaque não é mapeado da resposta da Home.'
Assert-Phase13 ($html.Contains('popularSeason: (response?.popularSeason ?? []).map(mapApiAnime)')) 'Populares não são mapeados da resposta da Home.'
Assert-Phase13 ($html.Contains('recentReleases: (response?.recentReleases ?? []).map(mapApiAnime)')) 'Lançamentos não são mapeados da resposta da Home.'
Assert-Phase13 (-not $html.Contains('ANIME_DATABASE = DEVELOPMENT_FIXTURES')) 'Fixtures estão sendo usadas como catálogo de produção.'
Assert-Phase13 (-not $html.Contains('ANIME_DATABASE = [...DEVELOPMENT_FIXTURES')) 'Fixtures estão sendo misturadas ao catálogo de produção.'
Assert-Phase13 ($html.Contains("requestAuraApi('search-remote'")) 'Ponte da pesquisa remota ausente.'
Assert-Phase13 (-not $html.Contains('ANIME_DATABASE.push(mapApiAnime(remote')) 'Resultado remoto é importado automaticamente.'

Assert-Phase13 ($html.Contains('deduplicateHistoryItems()')) 'Deduplicação compatível do Continue Watching ausente.'
Assert-Phase13 ($html.Contains('resolveHistoryAnime(item)')) 'Resolução de identidade antiga/UUID ausente.'
Assert-Phase13 ($html.Contains('episode.id || `${currentAnime.id}:${episode.number}`')) 'Histórico não prioriza o UUID real do episódio.'
Assert-Phase13 ($html.Contains('episode.seasonId || `${currentAnime.id}:default`')) 'Histórico não preserva seasonId real quando disponível.'
Assert-Phase13 ($html.Contains('savePlaybackProgress(true)')) 'Salvamento forçado do progresso ausente.'
Assert-Phase13 ($mainPage.Contains('SemaphoreSlim _historyWriteGate')) 'Gravação serializada do histórico ausente.'
Assert-Phase13 ($mainPage.Contains('File.Move(temporaryPath, WatchHistoryPath, true)')) 'Gravação atômica do histórico ausente.'

$forbiddenSecrets = @('SUPABASE_' + 'SERVICE_ROLE_KEY', 'SYNC_' + 'SECRET', 'VERCEL_' + 'OIDC_TOKEN')
$forbiddenRoutes = @('/api/' + 'internal/')
$sourceText = $html + "`n" + $mainPage + "`n" + $client + "`n" + $program
foreach ($forbidden in ($forbiddenSecrets + $forbiddenRoutes)) {
    Assert-Phase13 ($sourceText.IndexOf($forbidden, [StringComparison]::OrdinalIgnoreCase) -lt 0) "Conteúdo proibido encontrado: $forbidden"
}

$directProviders = @('Ani' + 'List', 'Ji' + 'kan', 'Supa' + 'base', 'Ken' + 'jitsu', 'Ani' + 'koto', 'Ani' + 'zone')
foreach ($provider in $directProviders) {
    Assert-Phase13 ($client.IndexOf($provider, [StringComparison]::OrdinalIgnoreCase) -lt 0) "Cliente acessa provider diretamente: $provider"
}

$headerName = 'Ref' + 'erer'
Assert-Phase13 ($mainPage.IndexOf($headerName, [StringComparison]::OrdinalIgnoreCase) -lt 0) 'Header de origem hardcoded no cliente.'
Assert-Phase13 ($mainPage.IndexOf('SetHeader("', [StringComparison]::Ordinal) -lt 0) 'Header hardcoded na regra WebView2.'

if ($ValidatePublishedApi) {
    $baseUrl = 'https://auraplay-api.vercel.app'
    $homeResponse = Invoke-RestMethod -Uri "$baseUrl/api/home" -TimeoutSec 30
    Assert-Phase13 ($homeResponse.success -eq $true) '/api/home retornou success=false.'
    Assert-Phase13 ($null -ne $homeResponse.data.featured) '/api/home não retornou featured.'
    Assert-Phase13 ($null -ne $homeResponse.data.popularSeason) '/api/home não retornou popularSeason.'
    Assert-Phase13 ($null -ne $homeResponse.data.recentReleases) '/api/home não retornou recentReleases.'

    $searchResponse = Invoke-RestMethod -Uri "$baseUrl/api/search?q=Naruto&page=1&limit=5" -TimeoutSec 30
    Assert-Phase13 ($searchResponse.success -eq $true) '/api/search retornou success=false.'
    $naruto = @($searchResponse.data | Where-Object { $_.title -eq 'Naruto' } | Select-Object -First 1)
    Assert-Phase13 ($naruto.Count -eq 1) 'Fixture de validação Naruto não foi localizada.'

    $remoteResponse = Invoke-RestMethod -Uri "$baseUrl/api/search/remote?q=Naruto&page=1&limit=3" -TimeoutSec 30
    Assert-Phase13 ($remoteResponse.success -eq $true) '/api/search/remote retornou success=false.'

    $animeId = $naruto[0].id
    $detailsResponse = Invoke-RestMethod -Uri "$baseUrl/api/anime/$animeId" -TimeoutSec 30
    $episodesResponse = Invoke-RestMethod -Uri "$baseUrl/api/episodes/$animeId" -TimeoutSec 30
    Assert-Phase13 ($detailsResponse.success -eq $true) '/api/anime/{id} retornou success=false.'
    Assert-Phase13 ($episodesResponse.success -eq $true) '/api/episodes/{animeId} retornou success=false.'
    $episode = @($episodesResponse.data.seasons | ForEach-Object { $_.episodes } | Where-Object { $_.available } | Select-Object -First 1)
    Assert-Phase13 ($episode.Count -eq 1) 'Nenhum episódio disponível para validar o contrato de playback.'

    $playbackResponse = Invoke-RestMethod -Uri "$baseUrl/api/playback/$($episode[0].id)" -TimeoutSec 30
    Assert-Phase13 ($playbackResponse.success -eq $true) '/api/playback/{episodeId} retornou success=false.'
    Assert-Phase13 (-not [string]::IsNullOrWhiteSpace($playbackResponse.data.url)) 'Playback não retornou URL.'
}

Write-Output 'FASE 13: verificações de integração concluídas com sucesso.'
