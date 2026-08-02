import { ImpitOptions, RequestInit, ImpitResponse } from 'impit';
export { Browser } from 'impit';

interface ClientOptions extends ImpitOptions {
    rateLimit?: {
        requestsPerInterval?: number;
        intervalMs?: number;
        concurrency?: number;
    };
}
declare class Client {
    private readonly impit;
    private readonly queue?;
    constructor(options?: ClientOptions);
    fetch(url: string | URL, options: RequestInit): Promise<ImpitResponse>;
}

interface ClientConfig extends ClientOptions {
}
declare abstract class BaseClass {
    protected readonly client: Client;
    protected readonly STATUS_TEXT_MAP: Record<number, string>;
    constructor(options?: ClientConfig);
    protected formatHttpError(statusCode: number, statusText?: string): string;
    protected createSlug(text: string): string;
    protected createSearchableTitle(text: string): string;
    protected normalizeKey(input: string): string;
    protected getMappedValue<T extends string, U extends string>(input: T, mapping: Record<string, U>): U;
}

interface IBase {
    id: string | number | null;
    name: string | null;
    posterImage?: string | null;
    [x: string]: any;
}
interface IBaseEpisodes {
    episodeId: string | null;
    episodeNumber: number | null;
    title?: string | null;
    [x: string]: any;
}
interface IBaseMediaInfo extends IBase {
    type: string | null;
    releaseDate: string | number | null;
    synopsis: string | null;
    score?: number | null;
    studios?: string | string[] | null;
    [x: string]: any;
}
interface IServers {
    serverId: number | string | null;
    serverName: string | null;
    [x: string]: any;
}
interface IResponse<T> {
    data: T;
    error?: string;
    status?: number;
}
interface ISubtitles {
    url: string | null;
    lang: string | null;
    default?: boolean | null;
}
interface IOutro {
    start: number | null;
    end: number | null;
}
interface ITracks {
    url: string | null;
    type: string | null;
    quality?: string | null;
}
interface IVideoSource {
    intro?: IOutro;
    outro?: IOutro;
    subtitles?: ISubtitles[];
    tracks?: ITracks[];
    sources: ISource[];
    download?: string | null;
    posterImage?: string | null;
}
interface ISource {
    url: string | null;
    isM3u8: boolean | null;
    type: string | null;
    quality?: string | null;
}
type IAnimeCategory = 'MOVIE' | 'TV' | 'ONA' | 'OVA' | 'SPECIALS';
interface ISourceBaseResponse<T> extends IResponse<T> {
    headers: {
        Referer: string | null;
    };
}
interface IBasePaginated<T> extends IResponse<T> {
    hasNextPage: boolean;
    currentPage: number;
}

interface IBaseAnime extends IBase {
    romaji: string | null;
    type?: string | null;
    [x: string]: any;
}
interface IBaseAnimeInfo extends IBaseMediaInfo {
    romaji: string | null;
    type: string | null;
    episodes?: {
        sub: number | null;
        dub: number | null;
    };
    altTiles?: string[] | [] | null;
    [x: string]: any;
}
interface IBaseAnimeEpisodes extends IBaseEpisodes {
    hasSub: boolean;
    hasDub: boolean;
    hasRaw?: boolean | unknown;
    [x: string]: any;
}
interface IAnimeServers extends IServers {
    mediaId: number | string | null;
    eid?: string | null;
}
interface IAnimeServerInfo {
    sub: IAnimeServers[];
    dub: IAnimeServers[];
    raw: IAnimeServers[];
    episodeNumber: number | null;
}
type ISubOrDub = 'sub' | 'dub' | 'raw';
interface IAnimeInfoResponse<T> extends IResponse<T> {
    providerEpisodes: IBaseEpisodes[] | [];
}
interface IBaseAnimePaginated<T> extends IBasePaginated<T> {
    hasNextPage: boolean;
    currentPage: number;
    [x: string]: any;
}
interface IBaseAnimeHomeResponse<T> extends IResponse<T> {
    [x: string]: any;
}
type IBaseAnimeResponse<T> = IResponse<T> & {
    [key: string]: any;
};
type AnikotoServers = 'vidstream-2' | 'vidcloud-1' | 'vidplay-1' | 'hd-1';
interface ScheduleDay {
    day: string;
    date: string;
    timestamp: number | null;
    anime: IBase[];
}

/**
 * @class AnimeParser
 * @extends BaseClass
 * * @description
 * An abstract base architecture designed for scraping and parsing streaming platforms.
 * It enforces a consistent contract for fetching external public data (`search`, `fetchAnimeInfo`, `fetchSources`)
 * while encapsulating site-specific HTML parsing via internal protected hooks.
 *
 */
declare abstract class AnimeParser extends BaseClass {
    /**
     * The root canonical URL of the specific streaming provider target.
     * Used as the base anchor for relative query endpoints and network navigation.
     */
    protected baseUrl: string;
    /**
     * Initializes the base scraper client with site-specific configurations and global HTTP client options.
     *  @param baseUrl - The base web domain or address of the targeted streaming platform.
     * @param options - Configuration settings for the underlying HTTP client engine (headers,fingerprints,rate limits, timeouts).
     * @protected This constructor can only be invoked by derived child implementations via `super()`.
     */
    protected constructor(baseUrl: string, options: ClientOptions);
    /**
     * Searches for anime by keyword.
     *
     * @param query Search keyword
     * @param args
     * @returns Search results with anime list
     */
    abstract search(query: string, ...args: any[]): Promise<IResponse<IBase[] | []>> | Promise<IBaseAnimePaginated<IBaseAnime[] | []>>;
    /**
     * Fetches detailed information about a specific anime, including metadata and episode list.
     *
     * @param id Anime ID (series slug)
     * @returns Anime details with or without  provider episodes
     */
    abstract fetchAnimeInfo(id: string): Promise<IResponse<IBaseAnimeInfo | null>> | Promise<IAnimeInfoResponse<IBaseMediaInfo | null>>;
    /**
     * Fetches streaming sources for a given episode.
     *
     * @param episodeId Episode identifier (or direct server URL if starts with http)
     * @param args additional params such as servers, version (audio language )
     * @returns Streaming source data with headers
     */
    abstract fetchSources(episodeId: string, ...args: any[]): Promise<ISourceBaseResponse<IVideoSource | null>>;
}

/**
 * Anizone class for interacting with the Anizone anime streaming platform.
 * Extends BaseClass to provide functionality for searching anime, fetching anime details,
 * retrieving video sources for episodes, and fetching recent updates.
 * @extends BaseClass
 */
