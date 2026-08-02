using AuraPlay.Models.Api;

namespace AuraPlay.Services;

public interface IAuraPlayApiClient
{
	Task<HomeResponse> GetHomeAsync(CancellationToken cancellationToken = default);
	Task<SearchPage<AnimeSummary>> SearchAsync(string query, int page, int limit, CancellationToken cancellationToken = default);
	Task<SearchPage<RemoteAnimeSummary>> SearchRemoteAsync(string query, int page, int limit, CancellationToken cancellationToken = default);
	Task<AnimeDetails> GetAnimeAsync(string animeId, CancellationToken cancellationToken = default);
	Task<EpisodesResponse> GetEpisodesAsync(string animeId, CancellationToken cancellationToken = default);
	Task<PlaybackResponse> GetPlaybackAsync(string episodeId, CancellationToken cancellationToken = default);
}
