namespace AuraPlay.Models.Api;

public sealed class HomeResponse
{
	public IReadOnlyList<AnimeSummary> Featured { get; init; } = [];
	public IReadOnlyList<AnimeSummary> PopularSeason { get; init; } = [];
	public IReadOnlyList<AnimeSummary> RecentReleases { get; init; } = [];
	public DateTimeOffset? UpdatedAt { get; init; }
	public bool Stale { get; init; }
}