declare class Anizone extends AnimeParser {
    constructor(baseUrl?: string, options?: ClientConfig);
    /**
     * Searches for anime on the Anizone platform using a query string.
     * @param {string} query - The search query for finding anime.
     * @returns - A promise resolving to an object containing search results or an error message.
     */
    search(query: string): Promise<IResponse<IBase[] | []>>;
    /**
     * Fetches recent updates from the Anizone homepage, including recently added anime and latest episodes.
     * @returns - A promise resolving to an object containing arrays of recently added anime, latest episodes, or an error message.
     */
    fetchUpdates(): Promise<IBaseAnimeResponse<IBaseEpisodes[] | []>>;
    /**
     * Fetches detailed information and episode list for a specific anime.
     * @param {string} animeId - The unique identifier for the anime.
     * @returns - A promise resolving to an object containing anime details and episodes or an error message.
     */
    fetchAnimeInfo(animeId: string): Promise<IAnimeInfoResponse<IBaseMediaInfo | null>>;
    /**
     * Fetches video sources and related metadata for a specific episode.
     * @param {string} episodeId - The unique identifier for the episode.
     * @returns {Promise<ISourceBaseResponse<IVideoSource | null>>} - A promise resolving to an object containing video sources, headers, or an error message.
     */
    fetchSources(episodeId: string): Promise<ISourceBaseResponse<IVideoSource | null>>;
    /**
     * Parses search results from the Anizone website to extract anime information.
     * @private
     * @param {cheerio.CheerioAPI} $ - Cheerio instance for parsing HTML.
     * @returns - An object containing an array of parsed anime data or an empty array.
     */
    private parseSearchResults;
    /**
     * Parses anime information and episode data from the Anizone anime page.
     * @private
     * @param {cheerio.CheerioAPI} $ - Cheerio instance for parsing HTML.
     * @returns - An object containing parsed anime info and episode data, or null if not found.
     */
    private parseAnimeinfo;
    /**
     * Parses video sources, subtitles, and other media data from an episode page.
     * @private
     * @param {cheerio.CheerioAPI} $ - Cheerio instance for parsing HTML.
     * @returns  - An object containing parsed video source data.
     */
    private parseSources;
    /**
     * Parses recent updates from the Anizone homepage, including recently added anime and latest episodes.
     * @private
     * @param {cheerio.CheerioAPI} $ - Cheerio instance for parsing HTML.
     * @returns  - An object containing arrays of recently added anime and latest episodes.
     */
    private parseUpdates;
    private formatQuery;
}

interface IMetaMovie {
    tmdbId: number;
    name: string;
    originalName: string;
    posterImage: {
        small: string | null;
        medium: string | null;
        large: string | null;
        original: string | null;
    };
    coverImage: {
        small: string | null;
        medium: string | null;
        large: string | null;
        original: string | null;
    };
    country?: string;
    type?: string;
    status?: string;
    language: string;
    runtime?: number;
    releaseDate: string;
    summary: string;
    genres: string;
    rating: string;
}
interface IMovieInfo extends IMetaMovie {
    artWorks: IMetaMovieArtworks;
}
interface IMetaMovieSeasons {
    airDate: string;
    id: string;
    name: string;
    rating: string;
    totalEpisodes: number;
    summary: string;
    seasonNumber: string;
    posterImage: {
        small: string;
        medium: string;
        large: string;
        original: string;
    };
}
interface IArtWorks {
    height: number;
    width: number;
    small: string;
    medium: string;
    large: string;
    original: string;
}
interface IMetaMovieArtworks {
    coverImages: IArtWorks[] | [];
    logos: IArtWorks[] | [];
    posterImages: IArtWorks[] | [];
}
interface IMetaMovieEpisodes {
    absoluteEpisodeNumber: number | null;
    airDate: string | null;
    episodeNumber: number | null;
    episodeType?: string | null;
    tmdbEpisodeId: number | null;
    title: string | null;
    summary: string | null;
    rating: number | null;
    seasonNumber: number | null;
    tmdbId?: number | null;
    runtime: string | null;
    images: {
        small: string;
        medium: string;
        large: string;
        original: string;
    };
}
interface IMetaMoviePaginated<T> extends IBasePaginated<T> {
    lastPage: number;
    totalResults: number;
}
interface IAnimeListItem {
    tmdbId: number;
    name: string;
    originalName: string;
    posterImage: {
        small: string | null;
        medium: string | null;
        large: string | null;
        original: string | null;
    };
    coverImage: {
        small: string | null;
        medium: string | null;
        large: string | null;
        original: string | null;
    };
    rating: number | null;
    genres: string;
    episodes: number | string | null;
    status: string;
    country?: string;
    language: string;
    totalSeasons: number | null;
    summary: string;
    releaseDate: string;
    lastAired: string;
    latestEpisode: {
        episodeId: string;
        title: string;
        episodeNumber: number;
        episodeType: string;
        season: number;
        summary: string;
        rating: number;
        airDate: string;
    } | null;
    nextEpisode: {
        episodeId: number;
        title: string;
        episodeType: string;
        episodeNumber: number;
        season: number;
        summary: string;
        rating: number;
        airDate: string;
    } | null;
    seasons: IMetaMovieSeasons[];
    artWorks: IMetaMovieArtworks;
}

/**
 * Anikoto (anikototv.to) anime scraper.
 *
 * Provides methods to search for anime, fetch detailed information, retrieve episode lists,
 * get available streaming servers, and access curated anime lists (most popular, recently updated, etc.).
 */
