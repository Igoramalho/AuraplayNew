using System.Text;
using System.Text.Json;
using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Diagnostics;
using AuraPlay.Services;
using AuraPlay.Models.Api;
using Microsoft.Extensions.Logging;

namespace AuraPlay;

public partial class MainPage : ContentPage
{
	private const string PlaybackDiagnosticFileName = "playback-diagnostics.txt";
	private const string HistorySavePrefix = "auraplay://history/save?payload=";
	private const int MaxHistoryPayloadBytes = 1024 * 1024;
	private const long MaxPlaybackDiagnosticBytes = 2 * 1024 * 1024;
	private const int PlaybackDiagnosticRotationCount = 2;
	private static readonly bool EnableGlobalDiagnostics = true;
	private readonly SemaphoreSlim _historyWriteGate = new(1, 1);
	private readonly SemaphoreSlim _playbackDiagnosticGate = new(1, 1);
	private readonly IAuraPlayApiClient _apiClient;
	private readonly FavoritesStore _favoritesStore;
	private readonly ILogger<MainPage> _logger;
	private readonly ConcurrentDictionary<string, CancellationTokenSource> _apiRequests = new();
	private readonly ConcurrentDictionary<string, byte> _playlistDiagnosticSignatures = new(StringComparer.Ordinal);
	private readonly ConcurrentDictionary<string, byte> _observedHlsCodecs = new(StringComparer.OrdinalIgnoreCase);
	private string _observedHlsContainer = "unknown";
	private string WatchHistoryPath => Path.Combine(FileSystem.AppDataDirectory, "watch-history.json");
	private string PlaybackDiagnosticDirectory => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AuraPlay");
	private string PlaybackDiagnosticPath => Path.Combine(PlaybackDiagnosticDirectory, PlaybackDiagnosticFileName);
	private int _playbackResponseCount;
	private long _windowCommandSequence;
#if WINDOWS
	private Microsoft.Web.WebView2.Core.CoreWebView2? _coreWebView;
	private PlaybackHeaderSession? _activePlaybackHeaderSession;
#endif

	public MainPage(IAuraPlayApiClient apiClient, FavoritesStore favoritesStore, ILogger<MainPage> logger)
	{
		InitializeComponent();
		_apiClient = apiClient;
		_favoritesStore = favoritesStore;
		_logger = logger;
		#if WINDOWS
		WindowChrome.ConfigureDiagnostics(line => _ = AppendPlaybackDiagnosticAsync(line));
		#endif
		Loaded += LoadInterfaceAsync;
	}

	private async void LoadInterfaceAsync(object? sender, EventArgs e)
	{
		Loaded -= LoadInterfaceAsync;

		await using var stream = await FileSystem.OpenAppPackageFileAsync("auraplay.html");
		using var reader = new StreamReader(stream);
		var html = await reader.ReadToEndAsync();
		var mediaBaseUrl = new Uri(AppContext.BaseDirectory).AbsoluteUri;

#if WINDOWS
		if (AuraWebView.Handler?.PlatformView is Microsoft.UI.Xaml.Controls.WebView2 nativeWebView)
		{
			await nativeWebView.EnsureCoreWebView2Async();
			nativeWebView.CoreWebView2.WebMessageReceived -= OnWebMessageReceived;
			nativeWebView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
			_coreWebView = nativeWebView.CoreWebView2;
			_coreWebView.WebResourceRequested -= OnPlaybackWebResourceRequested;
			_coreWebView.WebResourceRequested += OnPlaybackWebResourceRequested;
			_coreWebView.WebResourceResponseReceived -= OnPlaybackWebResourceResponseReceived;
			_coreWebView.WebResourceResponseReceived += OnPlaybackWebResourceResponseReceived;
			nativeWebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
				"appassets.auraplay",
				AppContext.BaseDirectory,
				Microsoft.Web.WebView2.Core.CoreWebView2HostResourceAccessKind.Allow);
			mediaBaseUrl = "https://appassets.auraplay/";
		}
#endif

		var historyJson = await LoadWatchHistoryAsync();
		var historyBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(historyJson));
		var favoritesJson = await _favoritesStore.LoadAsync();
		var favoritesBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(favoritesJson));
		html = html.Replace("__AURAPLAY_MEDIA_BASE_URL__", mediaBaseUrl, StringComparison.Ordinal);
		html = html.Replace("__AURAPLAY_WATCH_HISTORY_BASE64__", historyBase64, StringComparison.Ordinal);
		html = html.Replace("__AURAPLAY_FAVORITES_BASE64__", favoritesBase64, StringComparison.Ordinal);

		AuraWebView.Source = new HtmlWebViewSource { Html = html };
	}

