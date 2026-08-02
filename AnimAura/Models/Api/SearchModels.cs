namespace AuraPlay.Models.Api;

public sealed class SearchPage<T>
{
	public IReadOnlyList<T> Items { get; init; } = [];
	public int Page { get; init; }
	public int Limit { get; init; }
	public int Count { get; init; }
	public int? Total { get; init; }
	public bool HasNextPage { get; init; }
}

public sealed class RemoteAnimeSummary
{
	public int AnilistId { get; init; }
	public int? MalId { get; init; }
	public required string Title { get; init; }
	public IReadOnlyList<string> AlternativeTitles { get; init; } = [];
	public string? NormalizedTitle { get; init; }
	public int? Year { get; init; }
	public string? Format { get; init; }
	public int? ExpectedEpisodeCount { get; init; }
	public string? CoverUrl { get; init; }
	public string? Status { get; init; }
}