declare class Anikoto extends AnimeParser {
    private MegaPlay;
    private VidWish;
    private VidPlay;
    constructor(baseUrl?: string, options?: ClientOptions);
    /**
     * Fetches the home page data including spotlight, recent updates, upcoming anime, and categorized sections.
     */
    fetchHome(): Promise<IBaseAnimeHomeResponse<IBaseAnime[] | []>>;
    /**
     * Fetches the anime schedule .
     *
     * @param timezone - User timezone offset in hours (numeric value, e.g. 3, -5, 0)
     *
     * @returns A parsed schedule structure or an error object if the request fails
     *
     * @example
     * fetchSchedule(3); // UTC+3
     * fetchSchedule(-5); // UTC-5
     */
    fetchSchedule(timezone: number): Promise<IResponse<ScheduleDay[] | []>>;
    /**
     * Searches for anime by keyword.
     *
     * @param query Search keyword
     * @param page
     * @returns Search results with anime list
     */
    search(query: string, page?: number): Promise<IBaseAnimePaginated<IBaseAnime[] | []>>;
    /**
     * Fetches search suggestions for a given query string .
     * @param  query - The search query string (required).
      @returns A promise that resolves to an object containing an array of anime titles or an error message.
     */
    searchSuggestions(query: string): Promise<IResponse<IBaseAnime[] | []>>;
    /**
     * Fetches detailed information about a specific anime, including metadata and episode list.
     *
     * @param id Anime ID (series slug)
     * @returns Anime details + provider episodes
     */
    fetchAnimeInfo(id: string): Promise<IAnimeInfoResponse<IBaseAnimeInfo | null>>;
    /**
     * Fetches detailed information about a specific anime, including metadata and episode list.
     *
     * @param id Anime ID (series slug)
     * @returns  provider episodes
     */
    fetchProviderEpisodes(id: string): Promise<IResponse<IBaseAnimeEpisodes[] | []>>;
    /**
     * Fetches a paginated list of most popular anime.
     * @param page Page number (default: 1)
     */
    fetchMostPopular(page?: number): Promise<IBaseAnimePaginated<IBaseAnime[] | []>>;
    /**
     * Fetches a paginated list of recently updated anime.
     * @param page Page number (default: 1)
     */
    fetchRecentlyUpdated(page?: number): Promise<IBaseAnimePaginated<IBaseAnime[] | []>>;
    /**
     * Fetches a paginated list of recently added anime.
     * @param page Page number (default: 1)
     */
    fetchRecentlyAdded(page?: number): Promise<IBaseAnimePaginated<IBaseAnime[] | []>>;
    /**
     * Fetches a paginated list of upcoming (not yet aired) anime.
     * @param page Page number (default: 1)
     */
    fetchUpcoming(page?: number): Promise<IBaseAnimePaginated<IBaseAnime[] | []>>;
    /**
     * Fetches a paginated list of currently releasing anime.
     * @param page Page number (default: 1)
     */
    fetchReleasing(page?: number): Promise<IBaseAnimePaginated<IBaseAnime[] | []>>;
    /**
     * Fetches a paginated list of recently completed anime.
     * @param page Page number (default: 1)
     */
    fetchRecentlyCompleted(page?: number): Promise<IBaseAnimePaginated<IBaseAnime[] | []>>;
    /**
     * Fetches a paginated list of anime by category (TV, Movie, ONA, etc.).
     * @param format Anime category
     * @param page Page number (default: 1)
     */
    fetchAnimeCategory(format: IAnimeCategory, page?: number): Promise<IBaseAnimePaginated<IBaseAnime[] | []>>;
    /**
     * Fetches a list of anime titles sorted alphabetically, optionally filtered by a starting character.
     * @param  sort Optional letter (A-Z) or "0-9" to filter anime
     * @param  page - Page number for pagination (default: 1)
     * @returns  Promise resolving to an object  with alphabetically sorted anime and pagination details
     */
    fetchAtoZList(sort?: any, page?: number): Promise<IBaseAnimePaginated<IBaseAnime[] | []>>;
    /**
     * Fetches a list of anime by genre.
     * @param  genre -The genre to filter anime by
     * @param  page - Page number for pagination (default: 1)
     * @returns  Promise resolving to an object with genre-specific anime and pagination details
     */
    fetchGenre(genre: string, page?: number): Promise<IBaseAnimePaginated<[] | IBaseAnime[]>>;
    /**
     * Fetches available streaming servers for a specific episode.
     *
     * @param episodeId Episode identifier
     * @returns Server information grouped by sub/dub/raw
     */
    fetchServers(episodeId: string): Promise<IResponse<IAnimeServerInfo | null>>;
    /**
     * Fetches streaming sources for a given episode.
     *
     * @param episodeId Episode identifier (or direct server URL if starts with http)
     * @param version Audio version - `'sub'` or `'dub'` (default: `'sub'`)
     * @param server Preferred server name (default: `'vidstream-2'`)
     * @returns Streaming source data with headers
     */
    fetchSources(episodeId: string, version?: ISubOrDub, server?: AnikotoServers): Promise<ISourceBaseResponse<IVideoSource | null>>;
    /**
     * Parses anime items from home page sections.
     * @param $ Cheerio instance
     * @param selector CSS selector for the anime items
     */
    private parseHomeAnimeSectoons;
    /**
     * Parses newly added/completed/released anime items.
     * @param $ Cheerio instance
     * @param selector CSS selector for the items
     */
    private parseNewAddedItems;
    /**
     * Parses top  anime items.
     * @param $ Cheerio instance
     * @param selector CSS selector for the items
     */
    private parseTopAnimeSegement;
    /**
     * Parses the home page content including spotlight, recent updates, upcoming, etc.
     * @param $ Cheerio instance with loaded home page HTML
     */
    private parseHome;
    /**
     * Parses the schedule from ajax html
     * @param $ Cheerio instance with loaded home page HTML
     */
    private parseSchedule;
    /**
     * Parses detailed anime information from the watch/info page.
     * @param $ Cheerio instance
     */
    private parseAnimeinfo;
    /**
     * Parses paginated anime results (used for most popular, recently updated, etc.).
     * @param $ Cheerio instance
     */
    private parsePaginatedSections;
    /**
     * Parses episode list from AJAX response.
     * @param $ Cheerio instance
     */
    private parseEpisodes;
    /**
     * Parses available streaming servers for an episode.
     * @param $ Cheerio instance
     */
    private parseServers;
    /**
     * Parses search suggestion results from a Cheerio instance.
     * Extracts anime suggestion details from the provided HTML.
     * @param $ CheerioAPI instance
     * @returns An array containing an array of search suggestions
     */
    private parseSearchSuggessations;
    /**
     * Finds the best matching server ID based on preferences.
     *
     * Preference order:
     * - Exact server match in requested version (sub/dub)
     * - Preferred servers: `vidstream-2`, `vidcloud-1`
     * - Fallback to other available version if requested one is unavailable
     *
     * @param servers Server information from `fetchServers`
     * @param category Requested version (`sub` or `dub`)
     * @param server Preferred server name
     * @returns Media ID (eid) of the selected server
     * @throws Error if no servers are available
     */
    private findServerId;
    /**
     * Internal helper to fetch and parse paginated anime sections.
     * @param url Relative URL for the section
     */
    private fetchPaginatedSections;
}