#if WINDOWS
	private async void OnWebMessageReceived(object? sender, Microsoft.Web.WebView2.Core.CoreWebView2WebMessageReceivedEventArgs e)
	{
		try
		{
			using var message = JsonDocument.Parse(e.WebMessageAsJson);
			var root = message.RootElement;
			if (!root.TryGetProperty("type", out var type))
				return;

			if (type.GetString() == "history-save" &&
				root.TryGetProperty("payload", out var payload) &&
				payload.ValueKind == JsonValueKind.String)
			{
				TryQueueWatchHistorySave(payload.GetString() ?? string.Empty);
				return;
			}

			if (type.GetString() == "favorites-save" &&
				root.TryGetProperty("payload", out var favoritesPayload) &&
				favoritesPayload.ValueKind == JsonValueKind.String)
			{
				_ = _favoritesStore.SaveEncodedAsync(favoritesPayload.GetString() ?? string.Empty);
				return;
			}

			if (type.GetString() == "api-cancel" && root.TryGetProperty("requestId", out var cancelId))
			{
				CancelApiRequest(cancelId.GetString());
				return;
			}

			if (type.GetString() == "playback-clear")
			{
				ClearPlaybackHeaderRule();
				return;
			}

			if (type.GetString() == "playback-scope-prepare")
			{
				await HandlePlaybackScopePrepareAsync(root);
				return;
			}

			if (type.GetString() == "playback-diagnostic")
			{
				HandlePlaybackDiagnostic(root);
				return;
			}

			if (type.GetString() == "player-lifecycle-diagnostic")
			{
				HandlePlayerLifecycleDiagnostic(root);
				return;
			}

			if (type.GetString() == "ui-diagnostic")
			{
				HandleUiDiagnostic(root);
				return;
			}

			if (type.GetString() == "window-command")
			{
				await HandleWindowCommandAsync(root);
				return;
			}

			if (type.GetString() == "api-request")
				await HandleApiRequestAsync(root.Clone());
		}
		catch (JsonException exception)
		{
			_logger.LogWarning("Mensagem inválida recebida do WebView: {Message}", exception.Message);
		}
	}

	private async Task HandleApiRequestAsync(JsonElement root)
	{
		var requestId = root.TryGetProperty("requestId", out var requestIdElement) ? requestIdElement.GetString() : null;
		var endpoint = root.TryGetProperty("endpoint", out var endpointElement) ? endpointElement.GetString() : null;
		if (string.IsNullOrWhiteSpace(requestId) || string.IsNullOrWhiteSpace(endpoint))
			return;

		CancelApiRequest(requestId);
		var cancellationSource = new CancellationTokenSource();
		_apiRequests[requestId] = cancellationSource;

		try
		{
			object data = endpoint switch
			{
				"home" => await _apiClient.GetHomeAsync(cancellationSource.Token),
				"search" => await _apiClient.SearchAsync(GetString(root, "query"), GetInt(root, "page", 1), GetInt(root, "limit", 20), cancellationSource.Token),
				"search-remote" => await _apiClient.SearchRemoteAsync(GetString(root, "query"), GetInt(root, "page", 1), GetInt(root, "limit", 20), cancellationSource.Token),
				"anime" => await _apiClient.GetAnimeAsync(GetString(root, "animeId"), cancellationSource.Token),
				"episodes" => await _apiClient.GetEpisodesAsync(GetString(root, "animeId"), cancellationSource.Token),
				"playback" => await GetPlaybackAndConfigureAsync(GetString(root, "episodeId"), cancellationSource.Token),
				_ => throw new AuraPlayApiException("Operação da API não reconhecida.", code: "unsupported_endpoint")
			};

			await PostApiResponseAsync(new { requestId, success = true, data });
		}
		catch (OperationCanceledException)
		{
			await PostApiResponseAsync(new { requestId, success = false, error = new { code = "cancelled", message = "Operação cancelada." } });
		}
		catch (AuraPlayApiException exception)
		{
			await PostApiResponseAsync(new
			{
				requestId,
				success = false,
				error = new { code = exception.Code ?? "api_error", message = exception.Message, status = exception.StatusCode is null ? null : (int?)exception.StatusCode }
			});
		}
		catch (Exception exception)
		{
			_logger.LogError(exception, "Falha inesperada na ponte da API para {Endpoint}", endpoint);
			await PostApiResponseAsync(new { requestId, success = false, error = new { code = "unexpected", message = "Falha inesperada ao consultar a API." } });
		}
		finally
		{
			if (_apiRequests.TryRemove(requestId, out var completedSource))
				completedSource.Dispose();
		}
	}

	private async Task<PlaybackResponse> GetPlaybackAndConfigureAsync(string episodeId, CancellationToken cancellationToken)
	{
		ClearPlaybackHeaderRule();
		var playback = await _apiClient.GetPlaybackAsync(episodeId, cancellationToken);
		cancellationToken.ThrowIfCancellationRequested();
		if (!Uri.TryCreate(playback.Url, UriKind.Absolute, out var mediaUri) ||
			(mediaUri.Scheme != Uri.UriSchemeHttp && mediaUri.Scheme != Uri.UriSchemeHttps))
			throw new AuraPlayApiException("A API retornou uma fonte de playback inválida.", code: "invalid_playback_url");

		playback.ClientSessionId = InstallPlaybackHeaderRule(playback.Url, playback.Headers);
		await StartPlaybackDiagnosticsAsync(episodeId, mediaUri, playback.MimeType, playback.Headers.Count > 0, _activePlaybackHeaderSession is not null);
		QueuePlaybackDiagnostic("api-response", mediaUri, null, playback.MimeType, _activePlaybackHeaderSession is not null, false, playback.Headers.Count > 0);
		return playback;
	}

	private string? InstallPlaybackHeaderRule(string mediaUrl, IReadOnlyDictionary<string, string> headers)
	{
		if (_coreWebView is null ||
			!Uri.TryCreate(mediaUrl, UriKind.Absolute, out var mediaUri) ||
			(mediaUri.Scheme != Uri.UriSchemeHttp && mediaUri.Scheme != Uri.UriSchemeHttps))
			return null;

		var lastSeparator = mediaUri.AbsolutePath.LastIndexOf('/');
		var pathPrefix = lastSeparator >= 0 ? mediaUri.AbsolutePath[..(lastSeparator + 1)] : "/";
		var origin = mediaUri.GetLeftPart(UriPartial.Authority);
		var filterPattern = $"{origin}{pathPrefix}*";
		var responseHeaders = headers
			.Where(header => !string.IsNullOrWhiteSpace(header.Key) && !string.IsNullOrWhiteSpace(header.Value))
			.ToDictionary(header => header.Key, header => header.Value, StringComparer.OrdinalIgnoreCase);

		_coreWebView.AddWebResourceRequestedFilter(
			filterPattern,
			Microsoft.Web.WebView2.Core.CoreWebView2WebResourceContext.All);
		var sessionId = Convert.ToHexString(RandomNumberGenerator.GetBytes(16));
		var primaryRule = new PlaybackHeaderRule(mediaUri.Scheme, mediaUri.Host, mediaUri.Port, pathPrefix, filterPattern, 1);
		_activePlaybackHeaderSession = new PlaybackHeaderSession(sessionId, mediaUri, responseHeaders, primaryRule);
		QueuePlaybackDiagnostic("rule-installed", mediaUri, null, null, true, false, responseHeaders.Count > 0);
		return sessionId;
	}

	private async Task HandlePlaybackScopePrepareAsync(JsonElement root)
	{
		var requestId = GetString(root, "requestId");
		var sessionId = GetString(root, "sessionId");
		var resourceKind = GetString(root, "resourceKind");
		var receivedResourceKind = GetString(root, "receivedResourceKind");
		var requestedUrl = GetString(root, "url");
		var usesRelativeUrl = GetBool(root, "usesRelativeUrl");
		var session = _activePlaybackHeaderSession;
		if (string.IsNullOrWhiteSpace(requestId) || session is null || !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(session.Id), Encoding.UTF8.GetBytes(sessionId)))
		{
			QueuePlaybackScopeDiagnostic("fragment-scope-rejected", 0, "stale-session", false, false, usesRelativeUrl, "none", "none", 0, false, false);
			await PostPlaybackScopeResponseAsync(requestId, false, "stale-session");
			return;
		}

		Uri? levelUri;
		lock (session.Gate) levelUri = session.LevelUri;
		var analysis = PlaybackScopePolicy.Analyze(session.MasterUri, levelUri, requestedUrl, resourceKind);
		QueuePlaybackResourceKindDiagnostic(receivedResourceKind, analysis.NormalizedResourceKind, analysis.Accepted, analysis.Accepted ? "none" : analysis.RejectionReason);
		if (!analysis.Accepted && analysis.RejectionReason == "resource-kind")
			QueuePlaybackResourceKindDiagnostic(receivedResourceKind, analysis.NormalizedResourceKind, false, "invalid-resource-kind", "invalid-resource-kind");
		if (!analysis.Accepted)
		{
			QueuePlaybackScopeDiagnostic("fragment-scope-rejected", 0, analysis.RejectionReason, analysis.SameOrigin, false, usesRelativeUrl, analysis.Extension, "none", 0, false, false);
			await PostPlaybackScopeResponseAsync(requestId, false, analysis.RejectionReason);
			return;
		}

		var requestedUri = new Uri(requestedUrl);
		var normalizedRequestedUrl = requestedUri.AbsoluteUri;
		var scopeIndex = 0;
		var rejection = "none";
		var installed = false;
		lock (session.Gate)
		{
			session.ResourceKinds[normalizedRequestedUrl] = analysis.NormalizedResourceKind;
			var existing = session.Rules.FirstOrDefault(rule =>
				string.Equals(rule.Scheme, analysis.Scheme, StringComparison.OrdinalIgnoreCase) &&
				string.Equals(rule.Host, requestedUri.Host, StringComparison.OrdinalIgnoreCase) &&
				rule.Port == analysis.Port &&
				requestedUri.AbsolutePath.StartsWith(rule.PathPrefix, StringComparison.Ordinal));
			if (existing is not null)
			{
				scopeIndex = existing.ScopeIndex;
			}
			else
			{
				var originExists = session.OriginIndexes.ContainsKey(analysis.OriginKey);
				var prefixCount = originExists ? session.PrefixCounts[analysis.OriginKey] : 0;
				rejection = PlaybackScopePolicy.CheckLimits(originExists, session.OriginIndexes.Count, prefixCount, session.Rules.Count);
				if (rejection == "none" && !originExists)
				{
					session.OriginIndexes[analysis.OriginKey] = session.OriginIndexes.Count + 1;
					session.PrefixCounts[analysis.OriginKey] = 0;
				}
				if (rejection == "none")
				{
					scopeIndex = session.Rules.Count + 1;
					var rule = new PlaybackHeaderRule(analysis.Scheme, requestedUri.Host, analysis.Port, analysis.PathPrefix, analysis.FilterPattern, scopeIndex);
					try
					{
						if (_coreWebView is null) rejection = "playback-inactive";
						else
						{
							_coreWebView.AddWebResourceRequestedFilter(rule.FilterPattern, Microsoft.Web.WebView2.Core.CoreWebView2WebResourceContext.All);
							session.Rules.Add(rule);
							session.PrefixCounts[analysis.OriginKey]++;
							installed = true;
						}
					}
					catch (Exception exception) when (exception is ArgumentException or InvalidOperationException or System.Runtime.InteropServices.COMException)
					{
						rejection = "install-failed";
					}
				}
			}
			if (analysis.NormalizedResourceKind == "level") session.LevelUri = requestedUri;
		}

		QueuePlaybackScopeDiagnostic("fragment-scope-analysis", scopeIndex, rejection, analysis.SameOrigin, analysis.InsideMasterDirectory || analysis.InsideLevelDirectory, usesRelativeUrl, analysis.Extension, "none", 0, false, false, analysis.InsideMasterDirectory, analysis.InsideLevelDirectory);
		QueuePlaybackScopeDiagnostic("fragment-scope-requested", scopeIndex, rejection, analysis.SameOrigin, analysis.InsideMasterDirectory || analysis.InsideLevelDirectory, usesRelativeUrl, analysis.Extension, "none", 0, false, false, analysis.InsideMasterDirectory, analysis.InsideLevelDirectory);
		if (rejection != "none")
		{
			QueuePlaybackScopeDiagnostic("fragment-scope-rejected", scopeIndex, rejection, analysis.SameOrigin, false, usesRelativeUrl, analysis.Extension, "none", 0, false, false);
			await PostPlaybackScopeResponseAsync(requestId, false, rejection);
			return;
		}
		if (installed) QueuePlaybackScopeDiagnostic("fragment-scope-installed", scopeIndex, "none", analysis.SameOrigin, analysis.InsideMasterDirectory || analysis.InsideLevelDirectory, usesRelativeUrl, analysis.Extension, "none", 0, session.Headers.Count > 0, false, analysis.InsideMasterDirectory, analysis.InsideLevelDirectory);
		await PostPlaybackScopeResponseAsync(requestId, true, "none");
	}

	private Task PostPlaybackScopeResponseAsync(string requestId, bool success, string reason)
	{
		if (_coreWebView is null || string.IsNullOrWhiteSpace(requestId)) return Task.CompletedTask;
		_coreWebView.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "playback-scope-ready", requestId, success, reason }));
		return Task.CompletedTask;
	}

	private void ClearPlaybackHeaderRule()
	{
		var session = _activePlaybackHeaderSession;
		_activePlaybackHeaderSession = null;
		if (_coreWebView is null || session is null)
			return;

		List<PlaybackHeaderRule> rules;
		lock (session.Gate) rules = [.. session.Rules];
		foreach (var rule in rules)
			_coreWebView.RemoveWebResourceRequestedFilter(rule.FilterPattern, Microsoft.Web.WebView2.Core.CoreWebView2WebResourceContext.All);
		QueuePlaybackScopeDiagnostic("fragment-scope-cleanup", rules.Count, "none", false, false, false, "none", "none", 0, false, false);
		QueuePlaybackDiagnostic("rule-cleared", null, null, null, false, false, null);
	}

	private void OnPlaybackWebResourceRequested(object? sender, Microsoft.Web.WebView2.Core.CoreWebView2WebResourceRequestedEventArgs e)
	{
		var session = _activePlaybackHeaderSession;
		if (session is null || !Uri.TryCreate(e.Request.Uri, UriKind.Absolute, out var requestUri))
			return;
		var rule = FindRule(requestUri, session);
		if (rule is null) return;

		foreach (var header in session.Headers)
			e.Request.Headers.SetHeader(header.Key, header.Value);
		var resourceKind = GetResourceKind(session, requestUri);
		if (resourceKind == "fragment")
		{
			QueuePlaybackScopeDiagnostic("fragment-request-observed", rule.ScopeIndex, "none", false, false, false, SafeExtension(requestUri), e.ResourceContext.ToString(), 0, true, false);
			QueuePlaybackScopeDiagnostic("fragment-headers-applied", rule.ScopeIndex, "none", false, false, false, SafeExtension(requestUri), e.ResourceContext.ToString(), 0, session.Headers.Count > 0, false);
		}
		QueuePlaybackDiagnostic("resource-request", requestUri, null, e.ResourceContext.ToString(), true, false, session.Headers.Count > 0);
	}

	private async void OnPlaybackWebResourceResponseReceived(object? sender, Microsoft.Web.WebView2.Core.CoreWebView2WebResourceResponseReceivedEventArgs e)
	{
		var session = _activePlaybackHeaderSession;
		if (session is null || !Uri.TryCreate(e.Request.Uri, UriKind.Absolute, out var requestUri))
			return;
		var rule = FindRule(requestUri, session);
		if (rule is null) return;

		string? contentType = null;
		try
		{
			contentType = e.Response.Headers.GetHeader("Content-Type");
		}
		catch (ArgumentException)
		{
		}

		var isRedirect = e.Response.StatusCode is >= 300 and < 400;
		Interlocked.Increment(ref _playbackResponseCount);
		if (GetResourceKind(session, requestUri) == "fragment")
			QueuePlaybackScopeDiagnostic("fragment-response", rule.ScopeIndex, "none", false, false, false, SafeExtension(requestUri), "none", e.Response.StatusCode, session.Headers.Count > 0, isRedirect);
		QueuePlaybackDiagnostic("resource-response", requestUri, e.Response.StatusCode, contentType, true, isRedirect, session.Headers.Count > 0);

		if (e.Response.StatusCode is >= 200 and < 300 && requestUri.AbsolutePath.EndsWith(".m3u8", StringComparison.OrdinalIgnoreCase))
			await InspectHlsPlaylistAsync(e.Response);
	}

	private async Task InspectHlsPlaylistAsync(Microsoft.Web.WebView2.Core.CoreWebView2WebResourceResponseView response)
	{
		try
		{
			using var randomAccessContent = await response.GetContentAsync();
			using var content = System.IO.WindowsRuntimeStreamExtensions.AsStreamForRead(randomAccessContent);
			using var reader = new StreamReader(content, Encoding.UTF8, true, leaveOpen: false);
			var playlist = await reader.ReadToEndAsync();
			var diagnostic = HlsPlaylistDiagnostics.Parse(playlist);
			foreach (var codec in diagnostic.Codecs) _observedHlsCodecs.TryAdd(codec, 0);
			if (diagnostic.Container != "unknown") _observedHlsContainer = diagnostic.Container;
			var signatureSource = string.Join('|', diagnostic.Codecs) + ":" + string.Join('|', diagnostic.Resolutions) + ":" + diagnostic.SegmentType + ":" + diagnostic.EncryptionPresent + ":" + diagnostic.InitializationMapPresent;
			var signature = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(signatureSource)))[..12];
			if (!_playlistDiagnosticSignatures.TryAdd(signature, 0)) return;

			var codecs = diagnostic.Codecs.Count == 0 ? "none" : string.Join(',', diagnostic.Codecs);
			var resolutions = diagnostic.Resolutions.Count == 0 ? "none" : string.Join(',', diagnostic.Resolutions);
			await AppendPlaybackDiagnosticAsync($"[{DateTimeOffset.Now:O}] event=playlist-metadata variantCount={diagnostic.VariantCount} codecs={codecs} resolutions={resolutions} audioPresent={diagnostic.AudioPresent} videoPresent={diagnostic.VideoPresent} container={diagnostic.Container} encryptionPresent={diagnostic.EncryptionPresent} initializationMapPresent={diagnostic.InitializationMapPresent} segmentType={diagnostic.SegmentType}{Environment.NewLine}");

			var probes = HlsPlaylistDiagnostics.CreateProbes(_observedHlsContainer, _observedHlsCodecs.Keys);
			if (_coreWebView is not null && probes.Count > 0)
			{
				var payload = JsonSerializer.Serialize(new
				{
					type = "playback-codec-probe",
					probes = probes.Select(probe => new { mime = probe.Mime, codec = probe.Codec })
				});
				_coreWebView.PostWebMessageAsJson(payload);
			}
		}
		catch (Exception exception) when (exception is ArgumentException or IOException or InvalidOperationException or System.Runtime.InteropServices.COMException)
		{
			Debug.WriteLine($"Falha na inspeção segura da playlist: {exception.GetType().Name}; caminho={PlaybackDiagnosticPath}");
		}
	}

	private static bool IsRequestInRule(Uri requestUri, PlaybackHeaderRule rule) =>
		string.Equals(requestUri.Scheme, rule.Scheme, StringComparison.OrdinalIgnoreCase) &&
		string.Equals(requestUri.Host, rule.Host, StringComparison.OrdinalIgnoreCase) &&
		requestUri.Port == rule.Port &&
		requestUri.AbsolutePath.StartsWith(rule.PathPrefix, StringComparison.Ordinal);

	private static PlaybackHeaderRule? FindRule(Uri requestUri, PlaybackHeaderSession session)
	{
		lock (session.Gate) return session.Rules.FirstOrDefault(rule => IsRequestInRule(requestUri, rule));
	}

	private static string GetResourceKind(PlaybackHeaderSession session, Uri requestUri)
	{
		lock (session.Gate) return session.ResourceKinds.TryGetValue(requestUri.AbsoluteUri, out var kind) ? kind : "unknown";
	}

	private void HandlePlaybackDiagnostic(JsonElement root)
	{
		var eventName = GetString(root, "event");
		if (eventName == "hlsjs-event")
		{
			var action = SanitizeDiagnosticToken(GetString(root, "action"), 48);
			var allowedActions = new HashSet<string>(StringComparer.Ordinal)
			{
				"playback-engine-selected", "hlsjs-supported", "hlsjs-instance-created", "media-attached",
				"manifest-loading", "manifest-loaded", "manifest-parsed", "level-loading", "level-loaded",
				"fragment-loading", "fragment-loaded", "hlsjs-error", "media-recovery-attempt",
				"playback-playing", "playback-cleanup"
			};
			if (!allowedActions.Contains(action)) return;
			var errorType = SanitizeDiagnosticToken(GetString(root, "errorType"), 64);
			var details = SanitizeDiagnosticToken(GetString(root, "details"), 120);
			var phase = SanitizeDiagnosticToken(GetString(root, "phase"), 64);
			var engine = action == "playback-engine-selected" && phase is "native" or "hlsjs" ? phase : "none";
			var supported = action == "hlsjs-supported" && details is "true" or "false" ? details : "unknown";
			var line = $"[{DateTimeOffset.Now:O}] event={action} engine={engine} supported={supported} errorType={errorType} details={details} fatal={GetBool(root, "fatal")} status={GetInt(root, "status", 0)} phase={phase} playlists={GetInt(root, "playlists", 0)} fragments={GetInt(root, "fragments", 0)} networkErrors={GetInt(root, "networkErrors", 0)} mediaErrors={GetInt(root, "mediaErrors", 0)} recoveryAttempts={GetInt(root, "recoveryAttempts", 0)}{Environment.NewLine}";
			_ = AppendPlaybackDiagnosticAsync(line);
			return;
		}
		if (eventName == "mse-capabilities")
		{
			var mediaSourceType = SanitizeDiagnosticToken(GetString(root, "mediaSourceType"), 16);
			var runtime = SanitizeRuntime(GetString(root, "runtime"));
			var line = $"[{DateTimeOffset.Now:O}] event=mse-capabilities mediaSourceType={mediaSourceType} mediaSourcePresent={GetBool(root, "mediaSourcePresent")} isTypeSupportedPresent={GetBool(root, "isTypeSupportedPresent")} sourceBufferPresent={GetBool(root, "sourceBufferPresent")} managedMediaSourcePresent={GetBool(root, "managedMediaSourcePresent")} runtime={runtime}{Environment.NewLine}";
			_ = AppendPlaybackDiagnosticAsync(line);
			return;
		}
		if (eventName == "mse-codec-support")
		{
			var mime = SanitizeDiagnosticToken(GetString(root, "mime"), 32);
			var codec = SanitizeDiagnosticToken(GetString(root, "codec"), 160);
			var line = $"[{DateTimeOffset.Now:O}] event=mse-codec-support mimeType={mime} codecs={codec} supported={GetBool(root, "supported")}{Environment.NewLine}";
			_ = AppendPlaybackDiagnosticAsync(line);
			return;
		}
		var allowedEvents = new[] { "source-assigned", "load-called", "play-requested", "loadedmetadata", "canplay", "playing", "error" };
		if (!allowedEvents.Contains(eventName, StringComparer.Ordinal))
			return;

		var mediaErrorCode = GetInt(root, "mediaErrorCode", 0);
		var hlsSupport = GetString(root, "hlsSupport");
		var alternateHlsSupport = GetString(root, "alternateHlsSupport");
		var safeHlsSupport = hlsSupport is "probably" or "maybe" ? hlsSupport : "none";
		var safeAlternateSupport = alternateHlsSupport is "probably" or "maybe" ? alternateHlsSupport : "none";
		var readyState = GetInt(root, "readyState", 0);
		var networkState = GetInt(root, "networkState", 0);
		var currentSrcPresent = root.TryGetProperty("currentSrcPresent", out var currentSrcElement) && currentSrcElement.ValueKind == JsonValueKind.True;
		var mediaErrorMessage = SanitizeMediaErrorMessage(GetString(root, "mediaErrorMessage"));
		QueuePlaybackDiagnostic($"player-{eventName}", null, mediaErrorCode > 0 ? mediaErrorCode : null, $"hls={safeHlsSupport};alternateHls={safeAlternateSupport}", _activePlaybackHeaderSession is not null, false, _activePlaybackHeaderSession?.Headers.Count > 0, readyState, networkState, currentSrcPresent, mediaErrorMessage);
	}

	private void QueuePlaybackScopeDiagnostic(string eventName, int scopeIndex, string reason, bool sameOrigin, bool sameDirectory, bool usesRelativeUrl, string extension, string resourceContext, int status, bool headersApplied, bool redirect, bool insideMasterDirectory = false, bool insideLevelDirectory = false)
	{
		var safeEvent = SanitizeDiagnosticToken(eventName, 48);
		var safeReason = SanitizeDiagnosticToken(reason, 48);
		var safeExtension = SanitizeDiagnosticToken(extension, 16);
		var safeContext = SanitizeDiagnosticToken(resourceContext, 32);
		var line = $"[{DateTimeOffset.Now:O}] event={safeEvent} sameOrigin={sameOrigin} sameDirectory={sameDirectory} insideMasterDirectory={insideMasterDirectory} insideLevelDirectory={insideLevelDirectory} scopeIndex={scopeIndex} extension={safeExtension} resourceContext={safeContext} status={status} headersApplied={headersApplied} redirect={redirect} usesRelativeUrl={usesRelativeUrl} usesAbsoluteUrl={!usesRelativeUrl} reason={safeReason}{Environment.NewLine}";
		_ = AppendPlaybackDiagnosticAsync(line);
	}

	private void QueuePlaybackResourceKindDiagnostic(string receivedKind, string normalizedKind, bool accepted, string reason, string eventName = "resource-kind")
	{
		var safeEvent = SanitizeDiagnosticToken(eventName, 48);
		var safeReceivedKind = SanitizeDiagnosticToken(receivedKind, 24);
		var safeNormalizedKind = SanitizeDiagnosticToken(normalizedKind, 24);
		var safeReason = SanitizeDiagnosticToken(reason, 48);
		var line = $"[{DateTimeOffset.Now:O}] event={safeEvent} received={safeReceivedKind} normalized={safeNormalizedKind} accepted={accepted} reason={safeReason}{Environment.NewLine}";
		_ = AppendPlaybackDiagnosticAsync(line);
	}

	private void HandlePlayerLifecycleDiagnostic(JsonElement root)
	{
		var eventName = SanitizeDiagnosticToken(GetString(root, "event"), 48);
		var mode = SanitizeDiagnosticToken(GetString(root, "mode"), 16);
		var nativeCommand = SanitizeDiagnosticToken(GetString(root, "nativeCommand"), 32);
		var navigationTarget = SanitizeDiagnosticToken(GetString(root, "navigationTarget"), 16);
		var activeSession = GetBool(root, "activeSession");
		var activeHls = GetBool(root, "activeHls");
		var paused = GetBool(root, "paused");
		var currentTimeProgressing = GetBool(root, "currentTimeProgressing");
		var isChangingEpisode = GetBool(root, "isChangingEpisode");
		var transitionPending = GetBool(root, "transitionPending");
		var windowCommandPending = GetBool(root, "windowCommandPending");
		var playerExitPending = GetBool(root, "playerExitPending");
		var fullscreenPending = GetBool(root, "fullscreenPending");
		var pipPending = GetBool(root, "pipPending");
		var closeRequested = GetBool(root, "closeRequested");
		var currentView = SanitizeDiagnosticToken(GetString(root, "currentView"), 16);
		var pendingTargetView = SanitizeDiagnosticToken(GetString(root, "pendingTargetView"), 16);
		var restoreSucceeded = GetBool(root, "restoreSucceeded");
		var readyState = GetInt(root, "readyState", 0);
		var cleanupCount = GetInt(root, "cleanupCount", 0);
		var line = $"[{DateTimeOffset.Now:O}] event={eventName} activeSession={activeSession} activeHls={activeHls} ruleActive={_activePlaybackHeaderSession is not null} paused={paused} readyState={readyState} currentTimeProgressing={currentTimeProgressing} currentView={currentView} mode={mode} nativeCommand={nativeCommand} navigationTarget={navigationTarget} pendingTargetView={pendingTargetView} cleanupCount={cleanupCount} isChangingEpisode={isChangingEpisode} transitionPending={transitionPending} playerExitPending={playerExitPending} fullscreenPending={fullscreenPending} pipPending={pipPending} windowCommandPending={windowCommandPending} closeRequested={closeRequested} restoreSucceeded={restoreSucceeded}{Environment.NewLine}";
		_ = AppendPlaybackDiagnosticAsync(line);
	}

	private void HandleUiDiagnostic(JsonElement root)
	{
		if (!EnableGlobalDiagnostics) return;
		var eventName = SanitizeDiagnosticToken(GetString(root, "event"), 32);
		if (eventName is not ("ui-action-requested" or "ui-action-start" or "ui-action-complete" or "ui-action-failed" or "ui-action-ignored" or "ui-action-timeout")) return;
		var action = SanitizeDiagnosticToken(GetString(root, "action"), 40);
		var elementId = SanitizeDiagnosticToken(GetString(root, "elementId"), 48);
		var view = SanitizeDiagnosticToken(GetString(root, "view"), 16);
		var targetView = SanitizeDiagnosticToken(GetString(root, "targetView"), 16);
		var pointerEvents = SanitizeDiagnosticToken(GetString(root, "pointerEvents"), 16);
		var windowState = SanitizeDiagnosticToken(GetString(root, "windowState"), 16);
		var safeError = SanitizeDiagnosticToken(GetString(root, "error"), 64);
		var sessionId = SanitizeDiagnosticToken(GetString(root, "sessionId"), 24);
		var sequenceId = Math.Max(0, GetInt(root, "sequenceId", 0));
		var elapsedMs = Math.Clamp(GetInt(root, "elapsedMs", 0), 0, 120000);
		var line = $"[{DateTimeOffset.Now:O}] event={eventName} diagnosticSession={sessionId} sequenceId={sequenceId} action={action} elementId={elementId} view={view} targetView={targetView} handlerFound={GetBool(root, "handlerFound")} disabled={GetBool(root, "disabled")} pointerEvents={pointerEvents} overlayPresent={GetBool(root, "overlayPresent")} transitionPending={GetBool(root, "transitionPending")} activeSession={GetBool(root, "activeSession")} activeHls={GetBool(root, "activeHls")} isChangingEpisode={GetBool(root, "isChangingEpisode")} fullscreen={GetBool(root, "fullscreen")} pip={GetBool(root, "pip")} windowState={windowState} elapsedMs={elapsedMs} error={safeError}{Environment.NewLine}";
		_ = AppendPlaybackDiagnosticAsync(line);
	}

	private async Task HandleWindowCommandAsync(JsonElement root)
	{
		var commandId = GetString(root, "commandId");
		var action = GetString(root, "action");
		var safeAction = SanitizeDiagnosticToken(action, 32);
		var allowed = action is "minimize" or "maximize" or "close" or "fullscreen-enter" or "fullscreen-exit" or "pip-enter" or "pip-exit" or "pip-restore" or "window-restore";
		var succeeded = false;
		var mauiWindow = allowed ? GetParentWindow() : null;
		if (mauiWindow is not null)
		{
			if (action == "close")
			{
				// Acknowledge through CoreWebView2 before destroying the WebView/window.
				var closeSequence = Interlocked.Increment(ref _windowCommandSequence);
				await AppendPlaybackDiagnosticAsync($"[{DateTimeOffset.Now:O}] event=window-command-received sequence={closeSequence} action={safeAction}{Environment.NewLine}");
				await AppendPlaybackDiagnosticAsync($"[{DateTimeOffset.Now:O}] event=window-command-start sequence={closeSequence} action={safeAction}{Environment.NewLine}");
				ClearPlaybackHeaderRule();
				succeeded = true;
				await AppendPlaybackDiagnosticAsync($"[{DateTimeOffset.Now:O}] event=window-command-complete sequence={closeSequence} action={safeAction} elapsedMs=0{Environment.NewLine}");
				if (_coreWebView is not null && !string.IsNullOrWhiteSpace(commandId))
					_coreWebView.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "window-command-result", commandId, success = true }));
				await Task.Yield();
				WindowChrome.HandleAction(mauiWindow, action);
				return;
			}
			else
			{
				HandleWindowAction(action);
				succeeded = true;
			}
		}
		var nativeEvent = action is "minimize" or "maximize" or "close" ? "window-native-command-received" : action.StartsWith("pip-", StringComparison.Ordinal) || action == "window-restore" ? "pip-native-command-received" : "fullscreen-native-command-received";
		var diagnosticLine = $"[{DateTimeOffset.Now:O}] event={nativeEvent} activeSession={_activePlaybackHeaderSession is not null} activeHls=unknown ruleActive={_activePlaybackHeaderSession is not null} paused=unknown readyState=0 currentTimeProgressing=false mode=unknown nativeCommand={safeAction} navigationTarget=none cleanupCount=0 isChangingEpisode=false transitionPending=false restoreSucceeded={succeeded}{Environment.NewLine}";
		_ = AppendPlaybackDiagnosticAsync(diagnosticLine);
		if (action != "close" && _coreWebView is not null && !string.IsNullOrWhiteSpace(commandId))
			_coreWebView.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "window-command-result", commandId, success = succeeded }));
	}

	private static string SafeExtension(Uri uri)
	{
		var extension = Path.GetExtension(uri.AbsolutePath).ToLowerInvariant();
		return extension.Length is > 0 and <= 16 && extension.All(character => char.IsLetterOrDigit(character) || character == '.') ? extension : "unknown";
	}

	private void QueuePlaybackDiagnostic(string eventName, Uri? mediaUri, int? statusOrCode, string? contentType, bool ruleActive, bool redirect, bool? headersPresent, int? readyState = null, int? networkState = null, bool? currentSrcPresent = null, string? mediaErrorMessage = null)
	{
		var extension = mediaUri is null ? "none" : Path.GetExtension(mediaUri.AbsolutePath).ToLowerInvariant();
		var safeContentType = string.Concat((contentType ?? "none").Take(80).Where(character => char.IsLetterOrDigit(character) || character is '/' or '-' or '+' or '.' or ';' or '=' or ' '));
		var line = $"[{DateTimeOffset.Now:O}] event={eventName} mediaType={extension} statusOrCode={statusOrCode?.ToString() ?? "none"} contentType={safeContentType} ruleActive={ruleActive} headersPresent={headersPresent?.ToString() ?? "unknown"} redirect={redirect} responseCount={Volatile.Read(ref _playbackResponseCount)} readyState={readyState?.ToString() ?? "none"} networkState={networkState?.ToString() ?? "none"} currentSrcPresent={currentSrcPresent?.ToString() ?? "unknown"} mediaErrorMessage={mediaErrorMessage ?? "none"}{Environment.NewLine}";
		_ = AppendPlaybackDiagnosticAsync(line);
	}

	private async Task StartPlaybackDiagnosticsAsync(string episodeId, Uri mediaUri, string? mimeType, bool headersPresent, bool ruleInstalled)
	{
		Interlocked.Exchange(ref _playbackResponseCount, 0);
		_playlistDiagnosticSignatures.Clear();
		_observedHlsCodecs.Clear();
		_observedHlsContainer = "unknown";
		var episodeIdHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(episodeId)))[..12];
		var extension = Path.GetExtension(mediaUri.AbsolutePath).ToLowerInvariant();
		var safeMimeType = string.Concat((mimeType ?? "none").Take(80).Where(character => char.IsLetterOrDigit(character) || character is '/' or '-' or '+' or '.' or ';' or '=' or ' '));
		var line = $"[{DateTimeOffset.Now:O}] event=session-start diagnostics-enabled=true appDataDirectory={FileSystem.AppDataDirectory} diagnosticPath={PlaybackDiagnosticPath} episodeIdHash={episodeIdHash} mimeType={safeMimeType} mediaType={extension} headersPresent={headersPresent} headerRuleInstalled={ruleInstalled}{Environment.NewLine}";
		await AppendPlaybackDiagnosticAsync(line);
	}

	private static string SanitizeMediaErrorMessage(string value)
	{
		if (string.IsNullOrWhiteSpace(value)) return "none";
		if (value.Contains("http://", StringComparison.OrdinalIgnoreCase) || value.Contains("https://", StringComparison.OrdinalIgnoreCase)) return "redacted";
		return string.Concat(value.Take(160).Where(character => !char.IsControl(character) && character is not '='));
	}

	private static string SanitizeDiagnosticToken(string value, int maxLength)
	{
		if (string.IsNullOrWhiteSpace(value)) return "none";
		return string.Concat(value.Take(maxLength).Where(character => char.IsLetterOrDigit(character) || character is '/' or '.' or '-' or '_' or ',' or ';' or ' '));
	}

	private static string SanitizeRuntime(string value)
	{
		if (string.IsNullOrWhiteSpace(value)) return "none";
		return string.Concat(value.Take(240).Where(character => char.IsLetterOrDigit(character) || character is '/' or '.' or '-' or '_' or ';' or '(' or ')' or ' '));
	}

	private static bool GetBool(JsonElement root, string propertyName) =>
		root.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.True;

	private async Task AppendPlaybackDiagnosticAsync(string line)
	{
		await _playbackDiagnosticGate.WaitAsync();
		try
		{
			Directory.CreateDirectory(PlaybackDiagnosticDirectory);
			if (File.Exists(PlaybackDiagnosticPath) && new FileInfo(PlaybackDiagnosticPath).Length + Encoding.UTF8.GetByteCount(line) > MaxPlaybackDiagnosticBytes)
			{
				var oldestPath = PlaybackDiagnosticPath + $".{PlaybackDiagnosticRotationCount}";
				if (File.Exists(oldestPath)) File.Delete(oldestPath);
				for (var index = PlaybackDiagnosticRotationCount - 1; index >= 1; index--)
				{
					var sourcePath = PlaybackDiagnosticPath + $".{index}";
					if (File.Exists(sourcePath)) File.Move(sourcePath, PlaybackDiagnosticPath + $".{index + 1}", true);
				}
				File.Move(PlaybackDiagnosticPath, PlaybackDiagnosticPath + ".1", true);
			}
			await File.AppendAllTextAsync(PlaybackDiagnosticPath, line, new UTF8Encoding(false));
		}
		catch (Exception exception)
		{
			Debug.WriteLine($"Falha no diagnóstico de playback: {exception.GetType().Name}; caminho={PlaybackDiagnosticPath}");
		}
		finally
		{
			_playbackDiagnosticGate.Release();
		}
	}

	private sealed record PlaybackHeaderRule(
		string Scheme,
		string Host,
		int Port,
		string PathPrefix,
		string FilterPattern,
		int ScopeIndex);

	private sealed class PlaybackHeaderSession
	{
		public PlaybackHeaderSession(string id, Uri masterUri, IReadOnlyDictionary<string, string> headers, PlaybackHeaderRule primaryRule)
		{
			Id = id;
			MasterUri = masterUri;
			Headers = headers;
			Rules.Add(primaryRule);
			var origin = masterUri.GetLeftPart(UriPartial.Authority);
			OriginIndexes[origin] = 1;
			PrefixCounts[origin] = 1;
		}

		public object Gate { get; } = new();
		public string Id { get; }
		public Uri MasterUri { get; }
		public Uri? LevelUri { get; set; }
		public IReadOnlyDictionary<string, string> Headers { get; }
		public List<PlaybackHeaderRule> Rules { get; } = [];
		public Dictionary<string, int> OriginIndexes { get; } = new(StringComparer.OrdinalIgnoreCase);
		public Dictionary<string, int> PrefixCounts { get; } = new(StringComparer.OrdinalIgnoreCase);
		public Dictionary<string, string> ResourceKinds { get; } = new(StringComparer.Ordinal);
	}

	private static string GetString(JsonElement root, string propertyName) =>
		root.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.String
			? value.GetString() ?? string.Empty
			: string.Empty;

	private static int GetInt(JsonElement root, string propertyName, int defaultValue) =>
		root.TryGetProperty(propertyName, out var value) && value.TryGetInt32(out var parsed) ? parsed : defaultValue;

	private void CancelApiRequest(string? requestId)
	{
		if (!string.IsNullOrWhiteSpace(requestId) && _apiRequests.TryRemove(requestId, out var source))
		{
			source.Cancel();
			source.Dispose();
		}
	}

	private async Task PostApiResponseAsync(object response)
	{
		if (_coreWebView is null)
			return;

		var json = JsonSerializer.Serialize(response, new JsonSerializerOptions(JsonSerializerDefaults.Web));
		await _coreWebView.ExecuteScriptAsync($"window.__auraplayReceiveApiResponse?.({json});");
	}
