namespace AuraPlay.Models.Api;

public sealed class PlaybackResponse
{
	public string? ClientSessionId { get; set; }
	public required string Url { get; init; }
	public DateTimeOffset? ExpiresAt { get; init; }
	public string? MimeType { get; init; }
	public string? SelectedSourceId { get; init; }
	public IReadOnlyList<PlaybackSource> Sources { get; init; } = [];
	public IReadOnlyDictionary<string, string> Headers { get; init; } = new Dictionary<string, string>();
	public IReadOnlyList<SubtitleTrack> SubtitleTracks { get; init; } = [];
	public PlaybackMarker? Intro { get; init; }
	public PlaybackMarker? Outro { get; init; }
	public string? SelectedAudioType { get; init; }
	public string? AudioLanguage { get; init; }
	public string? PosterUrl { get; init; }
	public IReadOnlyList<object> AuxiliaryTracks { get; init; } = [];
	public IReadOnlyList<object> Qualities { get; init; } = [];
}

public sealed class PlaybackSource
{
	public required string SourceId { get; init; }
	public required string Url { get; init; }
	public string? MimeType { get; init; }
	public string? Type { get; init; }
	public IReadOnlyDictionary<string, string> Headers { get; init; } = new Dictionary<string, string>();
	public bool IsM3u8 { get; init; }
	public string? Quality { get; init; }
	public string? AudioType { get; init; }
	public string? Language { get; init; }
	public IReadOnlyList<SubtitleTrack> SubtitleTracks { get; init; } = [];
	public PlaybackMarker? Intro { get; init; }
	public PlaybackMarker? Outro { get; init; }
}

public sealed class SubtitleTrack
{
	public required string Url { get; init; }
	public string? Language { get; init; }
	public string? Label { get; init; }
	public string? Kind { get; init; }
	public bool Default { get; init; }
}

public sealed class PlaybackMarker
{
	public double Start { get; init; }
	public double End { get; init; }
}