declare class AniBD extends AnimeParser {
    constructor(baseUrl?: string, options?: ClientOptions);
    search(query: string, page?: number): Promise<IBaseAnimePaginated<IBaseAnime[] | []>>;
    fetchAnimeInfo(id: string): Promise<IAnimeInfoResponse<IBaseAnimeInfo | null>>;
    fetchEpisodes(id: number): Promise<IResponse<IBaseAnimeEpisodes[] | []>>;
    fetchSources(episodeId: string): Promise<ISourceBaseResponse<IVideoSource | null>>;
    private parseSources;
    /**
     * Extracts only the literal fields needed from a remote player configuration.
     * The input is untrusted JavaScript-like text from an embed response and must
     * never be evaluated or passed to a JavaScript runtime.
     */
    private parsePlayerConfig;
    private extractStringProperty;
}

declare class AniDB extends AnimeParser {
    constructor(baseUrl?: string, options?: ClientOptions);
    fetchAtoZLists(page?: number): Promise<IBaseAnimePaginated<IBase[] | []>>;
    /**
     * Searches for anime by keyword.
     *
     * @param query Search keyword
     * @param page page number
     * @returns Search results with anime list
     */
    search(query: string, page?: number): Promise<IBaseAnimePaginated<IBase[] | []>>;
    fetchAnimeInfo(id: string): Promise<IResponse<IBaseAnimeInfo | null>>;
    fetchEpisodes(id: string): Promise<IResponse<IBaseEpisodes[] | []>>;
    fetchServers(episodeId: string): Promise<IResponse<IAnimeServerInfo | null>>;
    fetchSources(episodeId: string, version?: ISubOrDub): Promise<ISourceBaseResponse<IVideoSource | null>>;
    /**
     * Parses search  results from a Cheerio instance.
     * Extracts anime  from the provided HTML.
     * @param $ CheerioAPI instance
     * @returns An array containing an array of search results
     */
    private parseSearchResults;
    /**
     * Parses detailed anime information from the watch/info page.
     * @param $ Cheerio instance
     * @returns An object  containing anime info results
     */
    private parseAnimeInfo;
    private parseRelations;
    /**
     * Finds available server IDs for a specific audio category from the parsed server data.
     * @private
     * @param servers - The parsed streaming server information.
     * @param {ISubOrDub} category - The audio category to filter servers for ('sub', 'dub', or 'raw').
     * @returns {Array<{serverId: string; serverName: string; downloadId: string | null}>} An array of server objects with IDs and download information.
     */
    private findServerIds;
    private parseSources;
}

declare class AnimeHeaven extends AnimeParser {
    constructor(baseUrl?: string, options?: ClientOptions);
    search(query: string): Promise<IResponse<IBase[] | []>>;
    fetchAnimeInfo(id: string): Promise<IAnimeInfoResponse<IBaseMediaInfo | null>>;
    fetchSources(episodeId: string): Promise<ISourceBaseResponse<IVideoSource | null>>;
    private parseSources;
    private parseAnimeinfo;
    private parseSearchResults;
}

declare class Kitsu extends BaseClass {
    private baseUrl;
    constructor(baseUrl?: string, options?: ClientOptions);
    search(query: string): Promise<{
        error: string;
        data: never[];
        status: number;
    } | {
        data: any;
        error?: undefined;
        status?: undefined;
    }>;
    searchSlug(query: string): Promise<{
        error: string;
        data: never[];
        status: number;
    } | {
        data: any;
        error?: undefined;
        status?: undefined;
    }>;
    fetchEpisodes(id: number): Promise<{
        error: string;
        data: never[];
        status: number;
    } | {
        data: any;
        error?: undefined;
        status?: undefined;
    }>;
    fetchMapping(id: number): Promise<{
        error: string;
        data: null;
        status: number;
    } | {
        data: {
            id: any;
            provider: string;
            name: any;
            romaji: any;
            score: null;
        };
        error?: undefined;
        status?: undefined;
    }>;
}

interface AnimeResult {
    id: string | number | null;
    name: string | null;
    romaji: string | null;
}
interface AnilistTitles {
    english: string | null;
    romaji: string | null;
}
declare abstract class BaseAnimeMeta extends BaseClass {
    protected anizone: Anizone;
    protected anikoto: Anikoto;
    protected anibd: AniBD;
    protected anidb: AniDB;
    protected animeheaven: AnimeHeaven;
    protected kitsu: Kitsu;
    constructor(options?: ClientConfig);
    protected findBestMatch(target: AnilistTitles, candidates: AnimeResult[]): AnimeResult | null;
    protected createTitleSlugV2(text: string): string;
    protected formatAnizipData(data: any): {
        animeTitles: {};
        mappings: {};
        episodes: never[];
        images?: undefined;
        titles?: undefined;
    } | {
        images: any;
        titles: {
            english: any;
            japanese: any;
            german: any;
            romanized: any;
            traditionalChinese: any;
            simplifiedChinese: any;
        };
        mappings: {
            animePlanetId: any;
            kitsuId: any;
            malId: any;
            anilistId: any;
            anisearchId: any;
            anidbId: any;
            notifymoeId: any;
            livechartId: any;
            imdbId: any;
            themoviedbId: any;
        };
        episodes: {
            episodeAnizipNumber: number | null;
            title: {
                english: any;
                japanese: any;
                german: any;
                romanizedJapanese: any;
            };
            airDate: any;
            runtime: any;
            overview: any;
            image: any;
            rating: number | null;
            aired: boolean;
        }[];
        animeTitles?: undefined;
    };
    protected anilistAnizip(id: number): Promise<{
        error: string;
        data: null;
        images?: undefined;
        titles?: undefined;
        episodes?: undefined;
        mapping?: undefined;
    } | {
        images: any;
        titles: {
            english: any;
            japanese: any;
            german: any;
            romanized: any;
            traditionalChinese: any;
            simplifiedChinese: any;
        } | undefined;
        episodes: never[] | {
            episodeAnizipNumber: number | null;
            title: {
                english: any;
                japanese: any;
                german: any;
                romanizedJapanese: any;
            };
            airDate: any;
            runtime: any;
            overview: any;
            image: any;
            rating: number | null;
            aired: boolean;
        }[];
        mapping: {
            animePlanetId: any;
            kitsuId: any;
            malId: any;
            anilistId: any;
            anisearchId: any;
            anidbId: any;
            notifymoeId: any;
            livechartId: any;
            imdbId: any;
            themoviedbId: any;
        } | {};
        error?: undefined;
        data?: undefined;
    }>;
    protected malAnizip(id: number): Promise<{
        error: string;
        data: null;
        images?: undefined;
        titles?: undefined;
        episodes?: undefined;
        mapping?: undefined;
    } | {
        images: any;
        titles: {
            english: any;
            japanese: any;
            german: any;
            romanized: any;
            traditionalChinese: any;
            simplifiedChinese: any;
        } | undefined;
        episodes: never[] | {
            episodeAnizipNumber: number | null;
            title: {
                english: any;
                japanese: any;
                german: any;
                romanizedJapanese: any;
            };
            airDate: any;
            runtime: any;
            overview: any;
            image: any;
            rating: number | null;
            aired: boolean;
        }[];
        mapping: {
            animePlanetId: any;
            kitsuId: any;
            malId: any;
            anilistId: any;
            anisearchId: any;
            anidbId: any;
            notifymoeId: any;
            livechartId: any;
            imdbId: any;
            themoviedbId: any;
        } | {};
        error?: undefined;
        data?: undefined;
    }>;
    protected mergeEpisodeData(providerEp: any, aniZipEp: any, tmdb: IMetaMovieEpisodes, provider: string): {
        episodeNumber: any;
        episodeId: any;
        title: any;
        rating: any;
        aired: any;
        airDate: any;
        overview: any;
        thumbnail: any;
        provider: string;
        hasDub: any;
        hasSub: any;
    };
    protected fetchAnizipByMapping(type: 'anilist_id' | 'mal_id', id: number): Promise<{
        error: string;
        data: null;
        images?: undefined;
        titles?: undefined;
        episodes?: undefined;
        mapping?: undefined;
    } | {
        images: any;
        titles: {
            english: any;
            japanese: any;
            german: any;
            romanized: any;
            traditionalChinese: any;
            simplifiedChinese: any;
        } | undefined;
        episodes: never[] | {
            episodeAnizipNumber: number | null;
            title: {
                english: any;
                japanese: any;
                german: any;
                romanizedJapanese: any;
            };
            airDate: any;
            runtime: any;
            overview: any;
            image: any;
            rating: number | null;
            aired: boolean;
        }[];
        mapping: {
            animePlanetId: any;
            kitsuId: any;
            malId: any;
            anilistId: any;
            anisearchId: any;
            anidbId: any;
            notifymoeId: any;
            livechartId: any;
            imdbId: any;
            themoviedbId: any;
        } | {};
        error?: undefined;
        data?: undefined;
    }>;
}

