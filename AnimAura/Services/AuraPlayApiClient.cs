using System.Diagnostics;
using System.Net.Http.Headers;
using System.Text.Json;
using AuraPlay.Models.Api;
using Microsoft.Extensions.Logging;

namespace AuraPlay.Services;

public sealed class AuraPlayApiClient : IAuraPlayApiClient
{
	private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
	{
		PropertyNameCaseInsensitive = true
	};

	private readonly HttpClient _httpClient;
	private readonly ILogger<AuraPlayApiClient> _logger;

	public AuraPlayApiClient(HttpClient httpClient, ILogger<AuraPlayApiClient> logger)
	{
		_httpClient = httpClient;
		_logger = logger;
		if (!_httpClient.DefaultRequestHeaders.Accept.Any())
			_httpClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
	}

	public Task<HomeResponse> GetHomeAsync(CancellationToken cancellationToken = default) =>
		GetAsync<HomeResponse>("api/home", "home", cancellationToken);

	public async Task<SearchPage<AnimeSummary>> SearchAsync(string query, int page, int limit, CancellationToken cancellationToken = default)
	{
		var envelope = await GetEnvelopeAsync<IReadOnlyList<AnimeSummary>>($"api/search?q={Uri.EscapeDataString(query)}&page={page}&limit={limit}", "search", cancellationToken);
		return CreateSearchPage(envelope, page, limit);
	}

	public async Task<SearchPage<RemoteAnimeSummary>> SearchRemoteAsync(string query, int page, int limit, CancellationToken cancellationToken = default)
	{
		var envelope = await GetEnvelopeAsync<IReadOnlyList<RemoteAnimeSummary>>($"api/search/remote?q={Uri.EscapeDataString(query)}&page={page}&limit={limit}", "search-remote", cancellationToken);
		return CreateSearchPage(envelope, page, limit);
	}

	public Task<AnimeDetails> GetAnimeAsync(string animeId, CancellationToken cancellationToken = default) =>
		GetAsync<AnimeDetails>($"api/anime/{Uri.EscapeDataString(animeId)}", "anime", cancellationToken);

	public Task<EpisodesResponse> GetEpisodesAsync(string animeId, CancellationToken cancellationToken = default) =>
		GetAsync<EpisodesResponse>($"api/episodes/{Uri.EscapeDataString(animeId)}", "episodes", cancellationToken);

	public Task<PlaybackResponse> GetPlaybackAsync(string episodeId, CancellationToken cancellationToken = default) =>
		GetAsync<PlaybackResponse>($"api/playback/{Uri.EscapeDataString(episodeId)}", "playback", cancellationToken);

	private async Task<T> GetAsync<T>(string relativeUrl, string endpointFamily, CancellationToken cancellationToken)
	{
		var envelope = await GetEnvelopeAsync<T>(relativeUrl, endpointFamily, cancellationToken);
		return envelope.Data!;
	}

	private async Task<ApiEnvelope<T>> GetEnvelopeAsync<T>(string relativeUrl, string endpointFamily, CancellationToken cancellationToken)
	{
		var stopwatch = Stopwatch.StartNew();
		try
		{
			using var response = await _httpClient.GetAsync(relativeUrl, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
			await using var responseStream = await response.Content.ReadAsStreamAsync(cancellationToken);
			ApiEnvelope<T>? envelope;
			try
			{
				envelope = await JsonSerializer.DeserializeAsync<ApiEnvelope<T>>(responseStream, JsonOptions, cancellationToken);
			}
			catch (JsonException exception)
			{
				throw new AuraPlayApiException("A API retornou JSON inválido.", response.StatusCode, "invalid_json", exception);
			}

			if (!response.IsSuccessStatusCode)
				throw new AuraPlayApiException(envelope?.Error?.Message ?? $"Erro HTTP {(int)response.StatusCode}.", response.StatusCode, envelope?.Error?.Code);

			if (envelope is null || !envelope.Success || envelope.Data is null)
				throw new AuraPlayApiException(envelope?.Error?.Message ?? "A API retornou success=false.", response.StatusCode, envelope?.Error?.Code ?? "api_unsuccessful");

			_logger.LogInformation("AuraPlay API {EndpointFamily} concluída em {ElapsedMs} ms", endpointFamily, stopwatch.ElapsedMilliseconds);
			return envelope;
		}
		catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
		{
			_logger.LogWarning("AuraPlay API {EndpointFamily} excedeu o tempo limite", endpointFamily);
			throw new AuraPlayApiException("A API excedeu o tempo limite.", code: "timeout");
		}
		catch (HttpRequestException exception)
		{
			_logger.LogWarning("AuraPlay API {EndpointFamily} indisponível (HTTP {StatusCode})", endpointFamily, exception.StatusCode);
			throw new AuraPlayApiException("Não foi possível conectar à API.", exception.StatusCode, "offline", exception);
		}
	}

	private static SearchPage<TItem> CreateSearchPage<TItem>(ApiEnvelope<IReadOnlyList<TItem>> envelope, int requestedPage, int requestedLimit)
	{
		var meta = envelope.Meta;
		var page = TryGetMetaInt(meta, "page") ?? requestedPage;
		var limit = TryGetMetaInt(meta, "limit") ?? requestedLimit;
		var count = TryGetMetaInt(meta, "count") ?? envelope.Data!.Count;
		var total = TryGetMetaInt(meta, "total");
		var hasNext = meta is { ValueKind: JsonValueKind.Object } && meta.Value.TryGetProperty("hasNextPage", out var hasNextElement)
			? hasNextElement.ValueKind == JsonValueKind.True
			: count >= limit;
		return new SearchPage<TItem> { Items = envelope.Data!, Page = page, Limit = limit, Count = count, Total = total, HasNextPage = hasNext };
	}

	private static int? TryGetMetaInt(JsonElement? meta, string propertyName) =>
		meta is { ValueKind: JsonValueKind.Object } && meta.Value.TryGetProperty(propertyName, out var value) && value.TryGetInt32(out var parsed)
			? parsed
			: null;
}
