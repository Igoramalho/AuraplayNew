namespace AuraPlay.Models.Api;

public sealed class AnimeSummary
{
	public required string Id { get; init; }
	public int? AnilistId { get; init; }
	public int? MalId { get; init; }
	public required string Title { get; init; }
	public IReadOnlyList<string> AlternativeTitles { get; init; } = [];
	public string? CoverUrl { get; init; }
	public string? BannerUrl { get; init; }
	public int? AverageScore { get; init; }
	public int? Year { get; init; }
	public string? Season { get; init; }
	public string? Status { get; init; }
	public int? ExpectedEpisodeCount { get; init; }
	public int AvailableEpisodeCount { get; init; }
	public string? PlaybackStatus { get; init; }
	public IReadOnlyList<string> Genres { get; init; } = [];
	public NextEpisodeInfo? NextEpisode { get; init; }
}

public sealed class NextEpisodeInfo
{
	public int Number { get; init; }
	public DateTimeOffset? AiringAt { get; init; }
}

public sealed class AnimeDetails
{
	public required string Id { get; init; }
	public int? AnilistId { get; init; }
	public int? MalId { get; init; }
	public required string Title { get; init; }
	public IReadOnlyList<string> AlternativeTitles { get; init; } = [];
	public string? CoverUrl { get; init; }
	public string? BannerUrl { get; init; }
	public int? AverageScore { get; init; }
	public int? Year { get; init; }
	public string? Season { get; init; }
	public string? Status { get; init; }
	public int? ExpectedEpisodeCount { get; init; }
	public int AvailableEpisodeCount { get; init; }
	public string? PlaybackStatus { get; init; }
	public NextEpisodeInfo? NextEpisode { get; init; }
	public string? Description { get; init; }
	public IReadOnlyList<string> Genres { get; init; } = [];
	public string? Format { get; init; }
	public IReadOnlyList<AnimeTitle> Titles { get; init; } = [];
	public IReadOnlyList<AnimeRelation> Relations { get; init; } = [];
	public IReadOnlyList<SeasonSummary> Seasons { get; init; } = [];
	public DateTimeOffset? LastUpdatedAt { get; init; }
}

public sealed class AnimeTitle
{
	public required string Title { get; init; }
	public string? Language { get; init; }
	public string? Type { get; init; }
}

public sealed class AnimeRelation
{
	public int AnilistId { get; init; }
	public string? Type { get; init; }
}

public sealed class SeasonSummary
{
	public required string Id { get; init; }
	public int Number { get; init; }
	public required string Title { get; init; }
	public int DisplayOrder { get; init; }
}