interface IMetaAnime {
    malId: number;
    anilistId?: number;
    image: string;
    color?: string;
    bannerImage?: string;
    title: {
        romaji: string;
        english: string;
        native: string;
    };
    trailer: string;
    format: string;
    status: string;
    synonyms?: string[];
    country?: string;
    year?: number;
    duration: number;
    score: number;
    genres: string[];
    episodes: number;
    synopsis: string;
    season: string;
    releaseDate: string;
    endDate: string;
    studio: string;
    producers: string[];
}
interface IMetaCharacters {
    role: string;
    id: number;
    name: string;
    image: string;
    voiceActors: voiceActors[];
}
type voiceActors = {
    name: string;
    image: string;
    language: string;
};
interface IAnilistCharacters {
    anilistId: number;
    malId: number;
    title: {
        romaji: string;
        english: string;
        native: string;
    };
    characters: IMetaCharacters[];
}
interface IRelatedAnilistData {
    anilistId: number;
    malId: number;
    title: {
        romaji: string;
        english: string;
        native: string;
    };
    type: string;
    score: number;
    image: string;
    bannerImage: string;
    color: string;
    synonyms: string[];
    country: string;
    year: number;
}
interface NextAiringEpisode {
    episode: number;
    id: number;
    airingAt: number;
    timeUntilAiring: number;
}
interface BaseAnimeSchedule {
    malId: number;
    anilistId: number;
    bannerImage: string;
    image: string;
    title: {
        romaji: string;
        english: string | null;
        native: string | null;
    };
    format: string;
    releaseDate: string;
    endDate: string;
    status: string;
    nextAiringEpisode: NextAiringEpisode | null;
}
interface MediaSchedule extends BaseAnimeSchedule {
    color: string;
    duration: number | null;
}
interface AiringSchedule extends BaseAnimeSchedule {
    popularity: number;
    score: number;
    genres: string[];
    episodes: number | null;
    synopsis: string;
    season: string | null;
}
declare const Seasons: readonly ["WINTER", "SPRING", "SUMMER", "FALL"];
type Seasons = (typeof Seasons)[number];
type IMetaFormat = 'TV' | 'MOVIE' | 'SPECIAL' | 'OVA' | 'ONA' | 'MUSIC' | 'MANGA';
interface IMetaAnimePaginated<T> extends IBasePaginated<T> {
    lastPage: number;
    perPage: number;
}
interface IMetaProviderEpisodes {
    episodeNumber: number | null;
    rating: number | null;
    aired: boolean | null;
    episodeId: string | null;
    title: string | null;
    overview: string | null;
    thumbnail: string | null;
    provider: string | null;
}
interface IMetaProviderEpisodesResponse<T> extends IResponse<T> {
    providerEpisodes: IMetaProviderEpisodes[] | [];
    provider?: IProviderId | null;
}
interface IProviderId {
    id: string | number | null;
    name: string | null;
    native?: string | null;
    romaji: string | null;
    provider: string | null;
    score: number | null;
    source?: string | null;
}
interface IMetaProviderIdResponse<T> extends IResponse<T> {
    provider: IProviderId | null;
}

/**
 * A class for interacting with the Anilist API to search for anime, fetch detailed information,
 * retrieve various lists (trending, popular, top-rated, seasonal, upcoming), and get character
 * and episode information from specific providers.
 *
 *
 */