#endif

	private void OnNavigating(object? sender, WebNavigatingEventArgs e)
	{
		if (e.Url.StartsWith(HistorySavePrefix, StringComparison.OrdinalIgnoreCase))
		{
			e.Cancel = true;
			TryQueueWatchHistorySave(e.Url[HistorySavePrefix.Length..]);
			return;
		}

		if (e.Url.StartsWith("http", StringComparison.OrdinalIgnoreCase) &&
			!e.Url.Contains("cdn.tailwindcss.com", StringComparison.OrdinalIgnoreCase) &&
			!e.Url.Contains("unpkg.com", StringComparison.OrdinalIgnoreCase) &&
			!e.Url.Contains("googleapis.com", StringComparison.OrdinalIgnoreCase) &&
			!e.Url.Contains("gstatic.com", StringComparison.OrdinalIgnoreCase) &&
			!e.Url.Contains("unsplash.com", StringComparison.OrdinalIgnoreCase))
		{
			e.Cancel = true;
			Launcher.Default.OpenAsync(e.Url);
		}
	}

	private async Task<string> LoadWatchHistoryAsync()
	{
		try
		{
			if (!File.Exists(WatchHistoryPath))
				return "{}";

			var json = await File.ReadAllTextAsync(WatchHistoryPath);
			return IsValidWatchHistory(json) ? json : "{}";
		}
		catch (Exception)
		{
			return "{}";
		}
	}

	private void TryQueueWatchHistorySave(string encodedPayload)
	{
		try
		{
			var payload = Convert.FromBase64String(Uri.UnescapeDataString(encodedPayload));
			if (payload.Length > MaxHistoryPayloadBytes)
				return;

			var json = Encoding.UTF8.GetString(payload);
			if (IsValidWatchHistory(json))
				_ = SaveWatchHistoryAsync(json);
		}
		catch (Exception)
		{
			// Ignore malformed messages from the embedded page.
		}
	}

	private static bool IsValidWatchHistory(string json)
	{
		try
		{
			using var document = JsonDocument.Parse(json);
			return document.RootElement.ValueKind == JsonValueKind.Object;
		}
		catch (JsonException)
		{
			return false;
		}
	}

	private async Task SaveWatchHistoryAsync(string json)
	{
		await _historyWriteGate.WaitAsync();
		try
		{
			Directory.CreateDirectory(FileSystem.AppDataDirectory);
			var temporaryPath = WatchHistoryPath + ".tmp";
			await File.WriteAllTextAsync(temporaryPath, json);
			File.Move(temporaryPath, WatchHistoryPath, true);
		}
		catch (Exception)
		{
			// Playback must continue even if persistence is temporarily unavailable.
		}
		finally
		{
			_historyWriteGate.Release();
		}
	}

	private void HandleWindowAction(string action)
	{
#if WINDOWS
		var sequence = Interlocked.Increment(ref _windowCommandSequence);
		var safeAction = SanitizeDiagnosticToken(action, 32);
		_ = AppendPlaybackDiagnosticAsync($"[{DateTimeOffset.Now:O}] event=window-command-received sequence={sequence} action={safeAction}{Environment.NewLine}");
		var stopwatch = Stopwatch.StartNew();
		try
		{
			_ = AppendPlaybackDiagnosticAsync($"[{DateTimeOffset.Now:O}] event=window-command-start sequence={sequence} action={safeAction}{Environment.NewLine}");
			if (string.Equals(action, "close", StringComparison.OrdinalIgnoreCase))
				ClearPlaybackHeaderRule();

			var mauiWindow = GetParentWindow();
			if (mauiWindow is null) throw new InvalidOperationException("window-unavailable");
			WindowChrome.HandleAction(mauiWindow, action);
			stopwatch.Stop();
			_ = AppendPlaybackDiagnosticAsync($"[{DateTimeOffset.Now:O}] event=window-command-complete sequence={sequence} action={safeAction} elapsedMs={stopwatch.ElapsedMilliseconds}{Environment.NewLine}");
		}
		catch (Exception exception)
		{
			stopwatch.Stop();
			_ = AppendPlaybackDiagnosticAsync($"[{DateTimeOffset.Now:O}] event=window-command-failed sequence={sequence} action={safeAction} elapsedMs={stopwatch.ElapsedMilliseconds} error={exception.GetType().Name}{Environment.NewLine}");
		}
#endif
	}
}
