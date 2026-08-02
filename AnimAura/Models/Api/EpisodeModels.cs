namespace AuraPlay.Models.Api;

public sealed class EpisodesResponse
{
	public required string AnimeId { get; init; }
	public string? PlaybackStatus { get; init; }
	public IReadOnlyList<SeasonWithEpisodes> Seasons { get; init; } = [];
}

public sealed class SeasonWithEpisodes
{
	public required string Id { get; init; }
	public int Number { get; init; }
	public required string Title { get; init; }
	public IReadOnlyList<EpisodeSummary> Episodes { get; init; } = [];
}

public sealed class EpisodeSummary
{
	public required string Id { get; init; }
	public int Number { get; init; }
	public required string Title { get; init; }
	public int? DurationSeconds { get; init; }
	public string? ThumbnailUrl { get; init; }
	public string? AudioType { get; init; }
	public bool Available { get; init; }
}