declare class Anilist extends BaseAnimeMeta {
    private readonly baseUrl;
    private readonly workerUrl;
    constructor(options?: ClientOptions);
    /**
     * Maps an Anilist anime ID to the corresponding Kitsu provider ID.
     *
     * @param anilistId - Anilist media ID (required)
     * @returns Provider mapping result including Anilist metadata and provider-specific ID (if found)
     */
    fetchKitsuProviderId(anilistId: number): Promise<IMetaProviderIdResponse<IMetaAnime | null>>;
    /**
     * Maps an Anilist anime ID to the corresponding Anizone provider ID.
     *
     * @param anilistId - Anilist media ID (required)
     * @returns Provider mapping result including Anilist metadata and provider-specific ID (if found)
     */
    fetchAnizoneProviderId(anilistId: number): Promise<IMetaProviderIdResponse<IMetaAnime | null>>;
    /**
     * Maps an Anilist anime ID to the corresponding AniBD provider ID.
     *
     * @param anilistId - Anilist media ID (required)
     * @returns Provider mapping result including Anilist metadata and provider-specific ID (if found)
     */
    fetchAniBDProviderId(anilistId: number): Promise<IMetaProviderIdResponse<IMetaAnime | null>>;
    /**
     * Maps an Anilist anime ID to the corresponding AnimeHeaven provider ID.
     *
     * @param anilistId - Anilist media ID (required)
     * @returns Provider mapping result including Anilist metadata and provider-specific ID (if found)
     */
    fetchAnimeHeavenProviderId(anilistId: number): Promise<IMetaProviderIdResponse<IMetaAnime | null>>;
    /**
     * Maps an Anilist anime ID to the corresponding AniDB (animepahe reupload) provider ID.
     *
     * @param anilistId - Anilist media ID (required)
     * @returns Provider mapping result including Anilist metadata and provider-specific ID (if found)
     */
    fetchAniDBProviderId(anilistId: number): Promise<IMetaProviderIdResponse<IMetaAnime | null>>;
    /**
     * Maps an Anilist anime ID to the corresponding Anikoto provider ID.
     *
     * @param anilistId - Anilist media ID (required)
     * @returns Provider mapping result including Anilist metadata and provider-specific ID (if found)
     */
    fetchAnikotoProviderId(anilistId: number): Promise<IMetaProviderIdResponse<IMetaAnime | null>>;
    /**
     * Fetches episode list from Anikoto provider and enriches episodes with Anizip metadata (titles, thumbnails, etc.).
     *
     * @param anilistId - Anilist media ID (required)
     * @returns Enriched episode list from Anizone + Anilist base data
     */
    fetchAnikotoProviderEpisodes(anilistId: number): Promise<IMetaProviderEpisodesResponse<IMetaAnime | null>>;
    /**
     * Fetches episode list from Animeheaven provider and enriches episodes with Anizip metadata (titles, thumbnails, etc.).
     *
     * @param anilistId - Anilist media ID (required)
     * @returns Enriched episode list from Anizone + Anilist base data
     */
    fetchAnimeHeavenProviderEpisodes(anilistId: number): Promise<IMetaProviderEpisodesResponse<IMetaAnime | null>>;
    /**
     * Fetches episode list from Kitsu provider and enriches episodes with Anizip metadata (titles, thumbnails, etc.).
     *
     * @param anilistId - Anilist media ID (required)
     * @returns Enriched episode list from Anizone + Anilist base data
     */
    fetchKitsuProviderEpisodes(anilistId: number): Promise<IMetaProviderEpisodesResponse<IMetaAnime | null>>;
    /**
     * Fetches episode list from AniBD provider and enriches episodes with Anizip metadata (titles, thumbnails, etc.).
     *
     * @param anilistId - Anilist media ID (required)
     * @returns Enriched episode list from Anizone + Anilist base data
     */
    fetchAniBDProviderEpisodes(anilistId: number): Promise<IMetaProviderEpisodesResponse<IMetaAnime | null>>;
    /**
     * Fetches episode list from AniDbApp provider and enriches episodes with Anizip metadata (titles, thumbnails, etc.).
     *
     * @param anilistId - Anilist media ID (required)
     * @returns Enriched episode list from Anizone + Anilist base data
     */
    fetchAniDBProviderEpisodes(anilistId: number): Promise<IMetaProviderEpisodesResponse<IMetaAnime | null>>;
    /**
     * Fetches episode list from Anizone provider and enriches episodes with Anizip metadata (titles, thumbnails, etc.).
     *
     * @param anilistId - Anilist media ID (required)
     * @returns Enriched episode list from Anizone + Anilist base data
     */
    fetchAnizoneProviderEpisodes(anilistId: number): Promise<IMetaProviderEpisodesResponse<IMetaAnime | null>>;
    /**
     * Searches for anime or manga using a query string.
     *
     * @param search - Search term / keyword (required)
     * @param mediaType - Type of media to search for
     * @param mediaType - `'ANIME'` or `'MANGA'`
     * @param [page=1] - Page number (1-based)
     * @param [perPage=20] - Results per page
     * @returns Paginated search results with media entries
     */
    search(search: string, mediaType: 'ANIME' | 'MANGA', page?: number, perPage?: number): Promise<IMetaAnimePaginated<IMetaAnime[] | []>>;
    /**
     * Fetches detailed metadata for a single anime or manga entry by its Anilist ID.
     *
     * @param id - Anilist media ID (required)
     * @param mediaType - Type of media
     * @param mediaType - `'ANIME'` or `'MANGA'`
     * @returns Detailed media information or error
     */
    fetchInfo(id: number, mediaType: 'ANIME' | 'MANGA'): Promise<IResponse<IMetaAnime | null>>;
    /**
     * Fetches a list of the most anticipated upcoming anime.
     *
     * @param page - The page number for pagination (optional, defaults to 1)
     * @param perPage - The number of results per page (optional, defaults to 20)
     * @param sort - The sorting order for results (optional, defaults to POPULARITY_DESC)
     * @param status - The state of the anime('NOT_YET_RELEASED' | 'RELEASING' ) defaults to 'NOT_YET_RELEASED',
     * @param format - The anime format
     * @returns Promise that resolves to paginated list of upcoming anime
     */
    fetchTopUpcoming(page?: number, perPage?: number, sort?: 'TRENDING_DESC' | 'SCORE_DESC' | 'POPULARITY_DESC', status?: 'NOT_YET_RELEASED' | 'RELEASING', format?: IMetaFormat): Promise<IMetaAnimePaginated<IMetaAnime[] | []>>;
    /**
     * Fetches a list of the top airing anime.
     *
     * @param page - The page number for pagination (optional, defaults to 1)
     * @param perPage - The number of results per page (optional, defaults to 20)
     * @param sort - The sorting order for results (optional, defaults to SCORE_DESC)
     * @param status - Anime state defaults to RELEASING.
     * @returns Promise that resolves to paginated list of airing anime
     */
    fetchTopAiring(page?: number, perPage?: number, sort?: 'SCORE_DESC', status?: 'RELEASING'): Promise<IMetaAnimePaginated<IMetaAnime[] | []>>;
    /**
     * Fetches a list of the most popular media
     *
     * @param {('ANIME' | 'MANGA')} mediaType - The type of media to fetch
     * @param {string} [format] - The format to filter by
     *           - When `mediaType` is `'ANIME'`: `'TV' | 'MOVIE' | 'SPECIAL' | 'OVA' | 'ONA' | 'MUSIC'`
     *           - When `mediaType` is `'MANGA'`: `'MANGA'`
     * @param {number} [page=1] - Page number for pagination.
     * @param {number} [perPage=20] - Number of items per page
     * @param sort - The criteria used to order the results.
     * @returns {Promise<Object>} Promise that resolves to a paginated response containing popular media
     *
     */
    fetchMostPopular(mediaType: 'ANIME' | 'MANGA', format: IMetaFormat, page?: number, perPage?: number, sort?: 'SCORE_DESC' | 'POPULARITY_DESC'): Promise<IMetaAnimePaginated<IMetaAnime[] | []>>;
    /**
     * Fetches a list of top-rated media
     *
     * @param {('ANIME' | 'MANGA')} mediaType - The type of media to fetch
     * @param {string} [format] - The format to filter by
     *           - When `mediaType` is `'ANIME'`: `'TV' | 'MOVIE' | 'SPECIAL' | 'OVA' | 'ONA' | 'MUSIC'`
     *           - When `mediaType` is `'MANGA'`: `'MANGA'`
     * @param {number} [page=1] - Page number for pagination.
     * @param {number} [perPage=20] - Number of items per page
     * @param sort - The criteria used to order the results.
     * @returns {Promise<Object>} Promise that resolves to a paginated response containing popular media
     *
     */
    fetchTopRated(mediaType: 'ANIME' | 'MANGA', format: IMetaFormat, page?: number, perPage?: number, sort?: 'SCORE_DESC' | 'POPULARITY_DESC'): Promise<IMetaAnimePaginated<IMetaAnime[] | []>>;
    /**
     * Fetches a paginated list of anime released in a specific season and year.
     *
     * @param season - Anime season to query
     * @param season - `'WINTER' | 'SPRING' | 'SUMMER' | 'FALL'`
     * @param seasonYear - The year of the season (e.g. 2023, 2024, 2025)
     * @param [page=1] - Page number (1-based pagination)
     * @param [perPage=20] - Number of results per page
     * @param [format='TV'] - Format filter for the anime
     * @param format - `'TV' | 'MOVIE' | 'OVA' | 'ONA' | 'SPECIAL' | 'MUSIC'`
     * @returns Promise resolving to a paginated list of seasonal anime entries
     */
    fetchSeasonalAnime(season: Seasons, seasonYear: number, page?: number, perPage?: number, format?: IMetaFormat): Promise<IMetaAnimePaginated<IMetaAnime[] | []>>;
    /**
     * Fetches a paginated list of currently trending media (anime or manga),
     * typically ordered by recent popularity, trending score, or user activity.
     *
     * @param mediaType - Type of media to fetch
     * @param mediaType - `'ANIME'` or `'MANGA'`
     * @param format - Format filter to apply
     * @param format - For ANIME: `'TV' | 'MOVIE' | 'OVA' | 'ONA' | 'SPECIAL' | 'MUSIC'`
     * @param format - For MANGA: `'MANGA' | 'NOVEL' | 'ONE_SHOT' | 'LIGHT_NOVEL'`
     * @param [page=1] - Page number for pagination (1-based)
     * @param [perPage=20] - Number of items per page
     * @returns Promise resolving to paginated list of trending media entries
     *
     */
    fetchTrending(mediaType: 'ANIME' | 'MANGA', format: IMetaFormat, page?: number, perPage?: number): Promise<IMetaAnimePaginated<IMetaAnime[] | []>>;
    /**
     * Fetches anime titles related to a specific anime ID, such as sequels, prequels, or spin-offs.
     *
     * @param mediaId - The unique Anilist anime ID (required)
     * @returns Promise that resolves to related anime information
     */
    fetchRelatedAnime(mediaId: number): Promise<IResponse<IRelatedAnilistData[] | []>>;
    /**
     * Fetches characters associated with a specific anime.
     *
     * @param mediaId - The unique Anilist anime ID (required)
     * @returns Promise that resolves to anime characters and their voice actors
     */
    fetchCharacters(mediaId: number): Promise<IResponse<IAnilistCharacters | null>>;
    /**
     * Fetches the airing schedule for a specific anime by its Anilist ID.
     *
     * @param {number} mediaId - The unique Anilist anime ID (required).
     * @returns  A promise that resolves to an object containing the airing schedule data or an error.
     * **/
    fetchMediaSchedule(mediaId: number): Promise<IResponse<MediaSchedule | null>>;
    /**
     * Fetches a paginated list of all anime airing on a specific date.
     * @param {string} date - The date to check for airing episodes (Format: ISO 8601 standard (YYYY-MM-DD)).
     * @param {number} [page=1] - The page number to fetch for pagination.
     * @param {number} [perPage=20] - The number of results to return per page.
     * @returns  A promise resolving to a paginated  object containing an array of airing schedules and page metadata.
     */
    fetchAiringSchedule(date: string, page?: number, perPage?: number): Promise<IMetaAnimePaginated<AiringSchedule[] | []>>;
    /**
     * Converts two date strings into a variables object for AniList
     * @param {string} startDate - Format "YYYY-MM-DD"
     */
    private getAniListVariables;
}

