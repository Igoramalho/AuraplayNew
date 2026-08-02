using System.Text.RegularExpressions;

namespace AuraPlay.Services;

public sealed record HlsCodecProbe(string Mime, string Codec);

public sealed record HlsPlaylistDiagnostic(
	int VariantCount,
	IReadOnlyList<string> Codecs,
	IReadOnlyList<string> Resolutions,
	bool AudioPresent,
	bool VideoPresent,
	string Container,
	bool EncryptionPresent,
	bool InitializationMapPresent,
	string SegmentType,
	IReadOnlyList<HlsCodecProbe> Probes);

public static partial class HlsPlaylistDiagnostics
{
	private const int MaxPlaylistCharacters = 2 * 1024 * 1024;

	public static HlsPlaylistDiagnostic Parse(string playlist)
	{
		if (playlist.Length > MaxPlaylistCharacters)
			throw new ArgumentException("Playlist excede o limite de diagnóstico.", nameof(playlist));

		var variants = 0;
		var codecs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
		var resolutions = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
		var encryption = false;
		var initializationMap = false;
		var sawTransportStream = false;
		var sawFragmentedMp4 = false;

		foreach (var rawLine in playlist.Split('\n'))
		{
			var line = rawLine.Trim();
			if (line.StartsWith("#EXT-X-STREAM-INF:", StringComparison.OrdinalIgnoreCase))
			{
				variants++;
				foreach (Match match in CodecsRegex().Matches(line))
					foreach (var codec in match.Groups[1].Value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
						if (IsSafeCodec(codec)) codecs.Add(codec);

				var resolution = ResolutionRegex().Match(line);
				if (resolution.Success) resolutions.Add(resolution.Groups[1].Value.ToLowerInvariant());
			}
			else if (line.StartsWith("#EXT-X-KEY:", StringComparison.OrdinalIgnoreCase))
			{
				var method = MethodRegex().Match(line);
				encryption |= !method.Success || !string.Equals(method.Groups[1].Value, "NONE", StringComparison.OrdinalIgnoreCase);
			}
			else if (line.StartsWith("#EXT-X-MAP:", StringComparison.OrdinalIgnoreCase))
			{
				initializationMap = true;
				sawFragmentedMp4 = true;
			}
			else if (line.Length > 0 && !line.StartsWith('#'))
			{
				var path = line.Split('?', '#')[0];
				if (path.EndsWith(".ts", StringComparison.OrdinalIgnoreCase)) sawTransportStream = true;
				if (path.EndsWith(".m4s", StringComparison.OrdinalIgnoreCase) || path.EndsWith(".mp4", StringComparison.OrdinalIgnoreCase) || path.EndsWith(".cmfv", StringComparison.OrdinalIgnoreCase) || path.EndsWith(".cmfa", StringComparison.OrdinalIgnoreCase)) sawFragmentedMp4 = true;
			}
		}

		var segmentType = sawFragmentedMp4 ? "fMP4" : sawTransportStream ? "TS" : "unknown";
		var container = segmentType == "fMP4" ? "mp4" : segmentType == "TS" ? "mp2t" : "unknown";
		var videoCodecs = codecs.Where(IsVideoCodec).ToArray();
		var audioCodecs = codecs.Where(IsAudioCodec).ToArray();
		var probes = BuildProbes(container, videoCodecs, audioCodecs);

		return new HlsPlaylistDiagnostic(
			variants,
			codecs.Order(StringComparer.OrdinalIgnoreCase).ToArray(),
			resolutions.Order(StringComparer.OrdinalIgnoreCase).ToArray(),
			audioCodecs.Length > 0 || playlist.Contains("TYPE=AUDIO", StringComparison.OrdinalIgnoreCase),
			videoCodecs.Length > 0 || variants > 0,
			container,
			encryption,
			initializationMap,
			segmentType,
			probes);
	}

	public static IReadOnlyList<HlsCodecProbe> CreateProbes(string container, IEnumerable<string> observedCodecs)
	{
		var codecs = observedCodecs.Where(IsSafeCodec).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
		return BuildProbes(container, codecs.Where(IsVideoCodec).ToArray(), codecs.Where(IsAudioCodec).ToArray());
	}

	private static IReadOnlyList<HlsCodecProbe> BuildProbes(string container, IReadOnlyList<string> videoCodecs, IReadOnlyList<string> audioCodecs)
	{
		var result = new List<HlsCodecProbe>();
		var videoMime = container == "mp2t" ? "video/mp2t" : "video/mp4";
		var audioMime = container == "mp2t" ? "audio/mp2t" : "audio/mp4";
		foreach (var videoCodec in videoCodecs)
		{
			var combined = new[] { videoCodec }.Concat(audioCodecs).ToArray();
			result.Add(new HlsCodecProbe(videoMime, string.Join(',', combined)));
			result.Add(new HlsCodecProbe(videoMime, videoCodec));
			if (audioCodecs.Count > 0)
				result.Add(new HlsCodecProbe(videoMime, string.Join(", ", combined)));
		}
		if (audioCodecs.Count > 0)
			result.Add(new HlsCodecProbe(audioMime, string.Join(',', audioCodecs)));
		return result.Distinct().ToArray();
	}

	private static bool IsSafeCodec(string codec) => codec.Length is > 0 and <= 80 && codec.All(character => char.IsLetterOrDigit(character) || character is '.' or '-' or '_');
	private static bool IsVideoCodec(string codec) => codec.StartsWith("avc", StringComparison.OrdinalIgnoreCase) || codec.StartsWith("hvc", StringComparison.OrdinalIgnoreCase) || codec.StartsWith("hev", StringComparison.OrdinalIgnoreCase) || codec.StartsWith("av01", StringComparison.OrdinalIgnoreCase) || codec.StartsWith("vp", StringComparison.OrdinalIgnoreCase);
	private static bool IsAudioCodec(string codec) => codec.StartsWith("mp4a", StringComparison.OrdinalIgnoreCase) || codec.StartsWith("ac-3", StringComparison.OrdinalIgnoreCase) || codec.StartsWith("ec-3", StringComparison.OrdinalIgnoreCase) || codec.StartsWith("opus", StringComparison.OrdinalIgnoreCase) || codec.StartsWith("vorbis", StringComparison.OrdinalIgnoreCase);

	[GeneratedRegex("CODECS=\"([^\"]+)\"", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
	private static partial Regex CodecsRegex();
	[GeneratedRegex("RESOLUTION=([0-9]+x[0-9]+)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
	private static partial Regex ResolutionRegex();
	[GeneratedRegex("METHOD=([^,]+)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
	private static partial Regex MethodRegex();
}
