namespace AuraPlay.Services;

public enum PlaybackResourceKind
{
	Manifest,
	Level,
	Fragment,
	Part,
	Key,
	Subtitle
}

public sealed record PlaybackScopeAnalysis(
	bool Accepted,
	string RejectionReason,
	string NormalizedResourceKind,
	bool SameOrigin,
	bool InsideMasterDirectory,
	bool InsideLevelDirectory,
	string Scheme,
	int Port,
	string OriginKey,
	string PathPrefix,
	string FilterPattern,
	string Extension);

public static class PlaybackScopePolicy
{
	public const int MaxOriginsPerSession = 3;
	public const int MaxPrefixesPerOrigin = 4;
	public const int MaxRulesPerSession = 8;
	private static readonly Dictionary<string, PlaybackResourceKind> AllowedKinds = new(StringComparer.Ordinal)
	{
		["manifest"] = PlaybackResourceKind.Manifest,
		["level"] = PlaybackResourceKind.Level,
		["audioTrack"] = PlaybackResourceKind.Level,
		["fragment"] = PlaybackResourceKind.Fragment,
		["frag"] = PlaybackResourceKind.Fragment,
		["part"] = PlaybackResourceKind.Part,
		["key"] = PlaybackResourceKind.Key,
		["subtitle"] = PlaybackResourceKind.Subtitle,
		["subtitleTrack"] = PlaybackResourceKind.Subtitle
	};

	public static bool TryNormalizeResourceKind(string resourceKind, out PlaybackResourceKind normalizedKind) =>
		AllowedKinds.TryGetValue(resourceKind, out normalizedKind);

	public static PlaybackScopeAnalysis Analyze(Uri masterUri, Uri? levelUri, string requestedUrl, string resourceKind)
	{
		if (!TryNormalizeResourceKind(resourceKind, out var normalizedKind)) return Rejected("resource-kind");
		if (!Uri.TryCreate(requestedUrl, UriKind.Absolute, out var requestedUri)) return Rejected("invalid-url");
		if (requestedUri.Scheme != Uri.UriSchemeHttps) return Rejected("insecure-scheme");
		if (requestedUri.Port != masterUri.Port) return Rejected("unexpected-port");

		var masterDirectory = DirectoryPrefix(masterUri);
		var levelDirectory = levelUri is null ? string.Empty : DirectoryPrefix(levelUri);
		var requestDirectory = DirectoryPrefix(requestedUri);
		var sameOrigin = SameOrigin(masterUri, requestedUri);
		var insideMaster = sameOrigin && requestedUri.AbsolutePath.StartsWith(masterDirectory, StringComparison.Ordinal);
		var insideLevel = levelUri is not null && SameOrigin(levelUri, requestedUri) && requestedUri.AbsolutePath.StartsWith(levelDirectory, StringComparison.Ordinal);
		var origin = requestedUri.GetLeftPart(UriPartial.Authority);
		return new PlaybackScopeAnalysis(
			true,
			"none",
			ToDiagnosticToken(normalizedKind),
			sameOrigin,
			insideMaster,
			insideLevel,
			requestedUri.Scheme,
			requestedUri.Port,
			origin,
			requestDirectory,
			$"{origin}{requestDirectory}*",
			SafeExtension(requestedUri));
	}

	public static string CheckLimits(bool originExists, int originCount, int prefixCount, int ruleCount)
	{
		if (!originExists && originCount >= MaxOriginsPerSession) return "origin-limit";
		if (prefixCount >= MaxPrefixesPerOrigin) return "prefix-limit";
		if (ruleCount >= MaxRulesPerSession) return "rule-limit";
		return "none";
	}

	private static PlaybackScopeAnalysis Rejected(string reason) =>
		new(false, reason, "unknown", false, false, false, "none", 0, string.Empty, string.Empty, string.Empty, "none");

	private static string ToDiagnosticToken(PlaybackResourceKind kind) => kind switch
	{
		PlaybackResourceKind.Manifest => "manifest",
		PlaybackResourceKind.Level => "level",
		PlaybackResourceKind.Fragment => "fragment",
		PlaybackResourceKind.Part => "part",
		PlaybackResourceKind.Key => "key",
		PlaybackResourceKind.Subtitle => "subtitle",
		_ => "unknown"
	};

	private static bool SameOrigin(Uri left, Uri right) =>
		string.Equals(left.Scheme, right.Scheme, StringComparison.OrdinalIgnoreCase) &&
		string.Equals(left.Host, right.Host, StringComparison.OrdinalIgnoreCase) &&
		left.Port == right.Port;

	private static string DirectoryPrefix(Uri uri)
	{
		var separator = uri.AbsolutePath.LastIndexOf('/');
		return separator >= 0 ? uri.AbsolutePath[..(separator + 1)] : "/";
	}

	private static string SafeExtension(Uri uri)
	{
		var extension = Path.GetExtension(uri.AbsolutePath).ToLowerInvariant();
		return extension.Length is > 0 and <= 16 && extension.All(character => char.IsLetterOrDigit(character) || character == '.') ? extension : "unknown";
	}
}