/**
 * A class for interacting with The Movie Database (TMDb) API to search for and retrieve
 * information about TV shows and movies, including trending, popular, top-rated, seasonal data,
 * episode information, and streaming source integration with external providers.
 *
 *
 */
declare class TheMovieDatabase extends BaseClass {
    private readonly apiKey;
    /** Base URL for the TMDb API */
    private readonly baseUrl;
    /**
     * Creates an instance of the TMDb API client.
     */
    constructor(options?: ClientConfig);
    /**
     * Searches for TV shows based on the provided query string using TMDb API.
     *
     * @param query - The search query string (required)
     * @param page - The page number for pagination (optional, defaults to 1)
     * @returns Promise resolving to paginated list of TV shows matching the search query
     */
    searchShows(query: string, page?: number): Promise<IMetaMoviePaginated<IMetaMovie[] | []>>;
    /**
     * Fetches detailed TV show information from TMDb using append_to_response
     */
    fetchShowInfo(tmdbId: number): Promise<IResponse<IAnimeListItem | null>>;
    /**
     * Fetches episodes available in a specific season of a TV show from TMDb.
     *
     * @param tmdbId - The unique TMDb ID for the TV show (required)
     * @param season - The season number for which to fetch episodes (required)
     * @returns Promise resolving to array of episodes with their detailed information for the specified season
     */
    fetchTvEpisodes(tmdbId: number, season: number): Promise<IResponse<IMetaMovieEpisodes[] | []>>;
    /**
     * Fetches detailed information about a specific episode from a TV show.
     *
     * @param tmdbId - The unique TMDb ID for the TV show (required)
     * @param season - The season number containing the episode (optional, defaults to 1)
     * @param episodeNumber - The episode number for which to fetch information (optional, defaults to 1)
     * @returns Promise resolving to detailed episode information including images and ratings
     */
    fetchEpisodeInfo(tmdbId: number, season: number, episodeNumber: number): Promise<IResponse<IMetaMovieEpisodes | null>>;
    /**
     * Fetches trending TV shows based on a specified time window from TMDb.
     *
     * @param timeWindow - The time window to fetch trending shows (day or week) (optional, defaults to 'week')
     * @param page - The page number for pagination (optional, defaults to 1)
     * @returns Promise resolving to paginated list of trending TV shows
     */
    fetchTrendingTv(timeWindow?: 'day' | 'week', page?: number): Promise<IMetaMoviePaginated<IMetaMovie[] | []>>;
    /**
     * Fetches popular TV shows from TMDb.
     *
     * @param page - The page number for pagination (optional, defaults to 1)
     * @returns Promise resolving to paginated list of popular TV shows
     */
    fetchPopularTv(page?: number): Promise<IMetaMoviePaginated<IMetaMovie[] | []>>;
    /**
     * Fetches top-rated TV shows from TMDb.
     *
     * @param page - The page number for pagination (optional, defaults to 1)
     * @returns Promise resolving to paginated list of top-rated TV shows
     */
    fetchTopShows(page?: number): Promise<IMetaMoviePaginated<IMetaMovie[] | []>>;
    /**
     * Searches for movies based on the provided query string using TMDb API.
     *
     * @param query - The search query string (required)
     * @param page - The page number for pagination (optional, defaults to 1)
     * @returns Promise resolving to paginated list of movies matching the search query
     */
    searchMovie(query: string, page?: number): Promise<IMetaMoviePaginated<IMetaMovie[] | []>>;
    /**
     * Fetches detailed information about a specific movie using its TMDb ID.
     *
     * @param tmdbId - The unique TMDb ID for the movie (required)
     * @returns Promise resolving to comprehensive movie information
     */
    fetchMovieInfo(tmdbId: number): Promise<IResponse<IMovieInfo | null>>;
    /**
     * Fetches trending movies based on a specified time window from TMDb.
     *
     * @param timeWindow - The time window to fetch trending movies (day or week) (optional, defaults to 'week')
     * @param page - The page number for pagination (optional, defaults to 1)
     * @returns Promise resolving to paginated list of trending movies
     */
    fetchTrendingMovies(timeWindow?: 'day' | 'week', page?: number): Promise<IMetaMoviePaginated<IMetaMovie[] | []>>;
    /**
     * Fetches popular movies from TMDb.
     *
     * @param page - The page number for pagination (optional, defaults to 1)
     * @returns Promise resolving to paginated list of popular movies
     */
    fetchPopularMovies(page?: number): Promise<IMetaMoviePaginated<IMetaMovie[] | []>>;
    /**
     * Fetches top-rated movies from TMDb.
     *
     * @param page - The page number for pagination (optional, defaults to 1)
     * @returns Promise resolving to paginated list of top-rated movies
     */
    fetchTopMovies(page?: number): Promise<IMetaMoviePaginated<IMetaMovie[] | []>>;
    /**
     * Fetches the current season's anime automatically based on today's date.
     * @param env - Cloudflare Environment
     * @param page - Page number (default: 1)
     * @returns Promise with enriched current seasonal anime data
     */
    fetchSeasonalAnime(page?: number): Promise<IMetaMoviePaginated<IMetaMovie[] | []>>;
    /**
     * Fetches popular anime from TMDb
     * @param page - Page number (default: 1)
     * @returns Promise with enriched top anime data
     */
    fetchPopularAnime(page: number): Promise<IMetaMoviePaginated<IMetaMovie[] | []>>;
    /**
     * Fetches top anime from TMDb and enriches with detailed info
     *
  
     * @param page - Page number (default: 1)
     * @returns Promise with enriched top anime data
     */
    fetchTopAnime(page: number): Promise<IMetaMoviePaginated<IMetaMovie[] | []>>;
    /**
     * Fetches anime airing within the current week and enriches the data.
     * Useful for "Airing This Week" or "Simulcast" sections.
     * @param env - Cloudflare Environment
     * @param page - Page number (default: 1)
     * @returns Promise with enriched weekly anime data
     */
    fetchWeeklyAnime(page?: number): Promise<IMetaMoviePaginated<IMetaMovie[] | []>>;
    /**
     * Fetches Artworks for shows
     */
    fetchShowArtWorks(tmdbId: number): Promise<IResponse<IMetaMovieArtworks | null>>;
    /**
     * Fetches Artworks for movies
     */
    fetchMovieArtWorks(tmdbId: number): Promise<IResponse<IMetaMovieArtworks | null>>;
    /**
     * Helper to build consistent image URL objects
     */
    private buildImageUrls;
    /**
     * Helper to format episode data (latest / next)
     */
    private formatEpisode;
    /**
     * Automatically determines the current anime season and year
     */
    private getCurrentSeasonAndYear;
    private getSeasonDates;
    /**
     * Calculates a weekly date range with a past offset.
     * @param offsetWeeks - How many weeks to go back (default 1) very useful
     */
    private getWeeklyDates;
    /**
     * Reusable method to fetch paginated TV show data from TMDb API.
     *
     * @private
     * @param endpoint - The API endpoint to fetch data from (e.g., '/search/tv')
     * @param params - Query parameters for the API request
     * @returns Promise resolving to paginated TV show data with metadata
     */
    private fetchPaginatedData;
    /**
     * Reusable method to fetch paginated movie data from TMDb API.
     *
     * @private
     * @param endpoint - The API endpoint to fetch data from (e.g., '/search/movie')
     * @param params - Query parameters for the API request
     * @returns Promise resolving to paginated movie data with metadata
     */
    private fetchPaginatedMovieData;
}

export { AniBD, AniDB, Anikoto, Anilist, AnimeHeaven, Anizone, type IAnimeCategory, type IMetaFormat, Kitsu, Seasons, TheMovieDatabase };
