// src/provider/anime/anizone.ts
import * as cheerio2 from "cheerio";

// src/config/client.ts
import { Impit } from "impit";
import PQueue from "p-queue";
var Client = class {
  impit;
  queue;
  constructor(options = {}) {
    const { rateLimit, ...impitConfig } = options;
    this.impit = new Impit(impitConfig);
    if (rateLimit) {
      this.queue = new PQueue({
        intervalCap: rateLimit.requestsPerInterval ?? 1,
        interval: rateLimit.intervalMs ?? 1e3,
        concurrency: rateLimit.concurrency ?? 1,
        carryoverIntervalCount: false
      });
    }
  }
  async fetch(url, options) {
    if (this.queue) {
      return this.queue.add(() => this.impit.fetch(url, options));
    }
    return this.impit.fetch(url, options);
  }
};

// src/models/base.ts
var BaseClass = class {
  client;
  STATUS_TEXT_MAP = {
    100: "Continue",
    101: "Switching Protocols",
    102: "Processing",
    103: "Early Hints",
    200: "OK",
    201: "Created",
    202: "Accepted",
    203: "Non-Authoritative Information",
    204: "No Content",
    205: "Reset Content",
    206: "Partial Content",
    207: "Multi-Status",
    208: "Already Reported",
    226: "IM Used",
    300: "Multiple Choices",
    301: "Moved Permanently",
    302: "Found",
    303: "See Other",
    304: "Not Modified",
    305: "Use Proxy",
    306: "unused",
    307: "Temporary Redirect",
    308: "Permanent Redirect",
    400: "Bad Request",
    401: "Unauthorized",
    402: "Payment Required",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    406: "Not Acceptable",
    407: "Proxy Authentication Required",
    408: "Request Timeout",
    409: "Conflict",
    410: "Gone",
    411: "Length Required",
    412: "Precondition Failed",
    413: "Payload Too Large",
    414: "URI Too Long",
    415: "Unsupported Media Type",
    416: "Range Not Satisfiable",
    417: "Expectation Failed",
    418: "I'm a teapot",
    421: "Misdirected Request",
    422: "Unprocessable Entity",
    423: "Locked",
    424: "Failed Dependency",
    425: "Too Early",
    426: "Upgrade Required",
    428: "Precondition Required",
    429: "Too Many Requests",
    431: "Request Header Fields Too Large",
    444: "No Response",
    451: "Unavailable For Legal Reasons",
    499: "Client Closed Request",
    500: "Internal Server Error",
    501: "Not Implemented",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
    505: "HTTP Version Not Supported",
    506: "Variant Also Negotiates",
    507: "Insufficient Storage",
    508: "Loop Detected",
    509: "Bandwidth Limit Exceeded",
    510: "Not Extended",
    511: "Network Authentication Required",
    520: "Web Server Returned an Unknown Error",
    521: "Web Server Is Down",
    522: "Connection Timed Out",
    523: "Origin Is Unreachable",
    524: "A Timeout Occurred",
    525: "SSL Handshake Failed",
    526: "Invalid SSL Certificate",
    527: "Railgun Error",
    530: "Site Is Frozen"
  };
  constructor(options = {}) {
    const config = {
      browser: "chrome142",
      timeout: 15e3,
      ignoreTlsErrors: false,
      ...options
    };
    this.client = new Client(config);
  }
  formatHttpError(statusCode, statusText) {
    const resolvedText = statusText?.trim() || this.STATUS_TEXT_MAP[statusCode] || "Unknown Error";
    return `Request failed with status: ${statusCode} & message: ${resolvedText}`;
  }
  createSlug(text) {
    return text.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
  }
  createSearchableTitle(text) {
    return text.toLowerCase().replace(/[^\w\s]/g, "").trim().split(/\s+/).slice(0, 2).join(" ");
  }
  normalizeKey(input) {
    return input.toLowerCase().trim().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
  }
  getMappedValue(input, mapping) {
    const normalized = this.normalizeKey(input);
    const mappingKeys = Object.keys(mapping);
    const foundKey = mappingKeys.find((key) => this.normalizeKey(key) === normalized);
    if (!foundKey) throw new Error(`Invalid: ${input}. Must be one of: ${mappingKeys.join(", ")}`);
    return mapping[foundKey];
  }
};

// src/models/animeparser.ts
import "cheerio";
var AnimeParser = class extends BaseClass {
  /**
   * The root canonical URL of the specific streaming provider target.
   * Used as the base anchor for relative query endpoints and network navigation.
   */
  baseUrl;
  /**
   * Initializes the base scraper client with site-specific configurations and global HTTP client options.
   *  @param baseUrl - The base web domain or address of the targeted streaming platform.
   * @param options - Configuration settings for the underlying HTTP client engine (headers,fingerprints,rate limits, timeouts).
   * @protected This constructor can only be invoked by derived child implementations via `super()`.
   */
  constructor(baseUrl, options) {
    super(options);
    this.baseUrl = baseUrl;
  }
};

// src/provider/anime/anizone.ts
var Anizone = class extends AnimeParser {
  constructor(baseUrl = "https://anizone.to", options = {}) {
    super(baseUrl, options);
    this.baseUrl = baseUrl;
  }
  /**
   * Searches for anime on the Anizone platform using a query string.
   * @param {string} query - The search query for finding anime.
   * @returns - A promise resolving to an object containing search results or an error message.
   */
  async search(query) {
    if (!query) {
      return {
        data: [],
        error: this.formatHttpError(400),
        status: 400
      };
    }
    try {
      const url = new URL(`${this.baseUrl}/anime`);
      url.searchParams.append("search", this.formatQuery(query));
      const response = await this.client.fetch(url.toString(), {
        method: "GET"
      });
      if (!response.ok) {
        return { error: response.statusText, status: response.status, data: [] };
      }
      const result = await response.text();
      return this.parseSearchResults(cheerio2.load(result));
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unknown err", data: [], status: 500 };
    }
  }
  /**
   * Fetches recent updates from the Anizone homepage, including recently added anime and latest episodes.
   * @returns - A promise resolving to an object containing arrays of recently added anime, latest episodes, or an error message.
   */
  async fetchUpdates() {
    try {
      const response = await this.client.fetch(`${this.baseUrl}/`, { method: "GET" });
      if (!response.ok) {
        return { error: response.statusText, status: response.status, data: [], recentlyAdded: [] };
      }
      const result = await response.text();
      return this.parseUpdates(cheerio2.load(result));
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown err",
        data: [],
        recentlyAdded: [],
        status: 500
      };
    }
  }
  /**
   * Fetches detailed information and episode list for a specific anime.
   * @param {string} animeId - The unique identifier for the anime.
   * @returns - A promise resolving to an object containing anime details and episodes or an error message.
   */
  async fetchAnimeInfo(animeId) {
    if (!animeId) {
      return {
        data: null,
        error: this.formatHttpError(400),
        status: 400,
        providerEpisodes: []
      };
    }
    try {
      const id = animeId.split("-").at(-1);
      const response = await this.client.fetch(`${this.baseUrl}/anime/${id}`, { method: "GET" });
      if (!response.ok) {
        return {
          data: null,
          providerEpisodes: [],
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.text();
      return this.parseAnimeinfo(cheerio2.load(result));
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown error",
        data: null,
        providerEpisodes: [],
        status: 500
      };
    }
  }
  /**
   * Fetches video sources and related metadata for a specific episode.
   * @param {string} episodeId - The unique identifier for the episode.
   * @returns {Promise<ISourceBaseResponse<IVideoSource | null>>} - A promise resolving to an object containing video sources, headers, or an error message.
   */
  async fetchSources(episodeId) {
    if (!episodeId) {
      return { error: "Missing required params: episodeId", headers: { Referer: null }, data: null, status: 400 };
    }
    try {
      const match = episodeId.match(/([a-z0-9]+)-episode-(\d+)/i);
      if (!match) {
        return {
          error: "Invalid episodeId format",
          status: 400,
          headers: { Referer: null },
          data: null
        };
      }
      const id = `${match[1]}/${match[2]}`;
      const response = await this.client.fetch(`${this.baseUrl}/anime/${id}`, { method: "GET" });
      if (!response.ok) {
        return {
          error: response.statusText || "Unknown error",
          status: response.status,
          headers: { Referer: null },
          data: null
        };
      }
      const result = await response.text();
      const { extractedData } = this.parseSources(cheerio2.load(result));
      return {
        headers: { Referer: `${this.baseUrl}/` },
        data: extractedData
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unknown error", headers: { Referer: null }, data: null };
    }
  }
  /**
   * Parses search results from the Anizone website to extract anime information.
   * @private
   * @param {cheerio.CheerioAPI} $ - Cheerio instance for parsing HTML.
   * @returns - An object containing an array of parsed anime data or an empty array.
   */
  parseSearchResults($) {
    const selector = "div.grid.grid-cols-1.gap-4 > div.relative.overflow-hidden.h-26.rounded-lg.px-4.py-3.bg-slate-900.drop-shadow-lg";
    const anime = [];
    $(selector).each((_, element) => {
      const xData = $(element).attr("x-data") || "";
      const titles = (() => {
        const jsonMatch = xData.match(/JSON\.parse\('(.*?)'\)/);
        if (!jsonMatch) {
          return {
            name: null,
            romaji: null
          };
        }
        try {
          const json = jsonMatch[1].replace(/\\u0022/g, '"').replace(/\\"/g, '"').replace(/\\\\u/g, "\\u");
          const parsed = JSON.parse(json);
          return {
            name: parsed["1"] || parsed["10"] || parsed["5"] || null,
            romaji: parsed["5"] || null
          };
        } catch {
          return {
            name: null,
            romaji: null
          };
        }
      })();
      const fallbackTitle = xData.match(/getTitle\(this\.anmTitles,\s*'([^']+)'/)?.[1] || null;
      const name = titles.name || fallbackTitle || null;
      const romaji = titles.romaji || fallbackTitle || null;
      const id = $(element).find('a[href*="/anime/"]').attr("href")?.split("/").at(-1) || $(element).attr("wire:key")?.split("-").at(-1) || null;
      const posterImage = $(element).find("img").attr("src") || null;
      const infoSpans = $(element).find("div.inline.text-xs.h-4.line-clamp-1 span").map((_2, el) => $(el).text().trim()).get();
      const genres = $(element).find("div.flex.flex-wrap.gap-2.line-clamp-1.h-6 a").map((_2, el) => $(el).text().trim()).get().filter((g) => g.toLowerCase() !== "manga");
      anime.push({
        id: name ? `${this.createSlug(name)}-${id}` : id || null,
        name,
        romaji,
        posterImage,
        type: infoSpans[0] ? infoSpans[0].toLowerCase().includes("tv") ? "TV" : infoSpans[0] : null,
        releaseDate: infoSpans[1] || null,
        totalEpisodes: infoSpans[2] ? parseInt(infoSpans[2].replace(/\D/g, ""), 10) : null,
        status: infoSpans[3] || null,
        genres: genres.length ? genres : null
      });
    });
    if (anime.length === 0) {
      return {
        data: [],
        error: "No results found for that query",
        status: 404
      };
    }
    return {
      data: anime
    };
  }
  /**
   * Parses anime information and episode data from the Anizone anime page.
   * @private
   * @param {cheerio.CheerioAPI} $ - Cheerio instance for parsing HTML.
   * @returns - An object containing parsed anime info and episode data, or null if not found.
   */
  parseAnimeinfo($) {
    const synopsisHtml = $(".text-sm.md\\:text-base.xl\\:text-lg > div").html();
    const infoSpans = $(".text-slate-100.text-xs.lg\\:text-base.flex.flex-wrap > span");
    const xData = $("main > div[x-data]").attr("x-data") || "";
    const titles = (() => {
      const match = xData.match(/JSON\.parse\('(.*?)'\)/);
      if (!match) {
        return {
          name: $("h1").text().trim() || null,
          romaji: $("h1").text().trim() || null
        };
      }
      try {
        const parsed = JSON.parse(
          match[1].replace(/\\u0022/g, '"').replace(/\\"/g, '"').replace(/\\\\u/g, "\\u")
        );
        return {
          name: parsed["1"] || parsed["10"] || parsed["5"] || null,
          romaji: parsed["5"] || null
        };
      } catch {
        return {
          name: $("h1").text().trim() || null,
          romaji: $("h1").text().trim() || null
        };
      }
    })();
    const id = $("div.flex.mt-8 a").attr("href")?.split("/")[4];
    const title = titles.name;
    const romaji = titles.romaji;
    const animeInfo = {
      id: `${this.createSlug(title)}-${id}` || null,
      name: title || null,
      romaji,
      type: $(infoSpans[0]).find(".inline-block").text().trim().toLowerCase().includes("tv") ? "TV" : $(infoSpans[0]).find(".inline-block").text().trim() || null,
      status: $(infoSpans[1]).find(".inline-block").text().trim() || null,
      posterImage: $("div.mx-auto img").attr("src") || null,
      coverImage: $("div.absolute img").attr("src") || null,
      totalEpisodes: (() => {
        const text = $(infoSpans[2]).find(".inline-block").text().trim();
        return text ? parseInt(text.replace(/\D/g, ""), 10) : null;
      })(),
      releaseDate: Number($(infoSpans[3]).find(".inline-block").text().trim()) || null,
      synopsis: synopsisHtml ? synopsisHtml.replace(/<br\s*\/?>/g, "\n").replace(/\n\s*\n/g, "\n").trim() : "N/A",
      genres: $(".flex-wrap.gap-2.justify-center.lg\\:justify-start a").map((_, el) => $(el).text().trim()).get().filter((g) => g.toLowerCase() !== "manga") || null
    };
    const episodes = [];
    $("ul.grid > li").each((_, el) => {
      const $el = $(el);
      const url = $el.find("a").attr("href") || null;
      const title2 = (() => {
        const xData2 = $el.attr("x-data") || "";
        const match = xData2.match(/JSON\.parse\('(.*?)'\)/);
        if (!match) {
          return $el.find("h3").text().trim() || null;
        }
        try {
          const titles2 = JSON.parse(
            match[1].replace(/\\u0022/g, '"').replace(/\\"/g, '"').replace(/\\\\u/g, "\\u")
          );
          return titles2["1"] || titles2["5"] || $el.find("h3").text().trim() || null;
        } catch {
          return $el.find("h3").text().trim() || null;
        }
      })();
      const episodeNumber = url ? url.split("/").at(-1) : null;
      episodes.push({
        episodeId: `${animeInfo.id}-episode-${episodeNumber}`,
        episodeNumber: episodeNumber ? Number(episodeNumber) : null,
        thumbnail: $el.find("div.absolute img").attr("src") || null,
        teaser: $el.find("div.absolute img").attr(":src")?.match(/'([^']*teaser\.webp)'/)?.[0] || $el.find("div.absolute img").attr(":src")?.match(/'([^']*teaser\.webp)'/)?.[1] || null,
        title: title2,
        airDate: $el.find("span").filter((i, span) => /^\d{4}-\d{2}-\d{2}$/.test($(span).text().trim())).first().text().trim() || null
      });
    });
    if (animeInfo === null) {
      return {
        data: null,
        error: "Anime info is null",
        status: 404,
        providerEpisodes: []
      };
    }
    if (Array.isArray(episodes) && episodes.length === 0) {
      return {
        data: null,
        error: "Provider episodes is empty",
        status: 404,
        providerEpisodes: []
      };
    }
    return { data: animeInfo, providerEpisodes: episodes };
  }
  /**
   * Parses video sources, subtitles, and other media data from an episode page.
   * @private
   * @param {cheerio.CheerioAPI} $ - Cheerio instance for parsing HTML.
   * @returns  - An object containing parsed video source data.
   */
  parseSources($) {
    const player = $("media-player");
    const videoUrl = player.attr("src") || null;
    const poster = player.find("media-poster").attr("src") || null;
    const subtitles = [];
    player.find('track[kind="subtitles"]').each((_, el) => {
      const $el = $(el);
      if ($el.attr("srclang") !== "en") {
        return;
      }
      subtitles.push({
        url: $el.attr("src") || null,
        lang: $el.attr("label") || null,
        default: $el.is("[default]")
      });
    });
    const chapters = player.find('track[kind="chapters"]').attr("src") || null;
    const thumbnails = player.find("media-video-layout").attr("thumbnails") || null;
    const extractedData = {
      subtitles: [],
      sources: [],
      tracks: [],
      posterImage: null
    };
    if (videoUrl) {
      extractedData.sources.push({
        url: videoUrl,
        isM3u8: videoUrl.includes("m3u8"),
        type: videoUrl.includes("m3u8") ? "hls" : "Unknown"
      });
    }
    if (subtitles && Array.isArray(subtitles)) {
      extractedData.subtitles = subtitles;
    }
    if (chapters) {
      extractedData.tracks?.push({
        url: chapters,
        type: "chapters"
      });
    }
    if (thumbnails) {
      extractedData.tracks?.push({
        url: thumbnails,
        type: "thumbnails"
      });
    }
    extractedData.posterImage = poster;
    return { extractedData };
  }
  /**
   * Parses recent updates from the Anizone homepage, including recently added anime and latest episodes.
   * @private
   * @param {cheerio.CheerioAPI} $ - Cheerio instance for parsing HTML.
   * @returns  - An object containing arrays of recently added anime and latest episodes.
   */
  parseUpdates($) {
    const recentlyAdded = [];
    const latestAnimeBlock = "div.swiper-wrapper.flex div.space-y-3.pb-6.swiper-slide";
    $(latestAnimeBlock).each((_, el) => {
      const id = $(el).find("a").first().attr("href")?.split("/").at(-1) || null;
      const title = $(el).find("a[title]").attr("title") || $(el).find("img").attr("alt");
      recentlyAdded.push({
        id: title ? `${this.createSlug(title)}-${id}` : null,
        name: title || null,
        posterImage: $(el).find("a > img").attr("src") || null
      });
    });
    const latestEpisodes = [];
    const latestBlockEpisodes = $("div.md\\:w-2\\/3.lg\\:w-3\\/4 ul");
    latestBlockEpisodes.find("li").each((_, el) => {
      const $el = $(el);
      const episodeNumber = $el.find("a.group").attr("href")?.split("/").at(-1);
      const animeId = $el.find("div .title").first().attr("href")?.split("/").at(-1);
      const title = $el.find("div .title").first().text().trim() || null;
      const teaserMatch = $el.find("img").attr(":src")?.match(/'([^']*teaser\.webp)'/);
      latestEpisodes.push({
        episodeId: title ? `${this.createSlug(title)}-${animeId}-episode-${episodeNumber}` : null,
        episodeNumber: episodeNumber ? Number(episodeNumber) : null,
        title: $el.find("div .title").last().text().trim() || null,
        thumbnail: $el.find("img").attr("src") || null,
        teaser: teaserMatch ? teaserMatch[1] : null,
        airDate: $el.find(".flex.flex-row.text-xs span").eq(0).text().trim() || null
      });
    });
    if (Array.isArray(latestEpisodes) && latestEpisodes.length === 0) {
      return {
        data: [],
        error: "Latest  episodes is empty",
        status: 404,
        recentlyAdded: []
      };
    }
    if (Array.isArray(recentlyAdded) && recentlyAdded.length === 0) {
      return {
        data: [],
        error: "Recently added is empty",
        status: 404,
        recentlyAdded: []
      };
    }
    return { data: latestEpisodes, recentlyAdded };
  }
  formatQuery = (title) => {
    let decoded = title.trim();
    const isEncoded = /%[0-9A-Fa-f]{2}/.test(decoded);
    if (isEncoded) {
      try {
        decoded = decodeURIComponent(decoded);
      } catch {
      }
    }
    return decoded;
  };
};

// src/provider/anime/anikoto.ts
import * as cheerio6 from "cheerio";

// src/types/anime.ts
var IGenres = {
  action: "action",
  adventure: "adventure",
  cars: "cars",
  comedy: "comedy",
  dementia: "dementia",
  demons: "demons",
  drama: "drama",
  ecchi: "ecchi",
  fantasy: "fantasy",
  game: "game",
  harem: "harem",
  historical: "historical",
  horror: "horror",
  isekai: "isekai",
  josei: "josei",
  kids: "kids",
  magic: "magic",
  "martial-arts": "martial-arts",
  mecha: "mecha",
  military: "military",
  music: "music",
  mystery: "mystery",
  parody: "parody",
  police: "police",
  psychological: "psychological",
  romance: "romance",
  samurai: "samurai",
  school: "school",
  "sci-fi": "sci-fi",
  seinen: "seinen",
  shoujo: "shoujo",
  "shoujo-ai": "shoujo-ai",
  shounen: "shounen",
  "shounen-ai": "shounen-ai",
  "slice-of-life": "slice-of-life",
  space: "space",
  sports: "sports",
  "super-power": "super-power",
  supernatural: "supernatural",
  thriller: "thriller",
  vampire: "vampire"
};

// src/source-extractors/anikoto/megaplay.ts
import * as cheerio3 from "cheerio";
var MegaPlay = class extends BaseClass {
  baseUrl = "https://megaplay.buzz/stream";
  constructor(options) {
    super(options);
  }
  parseMediaId($) {
    const selector1 = "body  div.mg3-player > div.fix-area ";
    const id1 = $(selector1).attr("data-id")?.trim();
    const fileId = $("title").text().match(/File\s+(\d+)/i)?.[1] ?? null;
    const finalMediaId = id1 || fileId;
    return finalMediaId;
  }
  async extract(videoUrl, referer) {
    const extractedData = {
      intro: {
        start: 0,
        end: 0
      },
      outro: {
        start: 0,
        end: 0
      },
      subtitles: [],
      sources: []
    };
    try {
      const initialResponse = await this.client.fetch(`${videoUrl.href}`, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "X-Requested-With": "XMLHttpRequest",
          "Accept-Encoding": "gzip, deflate, br, zstd",
          Referer: `${referer}/`
        }
      });
      if (!initialResponse.ok) {
        return {
          data: null,
          error: initialResponse.statusText,
          status: initialResponse.status
        };
      }
      const initialResult = await initialResponse.text();
      const id = this.parseMediaId(cheerio3.load(initialResult));
      const response = await this.client.fetch(`${this.baseUrl}/getSources?id=${id}&id=${id}`, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Encoding": "gzip, deflate, br, zstd",
          "X-Requested-With": "XMLHttpRequest",
          Referer: videoUrl.href
        }
      });
      if (!response.ok) {
        return {
          data: null,
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      extractedData.sources.push({
        url: result.sources.file,
        isM3u8: result.sources.file.includes("m3u8"),
        type: result.sources.file.includes("m3u8") ? "hls" : "unknown"
      });
      extractedData.intro = result.intro;
      extractedData.outro = result.outro;
      extractedData.subtitles = result.tracks.map((item) => ({
        url: item.file,
        lang: item.label,
        default: item.default
      }));
      return {
        data: extractedData
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Unknown Error",
        status: 500
      };
    }
  }
  async extractNew(videoUrl, referer) {
    const extractedData = {
      intro: {
        start: 0,
        end: 0
      },
      outro: {
        start: 0,
        end: 0
      },
      subtitles: [],
      sources: []
    };
    try {
      const intialUrl = `${videoUrl.href}?autostart=true`;
      const initialResponse = await this.client.fetch(`${intialUrl}`, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "X-Requested-With": "XMLHttpRequest",
          "Accept-Encoding": "gzip, deflate, br, zstd",
          Referer: `${referer}/`
        }
      });
      if (!initialResponse.ok) {
        return {
          data: null,
          error: initialResponse.statusText,
          status: initialResponse.status
        };
      }
      const initialResult = await initialResponse.text();
      const id = this.parseMediaId(cheerio3.load(initialResult));
      const response = await this.client.fetch(`${this.baseUrl}/getSourcesNew?id=${id}&id=${id}`, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Encoding": "gzip, deflate, br, zstd",
          "X-Requested-With": "XMLHttpRequest",
          Referer: intialUrl
        }
      });
      if (!response.ok) {
        return {
          data: null,
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      extractedData.sources.push({
        url: result.sources.file,
        isM3u8: result.sources.file.includes("m3u8"),
        type: result.sources.file.includes("m3u8") ? "hls" : "unknown"
      });
      extractedData.intro = result.intro;
      extractedData.outro = result.outro;
      extractedData.subtitles = result.tracks.map((item) => ({
        url: item.file,
        lang: item.label,
        default: item.default
      }));
      return {
        data: extractedData
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Unknown Error",
        status: 500
      };
    }
  }
};

// src/source-extractors/anikoto/vidwish.ts
import * as cheerio4 from "cheerio";
var VidWish = class extends BaseClass {
  baseUrl = "https://vidwish.live/stream";
  constructor(options = { http3: true }) {
    super(options);
  }
  parseMediaId($) {
    const selector1 = "body  div.mg3-player > div.fix-area ";
    const id1 = $(selector1).attr("data-id")?.trim();
    const fileId = $("title").text().match(/File\s+(\d+)/i)?.[1] ?? null;
    const finalMediaId = id1 || fileId;
    return finalMediaId;
  }
  async extract(videoUrl, referer) {
    const extractedData = {
      intro: {
        start: 0,
        end: 0
      },
      outro: {
        start: 0,
        end: 0
      },
      subtitles: [],
      sources: []
    };
    try {
      const intialUrl = `${videoUrl.href}?autostart=true`;
      const initialResponse = await this.client.fetch(`${intialUrl}`, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Encoding": "gzip, deflate, br, zstd",
          Referer: `${referer}/`
        }
      });
      if (!initialResponse.ok) {
        return {
          data: null,
          error: initialResponse.statusText,
          status: initialResponse.status
        };
      }
      const initialResult = await initialResponse.text();
      const id = this.parseMediaId(cheerio4.load(initialResult));
      const response = await this.client.fetch(`${this.baseUrl}/getSources?id=${id}&id=${id}`, {
        method: "GET",
        headers: {
          Accept: "application/json, text/javascript, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest",
          Referer: intialUrl
          //yep  here too
        }
      });
      if (!response.ok) {
        return {
          data: null,
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      extractedData.sources.push({
        url: result.sources.file,
        isM3u8: result.sources.file.includes("m3u8"),
        type: result.sources.file.includes("m3u8") ? "hls" : "unknown"
      });
      extractedData.intro = result.intro;
      extractedData.outro = result.outro;
      extractedData.subtitles = result.tracks.map((item) => ({
        url: item.file,
        lang: item.label,
        default: item.default
      }));
      return {
        data: extractedData
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Unknown Error",
        status: 500
      };
    }
  }
};

// src/source-extractors/anikoto/vidtube.ts
import * as cheerio5 from "cheerio";
var VidTube = class extends BaseClass {
  baseUrl = "https://vidtube.site";
  constructor(options) {
    super(options);
  }
  parseMediaId($) {
    const selector1 = "body  div.mg3-player > div.fix-area ";
    const id1 = $(selector1).attr("data-id")?.trim();
    const fileId = $("title").text().match(/File\s+(\d+)/i)?.[1] ?? null;
    const finalMediaId = id1 || fileId;
    return finalMediaId;
  }
  async extract(videoUrl, referer) {
    const extractedData = {
      intro: {
        start: 0,
        end: 0
      },
      outro: {
        start: 0,
        end: 0
      },
      subtitles: [],
      sources: []
    };
    try {
      const intialUrl = `${videoUrl.href}?autostart=true`;
      const initialResponse = await this.client.fetch(`${intialUrl}`, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "X-Requested-With": "XMLHttpRequest",
          "Accept-Encoding": "gzip, deflate, br, zstd",
          Referer: `${referer}/`
        }
      });
      if (!initialResponse.ok) {
        return {
          data: null,
          error: initialResponse.statusText,
          status: initialResponse.status
        };
      }
      const initialResult = await initialResponse.text();
      const version = videoUrl.href.split("/").at(-1);
      const id = this.parseMediaId(cheerio5.load(initialResult));
      const response = await this.client.fetch(
        `${this.baseUrl}/stream/getSourcesNew?id=${id}&id=${id}&type=${version}&type=${version}`,
        {
          method: "GET",
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "X-Requested-With": "XMLHttpRequest",
            Referer: intialUrl
          }
        }
      );
      if (!response.ok) {
        return {
          data: null,
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      extractedData.sources.push({
        url: result.sources.file,
        isM3u8: result.sources.file.includes("m3u8"),
        type: result.sources.file.includes("m3u8") ? "hls" : "unknown"
      });
      extractedData.intro = result.intro;
      extractedData.outro = result.outro;
      extractedData.subtitles = result.tracks.map((item) => ({
        url: item.file,
        lang: item.label,
        default: item.default
      }));
      return {
        data: extractedData
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Unknown Error",
        status: 500
      };
    }
  }
};

// src/provider/anime/anikoto.ts
var Anikoto = class extends AnimeParser {
  MegaPlay;
  VidWish;
  VidPlay;
  constructor(baseUrl = "https://anikototv.to", options = {}) {
    super(baseUrl, options);
    this.baseUrl = baseUrl;
    this.MegaPlay = new MegaPlay(options);
    this.VidWish = new VidWish(options);
    this.VidPlay = new VidTube(options);
  }
  /**
   * Fetches the home page data including spotlight, recent updates, upcoming anime, and categorized sections.
   */
  async fetchHome() {
    try {
      const response = await this.client.fetch(`${this.baseUrl}/home`, {
        method: "GET"
      });
      if (!response.ok) {
        return {
          data: [],
          error: response.statusText,
          status: response.status,
          recentlyUpdated: [],
          upcoming: [],
          sections: {
            recentlyAdded: [],
            recentlyReleased: [],
            recentlyCompleted: []
          },
          topAnime: {
            day: [],
            week: [],
            month: []
          }
        };
      }
      const result = await response.text();
      return this.parseHome(cheerio6.load(result));
    } catch (error) {
      return {
        data: [],
        error: error instanceof Error ? error.message : "Unknown Error",
        status: 500,
        recentlyUpdated: [],
        upcoming: [],
        sections: {
          recentlyAdded: [],
          recentlyReleased: [],
          recentlyCompleted: []
        },
        topAnime: {
          day: [],
          week: [],
          month: []
        }
      };
    }
  }
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
  async fetchSchedule(timezone) {
    try {
      const response = await this.client.fetch(`${this.baseUrl}/ajax/schedule?tz=${timezone}`, {
        method: "GET",
        headers: {
          Accept: "application/json, text/javascript, */*; q=0.01",
          Referer: `${this.baseUrl}/home}`,
          "X-Requested-With": "XMLHttpRequest"
        }
      });
      if (!response.ok) {
        return {
          data: [],
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      return this.parseSchedule(cheerio6.load(result.result));
    } catch (error) {
      return {
        data: [],
        error: error instanceof Error ? error.message : "Unknown err",
        status: 500
      };
    }
  }
  /**
   * Searches for anime by keyword.
   *
   * @param query Search keyword
   * @param page
   * @returns Search results with anime list
   */
  async search(query, page = 1) {
    const finalUrl = page > 1 ? `filter?keyword=${query}?page=${page}` : `filter?keyword=${query}`;
    return await this.fetchPaginatedSections(finalUrl.trim());
  }
  /**
   * Fetches search suggestions for a given query string .
   * @param  query - The search query string (required).
    @returns A promise that resolves to an object containing an array of anime titles or an error message.
   */
  async searchSuggestions(query) {
    if (!query) {
      return {
        data: [],
        error: this.formatHttpError(400),
        status: 400
      };
    }
    try {
      const response = await this.client.fetch(`${this.baseUrl}/ajax/anime/search?keyword=${query}`, {
        headers: {
          Accept: "application/json, text/javascript, */*; q=0.01",
          Referer: `${this.baseUrl}/home}`,
          "X-Requested-With": "XMLHttpRequest"
        }
      });
      if (!response.ok) {
        return {
          data: [],
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      return this.parseSearchSuggessations(cheerio6.load(result.result.html));
    } catch (error) {
      return {
        data: [],
        error: error instanceof Error ? error.message : "Unknown err",
        status: 500
      };
    }
  }
  /**
   * Fetches detailed information about a specific anime, including metadata and episode list.
   *
   * @param id Anime ID (series slug)
   * @returns Anime details + provider episodes
   */
  async fetchAnimeInfo(id) {
    if (!id) {
      return {
        data: null,
        providerEpisodes: [],
        error: "Missing required params :id",
        status: 400
      };
    }
    try {
      const response = await this.client.fetch(`${this.baseUrl}/watch/${id}`, {
        method: "GET"
      });
      if (!response.ok) {
        return {
          data: null,
          providerEpisodes: [],
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.text();
      const info = this.parseAnimeinfo(cheerio6.load(result));
      const episodeResponse = await this.client.fetch(`${this.baseUrl}/ajax/episode/list/${info.seriesId}?vrf=`, {
        method: "GET",
        headers: {
          Accept: "application/json, text/javascript, */*; q=0.01",
          Referer: `${this.baseUrl}/${id}`,
          "X-Requested-With": "XMLHttpRequest"
        }
      });
      if (!episodeResponse.ok) {
        return {
          data: null,
          providerEpisodes: [],
          error: episodeResponse.statusText,
          status: episodeResponse.status
        };
      }
      const episodeResult = await episodeResponse.json();
      const episodes = this.parseEpisodes(cheerio6.load(episodeResult.result));
      return {
        data: info,
        providerEpisodes: episodes.data
      };
    } catch (error) {
      return {
        data: null,
        providerEpisodes: [],
        error: error instanceof Error ? error.message : "Unknown err",
        status: 500
      };
    }
  }
  /**
   * Fetches detailed information about a specific anime, including metadata and episode list.
   *
   * @param id Anime ID (series slug)
   * @returns  provider episodes
   */
  async fetchProviderEpisodes(id) {
    if (!id) {
      return {
        data: [],
        error: "Missing required params :id",
        status: 400
      };
    }
    try {
      const response = await this.client.fetch(`${this.baseUrl}/watch/${id}`, {
        method: "GET"
      });
      if (!response.ok) {
        return {
          data: [],
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.text();
      const info = this.parseAnimeinfo(cheerio6.load(result));
      const episodeResponse = await this.client.fetch(`${this.baseUrl}/ajax/episode/list/${info.seriesId}?vrf=`, {
        method: "GET",
        headers: {
          Accept: "application/json, text/javascript, */*; q=0.01",
          Referer: `${this.baseUrl}/${id}`,
          "X-Requested-With": "XMLHttpRequest"
        }
      });
      if (!episodeResponse.ok) {
        return {
          data: [],
          error: episodeResponse.statusText,
          status: episodeResponse.status
        };
      }
      const episodeResult = await episodeResponse.json();
      const episodes = this.parseEpisodes(cheerio6.load(episodeResult.result));
      return {
        data: episodes.data
      };
    } catch (error) {
      return {
        data: [],
        error: error instanceof Error ? error.message : "Unknown err",
        status: 500
      };
    }
  }
  /**
   * Fetches a paginated list of most popular anime.
   * @param page Page number (default: 1)
   */
  async fetchMostPopular(page = 1) {
    const finalUrl = page > 1 ? `most-viewed?page=${page}` : `most-viewed`;
    return await this.fetchPaginatedSections(finalUrl.trim());
  }
  /**
   * Fetches a paginated list of recently updated anime.
   * @param page Page number (default: 1)
   */
  async fetchRecentlyUpdated(page = 1) {
    const finalUrl = page > 1 ? `latest-updated?page=${page}` : `latest-updated`;
    return await this.fetchPaginatedSections(finalUrl.trim());
  }
  /**
   * Fetches a paginated list of recently added anime.
   * @param page Page number (default: 1)
   */
  async fetchRecentlyAdded(page = 1) {
    const finalUrl = page > 1 ? `new-release?page=${page}` : `new-release`;
    return await this.fetchPaginatedSections(finalUrl.trim());
  }
  /**
   * Fetches a paginated list of upcoming (not yet aired) anime.
   * @param page Page number (default: 1)
   */
  async fetchUpcoming(page = 1) {
    const finalUrl = page > 1 ? `status/not-yet-aired?page=${page}` : `status/not-yet-aired`;
    return await this.fetchPaginatedSections(finalUrl.trim());
  }
  /**
   * Fetches a paginated list of currently releasing anime.
   * @param page Page number (default: 1)
   */
  async fetchReleasing(page = 1) {
    const finalUrl = page > 1 ? `status/currently-airing?page=${page}` : `status/currently-airing`;
    return await this.fetchPaginatedSections(finalUrl.trim());
  }
  /**
   * Fetches a paginated list of recently completed anime.
   * @param page Page number (default: 1)
   */
  async fetchRecentlyCompleted(page = 1) {
    const finalUrl = page > 1 ? `status/finished-airing?page=${page}` : `status/finished-airing`;
    return await this.fetchPaginatedSections(finalUrl.trim());
  }
  /**
   * Fetches a paginated list of anime by category (TV, Movie, ONA, etc.).
   * @param format Anime category
   * @param page Page number (default: 1)
   */
  async fetchAnimeCategory(format, page = 1) {
    let category;
    switch (format) {
      case "MOVIE":
        category = "movie";
        break;
      case "TV":
        category = "tv";
        break;
      case "ONA":
        category = "ona";
        break;
      case "OVA":
        category = "ova";
        break;
      case "SPECIALS":
        category = "special";
        break;
      default:
        return {
          hasNextPage: false,
          currentPage: 0,
          lastPage: 0,
          data: [],
          error: this.formatHttpError(400),
          status: 400
        };
    }
    const finalUrl = page > 1 ? `type/${category}?page=${page}` : `type/${category}`;
    return this.fetchPaginatedSections(finalUrl.trim());
  }
  /**
   * Fetches a list of anime titles sorted alphabetically, optionally filtered by a starting character.
   * @param  sort Optional letter (A-Z) or "0-9" to filter anime
   * @param  page - Page number for pagination (default: 1)
   * @returns  Promise resolving to an object  with alphabetically sorted anime and pagination details
   */
  async fetchAtoZList(sort, page = 1) {
    const sortValue = (sort ?? "").toString().trim();
    const sortCategory = !sortValue ? void 0 : !Number.isNaN(Number(sortValue)) ? "0-9" : sortValue.length === 1 ? sortValue.toUpperCase() : "other";
    const baseUrl = sortCategory ? `az-list/${sortCategory}` : `az-list`;
    const finalUrl = page > 1 ? `${baseUrl}?page=${page}` : baseUrl;
    return await this.fetchPaginatedSections(finalUrl);
  }
  /**
   * Fetches a list of anime by genre.
   * @param  genre -The genre to filter anime by
   * @param  page - Page number for pagination (default: 1)
   * @returns  Promise resolving to an object with genre-specific anime and pagination details
   */
  async fetchGenre(genre, page = 1) {
    const Igenre = this.getMappedValue(genre, IGenres);
    const finalUrl = page > 1 ? `genre/${Igenre}?page=${page}` : `genre/${Igenre}`;
    return await this.fetchPaginatedSections(finalUrl);
  }
  /**
   * Fetches available streaming servers for a specific episode.
   *
   * @param episodeId Episode identifier
   * @returns Server information grouped by sub/dub/raw
   */
  async fetchServers(episodeId) {
    if (!episodeId) {
      return {
        data: null,
        error: "Missing required params: valid episodeId!",
        status: 400
      };
    }
    try {
      const response = await this.client.fetch(`${this.baseUrl}/ajax/server/list?servers=${episodeId}`, {
        method: "GET",
        headers: {
          Accept: "application/json, text/javascript, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest"
        }
      });
      if (!response.ok) {
        return {
          data: null,
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      const servers = this.parseServers(cheerio6.load(result.result));
      return {
        data: servers
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Unknown err",
        status: 500
      };
    }
  }
  /**
   * Fetches streaming sources for a given episode.
   *
   * @param episodeId Episode identifier (or direct server URL if starts with http)
   * @param version Audio version - `'sub'` or `'dub'` (default: `'sub'`)
   * @param server Preferred server name (default: `'vidstream-2'`)
   * @returns Streaming source data with headers
   */
  async fetchSources(episodeId, version = "sub", server = "vidstream-2") {
    if (!episodeId) {
      return {
        headers: { Referer: null },
        data: null,
        error: "Missing required params: valid episodeId!",
        status: 400
      };
    }
    if (episodeId.startsWith("http")) {
      const serverUrl = new URL(episodeId);
      switch (server) {
        case "vidstream-2":
          return {
            headers: { Referer: `${serverUrl.origin}/` },
            data: (await this.MegaPlay.extract(serverUrl, `${this.baseUrl}/`)).data
          };
        case "hd-1":
          return {
            headers: { Referer: `${serverUrl.origin}/` },
            data: (await this.MegaPlay.extractNew(serverUrl, `${this.baseUrl}/`)).data
          };
        case "vidcloud-1":
          return {
            headers: { Referer: `${serverUrl.origin}/` },
            data: (await this.VidWish.extract(serverUrl, `${this.baseUrl}/`)).data
          };
        case "vidplay-1":
          return {
            headers: { Referer: `${serverUrl.origin}/` },
            data: (await this.VidPlay.extract(serverUrl, `${this.baseUrl}/`)).data
          };
        default:
          return {
            headers: { Referer: null },
            data: null,
            error: "Unsupported, might add more options soon",
            status: 400
          };
      }
    }
    try {
      const serverInfo = await this.fetchServers(episodeId);
      if (serverInfo.error || serverInfo.data === null) {
        return {
          error: serverInfo.error,
          headers: { Referer: null },
          data: null,
          status: serverInfo.status
        };
      }
      const serverId = this.findServerId(serverInfo.data, version, server);
      const response = await this.client.fetch(`${this.baseUrl}/ajax/server?get=${serverId}`, {
        method: "GET",
        headers: {
          Accept: "application/json, text/javascript, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest"
        }
      });
      const result = await response.json();
      return await this.fetchSources(result.result.url, version, server);
    } catch (error) {
      return {
        headers: { Referer: null },
        data: null,
        error: error instanceof Error ? error.message : "Unknown Error",
        status: 500
      };
    }
  }
  /**
   * Parses anime items from home page sections.
   * @param $ Cheerio instance
   * @param selector CSS selector for the anime items
   */
  parseHomeAnimeSectoons = ($, selector) => {
    const items = [];
    $(selector).each((_, element) => {
      const ep = $(element).find(".ep-status");
      const href = $(element).find("div.info > a").attr("href");
      const id = href?.includes("ep") ? href.split("/").at(-2) : href?.split("/").at(-1);
      items.push({
        id: id || null,
        name: $(element).find("div.info > a").text().trim() || null,
        romaji: $(element).find("div.info > a").attr("data-jp") || null,
        posterImage: $(element).find("img").attr("src") || null,
        type: $(element).find(".meta .right").text().trim() || null,
        episodes: {
          sub: Number(ep.filter(".sub").text().trim()) || null,
          dub: Number(ep.filter(".dub").text().trim()) || null
        },
        totalEpisodes: Number(ep.filter(".total").text().trim()) || Number(ep.filter(".sub").text().trim()) || null
      });
    });
    return items;
  };
  /**
   * Parses newly added/completed/released anime items.
   * @param $ Cheerio instance
   * @param selector CSS selector for the items
   */
  parseNewAddedItems = ($, selector) => {
    const items = [];
    $(selector).each((_, element) => {
      items.push({
        id: $(element).attr("href")?.split("/").filter(Boolean).at(-1) || null,
        name: $(element).find(".name.d-title").text().trim() || null,
        romaji: $(element).find(".name.d-title").attr("data-jp") || null,
        posterImage: $(element).find(".poster img").attr("src") || null,
        type: $(element).find(".meta.one-line .dot:nth-child(2)").text().trim() || null,
        episodes: {
          sub: Number($(element).find(".ep-status.sub > span").text().trim()) || null,
          dub: Number($(element).find(".ep-status.dub > span").text().trim()) || null
        },
        totalEpisodes: Number($(element).find(".ep-status.sub > span").text().trim()) || null
      });
    });
    return items;
  };
  /**
   * Parses top  anime items.
   * @param $ Cheerio instance
   * @param selector CSS selector for the items
   */
  parseTopAnimeSegement($, tabName) {
    const selector = `#top-anime .tab-content[data-name="${tabName}"] .scaff.items .item`;
    const results = [];
    $(selector).each((_, element) => {
      results.push({
        id: $(element).attr("href")?.split("/").at(-1) || null,
        name: $(element).find(".name").text().trim() || null,
        romaji: $(element).find(".name").attr("data-jp")?.trim() || null,
        rank: Number(
          $(element).attr("class")?.split(" ").find((c) => c.startsWith("rank"))?.replace("rank", "")
        ) || 0,
        posterImage: $(element).find(".poster img").attr("src") ?? "",
        type: $(element).find(".meta .dot:not(.ep-wrap)").first().text().trim() || null,
        episodes: {
          sub: Number($(element).find(".ep-status.sub > span").first().text().trim()) || null,
          dub: Number($(element).find(".ep-status.dub > span").first().text().trim()) || null
        },
        totalEpisodes: Number($(element).find(".ep-status.sub > span").first().text().trim()) || null
      });
    });
    return results;
  }
  /**
   * Parses the home page content including spotlight, recent updates, upcoming, etc.
   * @param $ Cheerio instance with loaded home page HTML
   */
  parseHome($) {
    const highlightsSelector = "div#hotest > div.swiper-wrapper > div.swiper-slide.item ";
    const spotlight = [];
    $(highlightsSelector).each((_, element) => {
      const icons = $(element).find("div.meta.icons");
      spotlight.push({
        id: $(element).find("div.actions > a").attr("href")?.split("/").at(-1) || null,
        name: $(element).find("div.info > h2.title.d-title").text().trim() || null,
        romaji: $(element).find("div.info > h2.title.d-title").attr("data-jp") || null,
        posterImage: $(element).find("div.image > div").attr("style")?.match(/url\(['"]?(.*?)['"]?\)/)?.[1] ?? null,
        synopsis: $(element).find("div.synopsis").text().trim() || null,
        rating: icons.find("i.rating").text().trim() || null,
        quality: icons.find("i.quality").text().trim() || null,
        episodes: {
          dub: Number($(element).find(".ep-status.dub > span").first().text().trim()) || icons.find("i.dub").length > 0,
          sub: Number($(element).find(".ep-status.sub > span").first().text().trim()) || icons.find("i.sub").length > 0
        }
      });
    });
    const latestEpisodesSelector = "section#recent-update div.ani.items > div.item";
    const upcomingSelector = "section#upcoming-anime div.ani.items > div.item";
    const recentUpdated = this.parseHomeAnimeSectoons($, latestEpisodesSelector);
    const upcomingAnime = this.parseHomeAnimeSectoons($, upcomingSelector);
    const recentlyCompletedSelector = 'section.top-table[data-name="completed"] div.body .scaff.items a.item';
    const recentlyAddedSelector = 'section.top-table[data-name="new-added"] div.body .scaff.items a.item';
    const recentlyReleasedSelector = 'section.top-table[data-name="new-release"] div.body .scaff.items a.item';
    const recentlyCompleted = this.parseNewAddedItems($, recentlyCompletedSelector);
    const recentlyAdded = this.parseNewAddedItems($, recentlyAddedSelector);
    const recentlyReleased = this.parseNewAddedItems($, recentlyReleasedSelector);
    return {
      data: spotlight,
      recentlyUpdated: recentUpdated,
      upcoming: upcomingAnime,
      sections: {
        recentlyAdded,
        recentlyReleased,
        recentlyCompleted
      },
      topAnime: {
        day: this.parseTopAnimeSegement($, "day"),
        week: this.parseTopAnimeSegement($, "week"),
        month: this.parseTopAnimeSegement($, "month")
      }
    };
  }
  /**
   * Parses the schedule from ajax html
   * @param $ Cheerio instance with loaded home page HTML
   */
  parseSchedule($) {
    const days = [];
    const dayHeaders = [];
    $("#schedule .days .day").each((_, element) => {
      const $day = $(element);
      const dayName = $day.find(".inner .wday").text().trim() || $day.find(".wday").text().trim();
      const date = $day.find(".inner .date").text().trim() || $day.find(".date").text().trim();
      const timestamp = Number($day.find(".inner").attr("data-time")) || null;
      if (!dayName && !date) return;
      dayHeaders.push({
        day: dayName,
        date,
        timestamp
      });
    });
    const animes = [];
    $("#schedule .body .items .item").each((_, el) => {
      const $el = $(el);
      const href = $el.attr("href") ?? "";
      const slug = href.replace(/^https?:\/\/[^/]+/, "").replace(/^\/watch\//, "").replace(/\/ep-\d+$/, "").replace(/\/$/, "");
      animes.push({
        id: slug,
        name: $el.find(".title, .d-title").text().trim(),
        episode: $el.find(".ep span").text().trim() || null,
        time: $el.find(".time").text().trim() || null
      });
    });
    const perDay = Math.ceil(animes.length / dayHeaders.length);
    dayHeaders.forEach((d, i) => {
      days.push({
        ...d,
        anime: animes.slice(i * perDay, (i + 1) * perDay)
      });
    });
    return { data: days };
  }
  /**
   * Parses detailed anime information from the watch/info page.
   * @param $ Cheerio instance
   */
  parseAnimeinfo($) {
    const selector = "div#w-info div.binfo";
    const root = $(selector);
    const numericId = $("div#watch-main").attr("data-id");
    const seriesId = $("div#watch-main").attr("data-url")?.split("/").at(-1);
    const mediaRoot = $("#w-media");
    const bannerStyle = mediaRoot.find("#player").attr("style") || "";
    const bannerImage = bannerStyle.match(/url\(['"]?(.*?)['"]?\)/)?.[1] || null;
    const anilistId = bannerImage?.match(/anime\/banner\/(\d+)-/)?.[1] || null;
    const info = {
      id: seriesId || null,
      name: root.find("div.info > h1.title.d-title").text().trim() || null,
      romaji: root.find("div.info > h1.title.d-title").attr("data-jp") || root.find("div.info div.names.font-italic.mb-2").text().trim() || null,
      posterImage: root.find("div.poster > span > img").attr("src") || null,
      anilistId: anilistId || null,
      bannerImage: bannerImage || null,
      totalEpisodes: parseInt(
        root.find("div.meta > div").filter((_, el) => $(el).text().includes("Episodes:")).find("span").text().trim(),
        10
      ) || null,
      synopsis: root.find("div.content").text().trim() || null,
      score: parseFloat(
        root.find("div.meta > div").filter((_, el) => $(el).text().includes("MAL:")).find("span").text().trim()
      ) || null,
      releaseDate: root.find("div.meta > div").filter((_, el) => $(el).text().includes("Aired:")).find("span").text().trim() || null,
      genre: root.find("div.meta > div").filter((_, el) => $(el).text().includes("Genres:")).find("a").map((_, el) => $(el).text().trim()).get(),
      type: root.find("div.meta > div").filter((_, el) => $(el).text().includes("Type:")).find("span").text().trim() || null,
      premiered: root.find("div.meta > div").filter((_, el) => $(el).text().includes("Premiered:")).find("span").text().trim() || null,
      status: root.find("div.meta > div").filter((_, el) => $(el).text().includes("Status:")).find("span").text().trim() || null,
      duration: root.find("div.meta > div").filter((_, el) => $(el).text().includes("Duration:")).find("span").text().trim() || null,
      studios: root.find("div.meta > div").filter((_, el) => $(el).text().includes("Studios:")).find('a span[itemprop="name"]').map((_, el) => $(el).text().trim()).get(),
      producers: root.find("div.meta > div").filter((_, el) => $(el).text().includes("Producers:")).find('a span[itemprop="name"]').map((_, el) => $(el).text().trim()).get(),
      seriesId: numericId
    };
    return info;
  }
  /**
   * Parses paginated anime results (used for most popular, recently updated, etc.).
   * @param $ Cheerio instance
   */
  parsePaginatedSections($) {
    const selector = "div#list-items  > div.item";
    const anime = [];
    $(selector).each((_, element) => {
      const href = $(element).find("div.ani.poster.tip > a").attr("href");
      const id = href?.includes("ep") ? href.split("/").at(-2) : href?.split("/").at(-1);
      anime.push({
        id: id || null,
        name: $(element).find("div.b1 > a.name.d-title").text().trim() || null,
        romaji: $(element).find("div.b1 > a.name.d-title").attr("data-jp") || null,
        posterImage: $(element).find("div.ani.poster.tip img").attr("src") || null,
        type: $(element).find("div.meta div.right").text().trim() || null,
        episodes: {
          sub: Number($(element).find("div.left .ep-status.sub > span").first().text().trim()) || null,
          dub: Number($(element).find("div.left .ep-status.dub > span").first().text().trim()) || null
        },
        totalEpisodes: Number($(element).find("div.left .ep-status.total > span").first().text().trim()) || Number($(element).find("div.left .ep-status.sub > span").first().text().trim()) || null
      });
    });
    const activeText = $(".pagination .page-item.active .page-link").first().text().trim();
    const currentPage = Number(activeText) || 1;
    const lastPageText = $('.pagination .page-item a[title="Last"]').attr("href")?.match(/page=(\d+)/)?.[1];
    const lastPage = lastPageText ? Number(lastPageText) : null;
    const nextHref = $('.pagination .page-item a[rel="next"]').attr("href");
    const hasNextPage = Boolean(nextHref) || lastPage !== null && Number.isFinite(lastPage) && currentPage < lastPage;
    if (Array.isArray(anime) && anime.length === 0) {
      return { data: [], error: "No results found", status: 404, hasNextPage: false, currentPage: 0, lastPage: 0 };
    }
    return { hasNextPage, currentPage, lastPage, data: anime };
  }
  /**
   * Parses episode list from AJAX response.
   * @param $ Cheerio instance
   */
  parseEpisodes($) {
    const selector = "div.body    ul.ep-range  li";
    const episodes = [];
    $(selector).each((_, element) => {
      const sub = Number($(element).find("a").attr("data-sub")) === 1;
      const dub = Number($(element).find("a").attr("data-dub")) === 1;
      episodes.push({
        episodeId: $(element).find("a").attr("data-ids")?.replace("&eps=", "-episode-") || null,
        title: $(element).attr("title") || null,
        episodeNumber: Number($(element).find("a").attr("data-num")) || null,
        hasSub: sub,
        hasDub: dub,
        malId: $(element).find("a").attr("data-mal") ? Number($(element).find("a").attr("data-mal")) : null
      });
    });
    if (Array.isArray(episodes) && episodes.length === 0) {
      return { data: [], error: "No episodes found", status: 404 };
    }
    return { data: episodes };
  }
  /**
   * Parses available streaming servers for an episode.
   * @param $ Cheerio instance
   */
  parseServers($) {
    const servers = {
      sub: [],
      dub: [],
      raw: [],
      episodeNumber: 0
    };
    const episodeText = $("div.tip b").first().text().trim();
    const match = episodeText.match(/(\d+)/);
    if (match) {
      servers.episodeNumber = parseInt(match[1], 10);
    }
    $("div.servers div.type").each((_, element) => {
      const $type = $(element);
      const type = $type.attr("data-type");
      $type.find("ul li").each((_2, li) => {
        const $li = $(li);
        const serverName = $li.text().trim().toLowerCase() || null;
        const server = {
          serverId: $li.attr("data-sv-id") ?? null,
          serverName,
          mediaId: $li.attr("data-cmid") ?? null,
          eid: $li.attr("data-link-id") ?? null
        };
        if (type === "sub") {
          servers.sub.push(server);
        } else if (type === "dub") {
          servers.dub.push(server);
        } else {
          servers.sub.push(server);
        }
      });
    });
    return servers;
  }
  /**
   * Parses search suggestion results from a Cheerio instance.
   * Extracts anime suggestion details from the provided HTML.
   * @param $ CheerioAPI instance
   * @returns An array containing an array of search suggestions
   */
  parseSearchSuggessations($) {
    const results = [];
    $(".scaff.items a.item").each((_, element) => {
      $(element);
      const href = $(element).attr("href") || null;
      const dots = $(element).find(".meta .dot");
      const scoreText = dots.eq(1).text().replace(/[^0-9.]/g, "").trim();
      results.push({
        id: href?.split("/watch/").pop() || null,
        name: $(element).find(".name.d-title").text().trim() || null,
        romaji: $(element).find(".name.d-title").attr("data-jp") || null,
        posterImage: $(element).find(".poster img").attr("src") || null,
        rating: dots.eq(0).text().trim() || null,
        score: scoreText ? Number(scoreText) : null,
        type: dots.eq(2).text().trim() || null,
        year: Number(dots.eq(3).text().trim()) || null
      });
    });
    if (Array.isArray(results) && results.length === 0) {
      return { data: [], error: this.formatHttpError(400), status: 404 };
    }
    return { data: results };
  }
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
  findServerId(servers, category, server) {
    const serverPreference = ["vidstream-2", "vidcloud-1"];
    const versionPreference = ["sub", "dub"];
    const versionCandidates = [category, ...versionPreference.filter((v) => v !== category)];
    let selectedMediaId = null;
    let usedVersion = null;
    let usedServer = null;
    for (const ver of versionCandidates) {
      const list = servers[ver];
      if (!list || list.length === 0) continue;
      const exactIdx = list.findIndex((s) => (s.serverName || "").toLowerCase() === server.toLowerCase());
      if (exactIdx !== -1) {
        selectedMediaId = list[exactIdx].eid;
        usedVersion = ver;
        usedServer = server;
        break;
      }
      for (const pref of serverPreference) {
        const prefIdx = list.findIndex((s) => (s.serverName || "").toLowerCase() === pref.toLowerCase());
        if (prefIdx !== -1) {
          selectedMediaId = list[prefIdx].eid;
          usedVersion = ver;
          usedServer = pref;
          break;
        }
      }
      if (selectedMediaId !== null) break;
    }
    if (selectedMediaId === null) {
      const available = versionPreference.filter((v) => servers[v]?.length > 0).join(", ") || "none";
      throw new Error(`No servers available in any version. Available versions: ${available}.`);
    }
    return selectedMediaId;
  }
  /**
   * Internal helper to fetch and parse paginated anime sections.
   * @param url Relative URL for the section
   */
  async fetchPaginatedSections(url) {
    if (!url) {
      return {
        hasNextPage: false,
        currentPage: 0,
        lastPage: 0,
        data: [],
        error: this.formatHttpError(400),
        status: 400
      };
    }
    try {
      const response = await this.client.fetch(`${this.baseUrl}/${url}`, { method: "GET" });
      if (!response.ok) {
        return {
          hasNextPage: false,
          currentPage: 0,
          lastPage: 0,
          data: [],
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.text();
      return this.parsePaginatedSections(cheerio6.load(result));
    } catch (error) {
      return {
        hasNextPage: false,
        currentPage: 0,
        lastPage: 0,
        data: [],
        error: error instanceof Error ? error.message : "Unknown Error",
        status: 500
      };
    }
  }
};

// src/provider/anime/anibd.ts
var AniBD = class extends AnimeParser {
  constructor(baseUrl = "https://anibd.app", options = {}) {
    super(baseUrl, options);
  }
  async search(query, page = 1) {
    if (!query) {
      return {
        hasNextPage: false,
        currentPage: 0,
        data: [],
        error: this.formatHttpError(400),
        status: 400
      };
    }
    try {
      const response = await this.client.fetch(
        `https://eng.animeapps.top/api/search3.php?keyword=${query}&page=${page}&limit=20/`,
        {
          method: "GET",
          headers: {
            Referer: `${this.baseUrl}/`,
            Origin: this.baseUrl
          }
        }
      );
      if (!response.ok) {
        return {
          hasNextPage: false,
          currentPage: 0,
          data: [],
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      const data = result.data.map((item) => ({
        id: item.postid,
        name: item.postname,
        posterImage: item.ani_cover_large,
        romaji: null,
        type: item.anitypes,
        anilistId: item.anilist || null
      }));
      return {
        hasNextPage: result.pagination.current_page < result.pagination.total_pages,
        currentPage: result.pagination.current_page,
        data
      };
    } catch (error) {
      return {
        hasNextPage: false,
        currentPage: 0,
        data: [],
        error: error instanceof Error ? error.message : "Unknown err",
        status: 500
      };
    }
  }
  async fetchAnimeInfo(id) {
    try {
      const response = await this.client.fetch(`https://eng.animeapps.top/api/single.php?postid=${id}`, {
        method: "GET",
        headers: {
          Referer: `${this.baseUrl}/`,
          Origin: this.baseUrl
        }
      });
      if (!response.ok) {
        return {
          data: null,
          providerEpisodes: [],
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      const info = {
        id: result.data.postid,
        name: result.data.english,
        romaji: result.data.romaji,
        anilistId: result.data.anilist,
        altTiles: result.data.anisynonyms,
        native: result.data.native,
        posterImage: result.data.ani_cover_large || result.data.ani_cover_medium || result.data.ani_banner,
        totalEpisodes: result.data.ani_episodes,
        synopsis: result.data.postcontent,
        releaseDate: result.data.ani_start_date || result.data.postyear,
        type: result.data.anitypes,
        studios: result.data.poststudios,
        genres: result.data.postanigenres
      };
      const episodesResponse = await this.client.fetch(`https://epeng.animeapps.top/api2.php?epid=${info.anilistId}`, {
        method: "GET",
        headers: {
          Referer: `https://anibd.bluesagenaturals.com/`,
          Origin: `https://anibd.bluesagenaturals.com`
        }
      });
      if (!episodesResponse.ok) {
        return {
          data: null,
          providerEpisodes: [],
          error: episodesResponse.statusText,
          status: episodesResponse.status
        };
      }
      const episodesResult = await episodesResponse.json();
      const episodes = episodesResult.flatMap(
        (server) => server.server_data.map((episode) => ({
          episodeId: episode.link,
          episodeNumber: Number(episode.slug),
          title: episode.name,
          hasDub: server.server_name.toLowerCase().includes("dub"),
          hasSub: server.server_name.toLowerCase().includes("sub")
        }))
      );
      return {
        data: info,
        providerEpisodes: episodes
      };
    } catch (error) {
      return {
        data: null,
        providerEpisodes: [],
        error: error instanceof Error ? error.message : "Unknown err",
        status: 500
      };
    }
  }
  async fetchEpisodes(id) {
    if (!id) {
      return {
        data: [],
        error: "Missing required params an anilistId",
        status: 400
      };
    }
    if (Number.isNaN(Number(id))) {
      return {
        data: [],
        error: "The id provided isnt a valid Id, provide an anilistId",
        status: 400
      };
    }
    try {
      const episodesResponse = await this.client.fetch(`https://epeng.animeapps.top/api2.php?epid=${id}`, {
        method: "GET",
        headers: {
          Referer: `https://anibd.bluesagenaturals.com/`,
          Origin: `https://anibd.bluesagenaturals.com`
        }
      });
      if (!episodesResponse.ok) {
        return {
          data: [],
          error: episodesResponse.statusText,
          status: episodesResponse.status
        };
      }
      const episodesResult = await episodesResponse.json();
      const episodes = episodesResult.flatMap(
        (server) => server.server_data.map((episode) => ({
          episodeId: episode.link,
          episodeNumber: Number(episode.slug),
          title: episode.name,
          hasDub: server.server_name.toLowerCase().includes("dub"),
          hasSub: server.server_name.toLowerCase().includes("sub")
        }))
      );
      return {
        data: episodes
      };
    } catch (error) {
      return {
        data: [],
        error: error instanceof Error ? error.message : "Unknown err",
        status: 500
      };
    }
  }
  async fetchSources(episodeId) {
    if (!episodeId) {
      return {
        headers: { Referer: null },
        data: null,
        error: "Missing required params: episodeId",
        status: 400
      };
    }
    try {
      const response = await this.client.fetch(`https://epeng.animeapps.top/apilink.php?data=${episodeId}`, {
        method: "GET",
        headers: {
          Referer: "https://anibd.bluesagenaturals.com/",
          Origin: "https://anibd.bluesagenaturals.com"
        }
      });
      if (!response.ok) {
        return {
          headers: { Referer: null },
          data: null,
          error: response.statusText,
          status: response.status
        };
      }
      const servers = await response.json();
      const extractedData = {
        sources: [],
        subtitles: []
      };
      let referer = null;
      for (const { server, link } of servers) {
        const embedResponse = await this.client.fetch(link, {
          method: "GET",
          headers: {
            Referer: "https://anibd.bluesagenaturals.com/",
            Origin: "https://anibd.bluesagenaturals.com"
          }
        });
        if (!embedResponse.ok) {
          continue;
        }
        const html = await embedResponse.text();
        const embedUrl = new URL(link);
        referer ??= `${embedUrl.origin}/`;
        const parsed = this.parseSources(html, embedUrl, server);
        extractedData.sources.push(...parsed.sources);
        extractedData.subtitles.push(...parsed.subtitles ?? []);
      }
      if (!extractedData.sources.length) {
        return {
          headers: { Referer: null },
          data: null,
          error: "No valid sources found",
          status: 404
        };
      }
      return {
        headers: { Referer: referer },
        data: extractedData
      };
    } catch (error) {
      return {
        headers: { Referer: null },
        data: null,
        error: error instanceof Error ? error.message : "Unknown error",
        status: 500
      };
    }
  }
  parseSources(html, embedUrl, server) {
    let videoUrl;
    let tracks = [];
    const configMatch = html.match(/const\s+config\s*=\s*({[\s\S]*?});/);
    if (configMatch) {
      const config = this.parsePlayerConfig(configMatch[1]);
      videoUrl = new URL(config.videoUrl, embedUrl).toString();
      tracks = config.tracks ?? [];
    } else {
      const artMatch = html.match(/new\s+Artplayer\s*\(\s*{[\s\S]*?url\s*:\s*['"]([^'"]+)['"][\s\S]*?}\s*\)/);
      if (!artMatch) {
        throw new Error("Neither config nor Artplayer configuration found");
      }
      videoUrl = new URL(artMatch[1], embedUrl).toString();
    }
    const isM3u8 = videoUrl.endsWith(".m3u8");
    const quality = videoUrl.match(/(\d{3,4})p/)?.[1] ?? "unknown";
    return {
      sources: [
        {
          url: videoUrl,
          isM3u8,
          type: isM3u8 ? "hls" : "unknown",
          quality: `${server}-${quality}`
        }
      ],
      subtitles: tracks.map((track) => ({
        url: new URL(track.file, embedUrl).toString(),
        lang: track.label,
        default: track.default ?? false
      }))
    };
  }
  /**
   * Extracts only the literal fields needed from a remote player configuration.
   * The input is untrusted JavaScript-like text from an embed response and must
   * never be evaluated or passed to a JavaScript runtime.
   */
  parsePlayerConfig(source) {
    const videoUrl = this.extractStringProperty(source, "videoUrl");
    if (!videoUrl) {
      throw new Error("Player configuration does not contain a literal videoUrl");
    }
    const tracksSource = source.match(/\btracks\s*:\s*\[([\s\S]*?)\]/)?.[1];
    const tracks = [];
    if (tracksSource) {
      for (const trackMatch of tracksSource.matchAll(/{([\s\S]*?)}/g)) {
        const label = this.extractStringProperty(trackMatch[1], "label");
        const file = this.extractStringProperty(trackMatch[1], "file");
        if (!label || !file) continue;
        tracks.push({
          label,
          file,
          default: /\bdefault\s*:\s*true\b/.test(trackMatch[1])
        });
      }
    }
    return { videoUrl, tracks };
  }
  extractStringProperty(source, property) {
    const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = source.match(new RegExp(`\\b${escapedProperty}\\s*:\\s*(["'])((?:\\\\.|(?!\\1)[\\s\\S])*)\\1`));
    if (!match) return null;
    return match[2].replace(/\\(u[\da-fA-F]{4}|x[\da-fA-F]{2}|n|r|t|b|f|v|0|\\|"|')/g, (_full, escape) => {
      if (escape.startsWith("u")) return String.fromCharCode(Number.parseInt(escape.slice(1), 16));
      if (escape.startsWith("x")) return String.fromCharCode(Number.parseInt(escape.slice(1), 16));
      const simpleEscapes = {
        n: "\n",
        r: "\r",
        t: "	",
        b: "\b",
        f: "\f",
        v: "\v",
        "0": "\0",
        "\\": "\\",
        '"': '"',
        "'": "'"
      };
      return simpleEscapes[escape] ?? escape;
    });
  }
};

// src/provider/anime/anidb.ts
import * as cheerio7 from "cheerio";
var AniDB = class extends AnimeParser {
  constructor(baseUrl = "https://anidb.app", options = {
    browser: "okhttp4",
    rateLimit: {
      concurrency: 1,
      intervalMs: 1e3,
      requestsPerInterval: 1
    }
  }) {
    super(baseUrl, options);
    this.baseUrl = baseUrl;
  }
  async fetchAtoZLists(page = 1) {
    try {
      const finalUrl = page > 1 ? `az?page=${page}` : `az`;
      const response = await this.client.fetch(`${this.baseUrl}/${finalUrl}`, { method: "GET" });
      if (!response.ok) {
        return {
          hasNextPage: false,
          currentPage: 0,
          lastPage: 0,
          data: [],
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.text();
      return this.parseSearchResults(cheerio7.load(result));
    } catch (error) {
      return {
        hasNextPage: false,
        currentPage: 0,
        lastPage: 0,
        data: [],
        error: error instanceof Error ? error.message : "Unknown err",
        status: 500
      };
    }
  }
  /**
   * Searches for anime by keyword.
   *
   * @param query Search keyword
   * @param page page number
   * @returns Search results with anime list
   */
  async search(query, page = 1) {
    if (!query) {
      return { hasNextPage: false, currentPage: 0, lastPage: 0, data: [], error: this.formatHttpError(400), status: 400 };
    }
    try {
      const finalUrl = page > 1 ? `browse?q=${query}&page=${page}` : `browse?q=${query}`;
      const response = await this.client.fetch(`${this.baseUrl}/${finalUrl}`, {
        method: "GET"
      });
      if (!response.ok) {
        return {
          hasNextPage: false,
          currentPage: 0,
          lastPage: 0,
          data: [],
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.text();
      return this.parseSearchResults(cheerio7.load(result));
    } catch (error) {
      return {
        data: [],
        hasNextPage: false,
        currentPage: 0,
        lastPage: 0,
        error: error instanceof Error ? error.message : "Unknown err",
        status: 500
      };
    }
  }
  async fetchAnimeInfo(id) {
    if (!id) {
      return {
        data: null,
        error: this.formatHttpError(400),
        status: 400
      };
    }
    try {
      const response = await this.client.fetch(`${this.baseUrl}/anime/${id}`, {
        method: "GET"
      });
      if (!response.ok) {
        return {
          data: null,
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.text();
      return this.parseAnimeInfo(cheerio7.load(result));
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Unknown err",
        status: 500
      };
    }
  }
  async fetchEpisodes(id) {
    if (!id) {
      return {
        data: [],
        error: this.formatHttpError(400),
        status: 400
      };
    }
    const numericId = id.split("-").at(-1);
    try {
      const response = await this.client.fetch(`${this.baseUrl}/api/frontend/anime/${numericId}/episodes`, {
        method: "GET"
        // headers: {},
      });
      if (!response.ok) {
        return {
          data: [],
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      const episodes = result.episodes.map((item) => ({
        episodeId: item.id,
        episodeNumber: item.number,
        isFiller: item.filler
      }));
      const providerEpisodes = episodes.filter((item) => (item.episodeNumber ?? 0) >= 0).sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0)).map((item, index) => ({
        episodeId: item.episodeId,
        episodeNumber: index + 1,
        title: item.title ?? null
      }));
      return {
        data: providerEpisodes
      };
    } catch (error) {
      return {
        data: [],
        error: error instanceof Error ? error.message : "Unknown err",
        status: 500
      };
    }
  }
  async fetchServers(episodeId) {
    if (!episodeId) {
      return {
        data: null,
        error: this.formatHttpError(400),
        status: 400
      };
    }
    try {
      const response = await this.client.fetch(`${this.baseUrl}/api/frontend/episode/${episodeId}/languages`, {
        method: "GET"
      });
      if (!response.ok) {
        return {
          data: null,
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      const servers = {
        sub: [],
        dub: [],
        raw: [],
        episodeNumber: null
      };
      if (result && Array.isArray(result.languages)) {
        result.languages.forEach((lang) => {
          const serverData = {
            serverId: lang.embed_url || null,
            serverName: lang.name,
            mediaId: null
          };
          if (lang.code?.toLowerCase() === "eng") {
            servers.dub.push(serverData);
          } else {
            servers.sub.push(serverData);
          }
        });
      }
      return {
        data: servers
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Unknown err",
        status: 500
      };
    }
  }
  async fetchSources(episodeId, version = "sub") {
    if (!episodeId) {
      return {
        headers: { Referer: null },
        data: null,
        error: "Missing required params: valid episodeId!",
        status: 400
      };
    }
    try {
      const serverData = await this.fetchServers(episodeId);
      if (serverData.error || serverData.data === null) {
        return {
          headers: { Referer: null },
          data: null,
          error: serverData.error,
          status: serverData.status
        };
      }
      const serverId = this.findServerIds(serverData.data, version);
      const response = await this.client.fetch(`${serverId.serverId}`, {
        method: "GET"
      });
      if (!response.ok) {
        return {
          headers: { Referer: null },
          data: null,
          error: response.statusText,
          status: response.status
        };
      }
      const embed = new URL(serverId.serverId);
      const result = await response.text();
      const sources = this.parseSources(cheerio7.load(result));
      return {
        headers: { Referer: `${embed.origin}/` },
        data: sources
      };
    } catch (error) {
      return {
        headers: { Referer: null },
        data: null,
        error: error instanceof Error ? error.message : "Unknown Error",
        status: 500
      };
    }
  }
  /**
   * Parses search  results from a Cheerio instance.
   * Extracts anime  from the provided HTML.
   * @param $ CheerioAPI instance
   * @returns An array containing an array of search results
   */
  parseSearchResults($) {
    const selector = " div.anime-grid > a";
    const result = [];
    $(selector).each((_, element) => {
      result.push({
        id: $(element).attr("href")?.split("/").at(-1) || null,
        name: $(element).attr("title") || null,
        posterImage: $(element).find("div > img").attr("src") || null,
        romaji: null,
        type: $(element).find("span.badge.badge-orange").text().trim() || null
      });
    });
    const pageSpans = $(".text-muted .font-semibold");
    const currentPage = parseInt($(pageSpans.get(0)).text().trim(), 10);
    const lastPage = parseInt($(pageSpans.get(1)).text().trim(), 10);
    const hasNextPage = currentPage < lastPage;
    if (Array.isArray(result) && result.length === 0) {
      return { data: [], error: "No results found", status: 404, hasNextPage: false, currentPage: 0, lastPage: 0 };
    }
    return { hasNextPage, currentPage, lastPage, data: result };
  }
  /**
   * Parses detailed anime information from the watch/info page.
   * @param $ Cheerio instance
   * @returns An object  containing anime info results
   */
  parseAnimeInfo($) {
    const externalLinks = {
      mal: $('a[href*="myanimelist.net"]').attr("href") || null,
      anilist: $('a[href*="anilist.co"]').attr("href") || null,
      anidb: $('a[href*="anidb.net"]').attr("href") || null,
      kitsu: $('a[href*="kitsu.app"]').attr("href") || null
    };
    const info = {
      id: $('link[rel="canonical"]').attr("href")?.split("/").at(-1) || null,
      name: $("h1").first().text().trim() || null,
      romaji: $("p.text-sm.text-muted").first().text().trim() || null,
      posterImage: $(".relative.w-full.overflow-hidden img").first().attr("src") || null,
      synopsis: $("h2").filter((_, el) => $(el).text().trim() === "Synopsis").parent().find("p").text().replace(/\s+/g, " ").trim() || null,
      genre: $(".filter-chip").map((_, el) => $(el).text().trim()).get(),
      type: $('dt:contains("Type")').next("dd").text().trim() || null,
      status: $('dt:contains("Status")').next("dd").text().trim() || null,
      premiered: $('dt:contains("Season")').next("dd").text().trim() || null,
      releaseDate: $('dt:contains("Aired")').next("dd").text().trim() || null,
      duration: $('dt:contains("Duration")').next("dd").text().trim() || null,
      score: parseFloat(
        $('dt:contains("Score")').next("dd").text().replace(/[^\d.]/g, "")
      ) || null,
      studios: [$('dt:contains("Studios")').next("dd").text().trim()].filter(Boolean),
      producers: [],
      totalEpisodes: null,
      malId: externalLinks.mal?.match(/anime\/(\d+)/)?.[1] || null,
      anilistId: externalLinks.anilist?.match(/anime\/(\d+)/)?.[1] || null,
      anidbId: externalLinks.anidb?.match(/anime\/(\d+)/)?.[1] || null,
      kitsuId: externalLinks.kitsu?.match(/anime\/(\d+)/)?.[1] || null,
      externalLinks,
      relations: this.parseRelations($)
    };
    return {
      data: info
    };
  }
  parseRelations($) {
    const relations = [];
    $('[x-show*="activeRel"]').each((_, section) => {
      const relationType = $(section).attr("x-show")?.match(/activeRel === '([^']+)'/)?.[1];
      if (!relationType) return;
      $(section).find("a.anime-card").each((_2, card) => {
        const href = $(card).attr("href") || "";
        relations.push({
          id: href.split("/").at(-1) || null,
          name: $(card).find("p").last().text().trim(),
          poster: $(card).find("img").attr("src") || null,
          type: $(card).find(".badge-orange").first().text().trim() || null,
          score: parseFloat(
            $(card).find(".badge-gray").text().replace(/[^\d.]/g, "")
          ) || null,
          relationType
        });
      });
    });
    return relations;
  }
  /**
   * Finds available server IDs for a specific audio category from the parsed server data.
   * @private
   * @param servers - The parsed streaming server information.
   * @param {ISubOrDub} category - The audio category to filter servers for ('sub', 'dub', or 'raw').
   * @returns {Array<{serverId: string; serverName: string; downloadId: string | null}>} An array of server objects with IDs and download information.
   */
  findServerIds(servers, category) {
    const availableVersions = [];
    if (servers.sub?.length > 0) availableVersions.push("sub");
    if (servers.dub?.length > 0) availableVersions.push("dub");
    if (servers.raw?.length > 0) availableVersions.push("raw");
    if (!servers[category] || servers[category].length === 0) {
      const suggestionMessage = availableVersions.length > 0 ? ` Available versions: ${availableVersions.join(" or ")}.` : " No servers available in any version right now.";
      throw new Error(`Version '${category}' has no servers.${suggestionMessage}`);
    }
    const server = servers[category][0];
    return {
      serverId: server.serverId,
      serverName: server.serverName
    };
  }
  parseSources($) {
    const extractedData = {
      sources: []
    };
    $("script").each((_, element) => {
      const scriptContent = $(element).html();
      if (scriptContent && scriptContent.includes("sources:")) {
        const regex = /sources:\s*(\[\s*\{[\s\S]*?\}\s*\])/;
        const match = scriptContent.match(regex);
        if (match && match[1]) {
          const rawArrayString = match[1];
          const itemRegex = /file:\s*'([^']+)',\s*type:\s*'([^']+)'/g;
          let itemMatch;
          while ((itemMatch = itemRegex.exec(rawArrayString)) !== null) {
            extractedData.sources.push({
              url: itemMatch[1],
              isM3u8: itemMatch[2] === "hls",
              type: itemMatch[2]
            });
          }
          return false;
        }
      }
    });
    return extractedData;
  }
};

// src/models/anime-meta.ts
import { distance } from "fastest-levenshtein";

// src/provider/anime/animeheaven.ts
import * as cheerio8 from "cheerio";
var AnimeHeaven = class extends AnimeParser {
  constructor(baseUrl = "https://animeheaven.me", options = {}) {
    super(baseUrl, options);
    this.baseUrl = baseUrl;
  }
  async search(query) {
    if (!query) {
      return { data: [], error: this.formatHttpError(400), status: 400 };
    }
    try {
      const response = await fetch(`${this.baseUrl}/fastsearch.php?xhr=1&s=${decodeURIComponent(query)}`, {
        method: "GET"
      });
      if (!response.ok) {
        return {
          data: [],
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.text();
      return this.parseSearchResults(cheerio8.load(result));
    } catch (error) {
      return {
        data: [],
        error: error instanceof Error ? error.message : "Unknown err",
        status: 500
      };
    }
  }
  async fetchAnimeInfo(id) {
    if (!id) {
      return { data: null, providerEpisodes: [], error: this.formatHttpError(400), status: 400 };
    }
    try {
      const response = await this.client.fetch(`${this.baseUrl}/anime.php?${id}`, { method: "GET" });
      if (!response.ok) {
        return { data: null, providerEpisodes: [], error: response.statusText, status: response.status };
      }
      const result = await response.text();
      return this.parseAnimeinfo(cheerio8.load(result));
    } catch (error) {
      return {
        data: null,
        providerEpisodes: [],
        error: error instanceof Error ? error.message : "Unknown err",
        status: 500
      };
    }
  }
  async fetchSources(episodeId) {
    if (!episodeId) {
      return {
        headers: { Referer: null },
        data: null,
        error: "Missing required params: valid episodeId!",
        status: 400
      };
    }
    try {
      const id = episodeId.split("-$tk$");
      const key = id.at(0);
      const referer = id.at(-1);
      const response = await this.client.fetch(`${this.baseUrl}/gate.php`, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          Referer: `https://animeheaven.me/anime.php?${referer}`,
          Cookie: `key=${key}`,
          // new stuff to force fresh data
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0"
        }
      });
      if (!response.ok) {
        return {
          headers: { Referer: null },
          data: null,
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.text();
      return this.parseSources(cheerio8.load(result));
    } catch (error) {
      return {
        headers: { Referer: null },
        data: null,
        error: error instanceof Error ? error.message : "Unknown err",
        status: 500
      };
    }
  }
  parseSources($) {
    const extractedData = {
      sources: []
    };
    $("div.info2.bc1 > video > source").each((_, element) => {
      const url = $(element).attr("src");
      if (!url || url.includes("error")) return;
      extractedData.sources.push({
        url,
        isM3u8: url.includes("m3u8"),
        type: $(element).attr("type") || null
      });
    });
    return {
      headers: { Referer: `${this.baseUrl}/` },
      data: extractedData
    };
  }
  parseAnimeinfo($) {
    const animeinfo = {
      id: $('meta[property="og:url"]').attr("content")?.split("?")[1] || null,
      name: $("div.infotitle.c").text().trim() || null,
      posterImage: $("div.infoimg > img.posterimg").attr("src") || null,
      synopsis: $("div.infodes.c").text().trim() || null,
      type: null,
      releaseDate: $("div.infoyear.c > div.inline.c2").eq(1).text().trim() || null,
      totalEpisodes: Number($("div.infoyear.c > div.inline.c2").eq(0).text().trim()) || null,
      genres: $("div.infotags.c a div.boxitem").map((_, el) => $(el).text().trim()).get()
    };
    const episodes = $("div.boldtext  a[id]").map((_, el) => {
      const episodeId = $(el).attr("id");
      const episodeNumber = Number($(el).find(".watch2").first().text().trim());
      return episodeId && !Number.isNaN(episodeNumber) ? {
        episodeId: `${episodeId}-$tk$-${animeinfo.id}`,
        episodeNumber
      } : null;
    }).get().reverse();
    return {
      data: animeinfo,
      providerEpisodes: episodes
    };
  }
  parseSearchResults($) {
    const selector = "a";
    const results = [];
    $(selector).each((_, element) => {
      results.push({
        id: $(element).attr("href")?.split("/").at(-1)?.replace("anime.php?", "").trim() || null,
        name: $(element).find("div.fastname").text().trim() || null,
        posterImage: $(element).find("img.coverimg").attr("src") ? `${this.baseUrl}${$(element).find("img.coverimg").attr("src")}` : null
      });
    });
    return { data: results };
  }
};

// src/provider/meta/kitsu.ts
var Kitsu = class extends BaseClass {
  baseUrl;
  constructor(baseUrl = "https://kitsu.io/api/edge", options = { browser: "okhttp4" }) {
    super(options);
    this.baseUrl = baseUrl;
  }
  async search(query) {
    try {
      const response = await this.client.fetch(`${this.baseUrl}/anime?filter[text]=${query}`, {
        method: "GET"
      });
      if (!response.ok) {
        return {
          error: response.statusText,
          data: [],
          status: response.status
        };
      }
      const result = await response.json();
      const data = result.data.map((item) => {
        const a = item.attributes;
        return {
          kitsuId: Number(item.id),
          isAdult: a.nsfw,
          slug: a.slug,
          image: a.posterImage?.original ?? a.posterImage?.large ?? a.posterImage?.medium ?? a.posterImage?.small ?? a.posterImage?.tiny,
          bannerImage: a.coverImage?.original ?? a.coverImage?.large ?? a.coverImage?.small ?? a.coverImage?.tiny,
          title: {
            romaji: a.titles?.en_jp ?? a.canonicalTitle ?? null,
            english: a.titles?.en ?? null,
            native: a.titles?.ja_jp ?? null
          },
          trailer: a.youtubeVideoId ? {
            id: a.youtubeVideoId,
            site: "youtube"
          } : null,
          format: a.showType ?? a.subtype,
          synonyms: a.abbreviatedTitles ?? [],
          status: a.status,
          releaseDate: a.startDate,
          endDate: a.endDate,
          duration: a.episodeLength,
          episodes: a.episodeCount,
          score: a.averageRating ? Number(a.averageRating) : null,
          synopsis: a.synopsis ?? a.description
        };
      });
      return {
        data
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown Err",
        data: [],
        status: 500
      };
    }
  }
  async searchSlug(query) {
    try {
      const response = await this.client.fetch(`${this.baseUrl}/anime?filter[slug]=${query}`, {
        method: "GET"
      });
      if (!response.ok) {
        return {
          error: response.statusText,
          data: [],
          status: response.status
        };
      }
      const result = await response.json();
      const data = result.data.map((item) => {
        const a = item.attributes;
        return {
          kitsuId: Number(item.id),
          isAdult: a.nsfw,
          slug: a.slug,
          image: a.posterImage?.original ?? a.posterImage?.large ?? a.posterImage?.medium ?? a.posterImage?.small ?? a.posterImage?.tiny,
          bannerImage: a.coverImage?.original ?? a.coverImage?.large ?? a.coverImage?.small ?? a.coverImage?.tiny,
          title: {
            romaji: a.titles?.en_jp ?? a.canonicalTitle ?? null,
            english: a.titles?.en ?? null,
            native: a.titles?.ja_jp ?? null
          },
          trailer: a.youtubeVideoId ? {
            id: a.youtubeVideoId,
            site: "youtube"
          } : null,
          format: a.showType ?? a.subtype,
          synonyms: a.abbreviatedTitles ?? [],
          status: a.status,
          releaseDate: a.startDate,
          endDate: a.endDate,
          duration: a.episodeLength,
          episodes: a.episodeCount,
          score: a.averageRating ? Number(a.averageRating) : null,
          synopsis: a.synopsis ?? a.description
        };
      });
      return {
        data
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown Err",
        data: [],
        status: 500
      };
    }
  }
  async fetchEpisodes(id) {
    try {
      const response = await this.client.fetch(`${this.baseUrl}/anime/${id}/episodes`, { method: "GET" });
      if (!response.ok) {
        return {
          error: response.statusText,
          data: [],
          status: response.status
        };
      }
      const result = await response.json();
      const data = result.data.map((item) => {
        const a = item.attributes;
        return {
          // episodeId: Number(item.id), // kitsu episodeId
          episodeId: Number(id),
          thumbnail: a.thumbnail?.original,
          title: {
            romaji: a.titles?.en_jp ?? null,
            english: a.titles?.en ?? a.canonicalTitle ?? null,
            native: a.titles?.ja_jp ?? null
          },
          airDate: a.airdate,
          seasonNumber: a.seasonNumber,
          episodeNumber: a.number,
          relativeNumber: a.relativeNumber ?? null,
          synopsis: a.synopsis ?? a.description
        };
      });
      return { data };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown Err",
        data: [],
        status: 500
      };
    }
  }
  async fetchMapping(id) {
    try {
      const response = await this.client.fetch(
        `${this.baseUrl}/mappings?filter[externalSite]=anilist/anime&filter[externalId]=${id}&include=item`,
        { method: "GET" }
      );
      if (!response.ok) {
        return {
          error: response.statusText,
          data: null,
          status: response.status
        };
      }
      const result = await response.json();
      const kitsuId = result.data?.[0]?.relationships?.item?.data?.id;
      const anime = result.included?.find((item) => item.type === "anime" && item.id === kitsuId);
      return {
        data: {
          id: kitsuId,
          provider: "Kitsu",
          name: anime?.attributes?.canonicalTitle,
          romaji: anime?.attributes?.titles?.en_jp ?? anime?.attributes?.canonicalTitle,
          score: null
        }
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown Err",
        data: null,
        status: 500
      };
    }
  }
};

// src/models/anime-meta.ts
var BaseAnimeMeta = class extends BaseClass {
  anizone;
  anikoto;
  anibd;
  anidb;
  animeheaven;
  kitsu;
  constructor(options = {
    browser: "okhttp4",
    http3: false
  }) {
    super(options);
    this.anikoto = new Anikoto();
    this.anizone = new Anizone();
    this.anibd = new AniBD();
    this.anidb = new AniDB();
    this.animeheaven = new AnimeHeaven();
    this.kitsu = new Kitsu();
  }
  findBestMatch(target, candidates) {
    if (candidates.length === 0) return null;
    let bestMatch = null;
    let bestDistance = Number.MAX_SAFE_INTEGER;
    for (const candidate of candidates) {
      if (target.english && candidate.name) {
        const d = distance(target.english.toLowerCase(), candidate.name.toLowerCase());
        if (d < bestDistance) {
          bestDistance = d;
          bestMatch = candidate;
        }
      }
      if (target.romaji && candidate.romaji) {
        const d = distance(target.romaji.toLowerCase(), candidate.romaji.toLowerCase());
        if (d < bestDistance) {
          bestDistance = d;
          bestMatch = candidate;
        }
      }
    }
    return bestMatch;
  }
  createTitleSlugV2(text) {
    return text.toLowerCase().replace(/:/g, "-").replace(/;/g, "-").replace(/[\s_-]+/g, "-").replace(/\s+/g, "-").trim();
  }
  // ------------------------
  formatAnizipData(data) {
    if (!data || !data.episodes) {
      return { animeTitles: {}, mappings: {}, episodes: [] };
    }
    const titles = {
      english: data.titles?.en || null,
      japanese: data.titles?.ja || null,
      german: data.titles?.de || null,
      romanized: data.titles?.["x-jat"] || data.titles?.["x-zht"] || data.titles?.["x-kot"] || null,
      // i shouldnt be putting x-zht here cause its chinese
      traditionalChinese: data.titles?.["zh-Hant"] || null,
      simplifiedChinese: data.titles?.["zh-Hans"] || null
    };
    const mappings = {
      animePlanetId: data.mappings?.animeplanet_id || null,
      kitsuId: data.mappings?.kitsu_id || null,
      malId: data.mappings?.mal_id || null,
      anilistId: data.mappings?.anilist_id || null,
      anisearchId: data.mappings?.anisearch_id || null,
      anidbId: data.mappings?.anidb_id || null,
      notifymoeId: data.mappings?.notifymoe_id || null,
      livechartId: data.mappings?.livechart_id || null,
      imdbId: data.mappings?.imdb_id || null,
      themoviedbId: data.mappings?.themoviedb_id || null
    };
    const episodeKeys = Object.keys(data.episodes);
    const todayStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const transformedEpisodes = episodeKeys.filter((key) => /^\d+$/.test(key)).map((key) => {
      const episode = data.episodes[key];
      const rawAirDate = episode.airDate || episode.airdate;
      return {
        episodeAnizipNumber: Number(episode.episode || episode.episodeNumber) || null,
        title: {
          english: episode.title?.en || episode.title?.["x-jat"] || null,
          japanese: episode.title?.ja || null,
          german: episode.title?.de || null,
          romanizedJapanese: episode.title?.["x-jat"] || null
        },
        airDate: rawAirDate,
        runtime: episode.runtime || episode.length,
        overview: episode.overview || episode.summary,
        image: episode.image || null,
        rating: episode.rating ? Number(episode.rating) : null,
        aired: rawAirDate ? rawAirDate.slice(0, 10) <= todayStr : false
      };
    }).filter((episode) => episode.aired === true);
    const images = data.images || null;
    return {
      images,
      titles,
      mappings,
      episodes: transformedEpisodes
    };
  }
  anilistAnizip(id) {
    return this.fetchAnizipByMapping("anilist_id", id);
  }
  malAnizip(id) {
    return this.fetchAnizipByMapping("mal_id", id);
  }
  mergeEpisodeData(providerEp, aniZipEp, tmdb, provider) {
    const episodeNumber = providerEp.episodeNumber || tmdb?.absoluteEpisodeNumber || aniZipEp?.episodeAnizipNumber || null;
    const rating = tmdb?.rating || aniZipEp?.rating || null;
    const aired = aniZipEp?.aired || null;
    const episodeId = providerEp?.episodeId || providerEp.id || null;
    const title = tmdb?.title || aniZipEp?.title?.english || aniZipEp?.title?.romanizedJapanese || providerEp?.title || null;
    const overview = tmdb?.summary || aniZipEp?.overview || null;
    const thumbnail = tmdb?.images?.large || tmdb?.images?.original || providerEp?.teaser || providerEp?.thumbnail || aniZipEp?.image || null;
    const airDate = tmdb?.airDate || providerEp?.airDate || aniZipEp?.airDate || null;
    const hasDub = providerEp?.hasDub ?? null;
    const hasSub = providerEp?.hasSub ?? null;
    return {
      episodeNumber,
      episodeId,
      title,
      rating,
      aired,
      airDate,
      overview,
      thumbnail,
      provider,
      hasDub,
      hasSub
      // hasRaw,
    };
  }
  async fetchAnizipByMapping(type, id) {
    if (!id) return { error: `Missing required param: ${type}`, data: null };
    try {
      const response = await this.client.fetch(`https://api.ani.zip/mappings?${type}=${id}`, { method: "GET" });
      if (!response.ok) throw new Error(response.statusText);
      const result = await response.json();
      const results = this.formatAnizipData(result);
      return {
        images: results.images,
        titles: results.titles,
        episodes: results.episodes,
        mapping: results.mappings
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }
};

// src/utils/queries.ts
var fetchByIdQuery = `query ($id: Int ,$type: MediaType, $asHtml:Boolean = true) { 
  Media (id: $id, type:$type) { 
    id
    idMal
    title {
      romaji
      english
      native
      userPreferred
    }
    type
    format
    status
    isAdult
    countryOfOrigin
    seasonYear
    synonyms
    description(asHtml: $asHtml)
      startDate {
        year
        month
        day
      }
      endDate {
        year
        month
        day
      }
    season
    meanScore
    averageScore
    duration
    episodes
    coverImage {
      extraLarge
      large
      medium
      color
    }
    
    trailer {
      id
      site
      thumbnail
    }
  
    genres
    bannerImage
    studios {
        nodes {
          name
        }
    }
  }
}`;
var topQuery = `query Query($page: Int, $perPage: Int, $type: MediaType, $format: MediaFormat, $status: MediaStatus, $isAdult: Boolean, $sort: [MediaSort]) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      total
      perPage
      currentPage
      lastPage
      hasNextPage
    }
    media(type: $type, format: $format, status: $status, isAdult: $isAdult, sort: $sort) {
      id
      idMal
      title {
        romaji
        english
        native
        userPreferred
      }
      type
      format
      status
      episodes
      duration
      season
      genres
      studios {
        nodes {
          name
        }
     }
      description
      startDate {
        year
        month
        day
      }
      endDate {
        year
        month
        day
      }
      trailer {
        id
        site
        thumbnail
      }
      bannerImage
      coverImage {
        extraLarge
        large
        medium
        color
      }
      averageScore
      meanScore
      
    }
    
  }
}`;
var popularAnimeQuery = `query Query($page: Int, $perPage: Int, $type: MediaType, $format: MediaFormat, $isAdult: Boolean, $sort: [MediaSort]) {
  Page(page: $page, perPage: $perPage) {
  pageInfo {
      total
      perPage
      currentPage
      lastPage
      hasNextPage
    }
    media(type: $type, format: $format, isAdult: $isAdult, sort: $sort) {
      id
      idMal
      title {
        romaji
        english
        native
        userPreferred
      }
      type
      format
      status
      episodes
      duration
      season
      genres
      studios {
        nodes {
          name
        }
     }
      description
      startDate {
        year
        month
        day
      }
      endDate {
        year
        month
        day
      }
      trailer {
        id
        site
        thumbnail
      }
      bannerImage
      coverImage {
        extraLarge
        large
        medium
        color
      }
      averageScore
      meanScore
    
    }
    
  }
}`;
var seasonQuery = `query Query($page: Int, $perPage: Int, $type: MediaType, $format: MediaFormat, $isAdult: Boolean, $season: MediaSeason, $seasonYear: Int, $sort: [MediaSort]) {
  Page(page: $page, perPage: $perPage) {
   pageInfo {
      total
      perPage
      currentPage
      lastPage
      hasNextPage
    }
    media(type: $type, format: $format, isAdult: $isAdult, season: $season, seasonYear: $seasonYear, sort: $sort) {
      id
      idMal
      title {
        romaji
        english
        native
        userPreferred
      }
      type
      format
      status
      episodes
      duration
      season
      genres
      description
      startDate {
        year
        month
        day
      }
      endDate {
        year
        month
        day
      }
      trailer {
        id
        site
        thumbnail
      }
       format
      bannerImage
      coverImage {
        extraLarge
        large
        medium
        color
      }
      averageScore
      meanScore
      studios {
        nodes {
          name
        }
      }
    }
  }
}`;
var characterQuery = `query Media($mediaId: Int, $sort: [CharacterSort], $voiceActorsSort2: [StaffSort]) {
  Media(id: $mediaId) {
    id
    idMal
    title {
      romaji
      english
      native
    }
    characters(sort: $sort) {
      edges {
        role
        node {
          id
          name {
            full
          }
          image {
            large
            medium
          }
        }
        voiceActors(sort: $voiceActorsSort2) {
          name {
            full
          }
          image {
            large
            medium
          }
          languageV2
        }
      }
    }
  }
}`;
var mediaTrendQuery = `query Query($page: Int, $perPage: Int, $type: MediaType, $format: MediaFormat) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      total
      perPage
      currentPage
      lastPage
      hasNextPage
    }
    media(type:$type,format: $format, sort:TRENDING_DESC, isAdult: false) {
      id
      idMal
      title {
        romaji
        english
        native
        userPreferred
      }
      studios {
        nodes {
          name
        }
      }
      status
      description
      startDate {
        year
        month
        day
      }
      endDate {
        year
        month
        day
      }
      season
      episodes 
      averageScore
      meanScore
      popularity
      bannerImage
      coverImage {
        extraLarge
        large
        medium
        color
      }
      format
      genres
    }
  }
}`;
var relatedQuery = `query Media($mediaId: Int, $type: MediaType) {
  Media(id: $mediaId, type: $type) {
    relations {
      edges {
        node {
          id
          idMal
          title {
            romaji
            english
            native
            userPreferred
          }
          countryOfOrigin
          seasonYear
          synonyms
          type
          bannerImage
          coverImage {
            extraLarge
            large
            medium
            color
          }
          averageScore
          meanScore
        }
      }
    }
  }
}`;
var mediaAiringSchedule = `query AiringSchedule($mediaId: Int) {
  AiringSchedule(mediaId: $mediaId) {
    media {
      bannerImage
      averageScore
      coverImage {
        color
        extraLarge
        large
        medium
      }
       startDate {
        year
        month
        day
      }

      endDate {
        day
        month
        year
      }
      format
      idMal
      nextAiringEpisode {
        airingAt
        episode
        id
        timeUntilAiring
      }
      duration
      title {
        english
        native
        romaji
        userPreferred
      }
      id
      status
      popularity
    }
  }
}`;
var fetchAiringByDate = `query Page($page: Int, $perPage: Int, $airingAtLesser: Int, $airingAtGreater: Int) {
  Page(page: $page, perPage: $perPage) {
    airingSchedules(airingAt_lesser: $airingAtLesser, airingAt_greater: $airingAtGreater) {
      media {
        bannerImage
        id
        idMal
         title {
            romaji
            english
            native
            userPreferred
          }
        averageScore
        coverImage {
          color
          extraLarge
          large
          medium
        }
        description
        duration
        type
        status
        season
        startDate {
          day
          month
          year
        }
        endDate {
          day
          month
          year
        }
        popularity
        format
        genres
        nextAiringEpisode {
          episode
          id
          airingAt
        }
        episodes
        meanScore
        countryOfOrigin
      }
    }
    pageInfo {
      currentPage
      hasNextPage
      lastPage
      perPage
    }
  }
}`;
var searchQueryWithSort = `query Query($page: Int, $perPage: Int, $search: String, $type: MediaType, $isAdult: Boolean) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      total
      perPage
      currentPage
      lastPage
      hasNextPage
    }
    media(search: $search, type: $type, isAdult: $isAdult, sort: SEARCH_MATCH) {
      id
      idMal
      episodes
      duration
      season
      title {
        romaji
        english
        native
        userPreferred
      }
      type
      format
      genres
      status
      description
      startDate {
        year
        month
        day
      }
      endDate {
        year
        month
        day
      }
      trailer {
        id
        site
        thumbnail
      }
      bannerImage
      coverImage {
        extraLarge
        large
        medium
        color
      } 
      averageScore
      meanScore
      studios {
        nodes {
          name
        }
      }
    }
  }
}`;

// src/provider/meta/anilist.ts
var Anilist = class extends BaseAnimeMeta {
  baseUrl = "https://graphql.anilist.co";
  workerUrl = "https://api.kenjitsu.workers.dev";
  constructor(options = {
    rateLimit: {
      intervalMs: 6e4,
      requestsPerInterval: 30
    }
  }) {
    super(options);
  }
  /**
   * Maps an Anilist anime ID to the corresponding Kitsu provider ID.
   *
   * @param anilistId - Anilist media ID (required)
   * @returns Provider mapping result including Anilist metadata and provider-specific ID (if found)
   */
  async fetchKitsuProviderId(anilistId) {
    if (!anilistId) {
      return {
        error: "Invalid or missing required parameter: anilistId!",
        data: null,
        provider: null,
        status: 400
      };
    }
    try {
      const [anilist, kitsu] = await Promise.allSettled([
        this.fetchInfo(anilistId, "ANIME"),
        this.kitsu.fetchMapping(anilistId)
      ]);
      if (anilist.status === "rejected") {
        return {
          data: null,
          provider: null,
          error: anilist.reason,
          status: 500
        };
      }
      if (kitsu.status === "rejected") {
        return {
          data: null,
          provider: null,
          error: kitsu.reason,
          status: 500
        };
      }
      const anilistData = anilist.value.data;
      if (!kitsu.value.data) {
        return {
          data: null,
          provider: null,
          error: kitsu.value.error,
          status: kitsu.value.status
        };
      }
      const anizoneResult = kitsu.value.data;
      return {
        data: anilistData,
        provider: anizoneResult
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown error occurred",
        data: null,
        provider: null,
        status: 500
      };
    }
  }
  /**
   * Maps an Anilist anime ID to the corresponding Anizone provider ID.
   *
   * @param anilistId - Anilist media ID (required)
   * @returns Provider mapping result including Anilist metadata and provider-specific ID (if found)
   */
  async fetchAnizoneProviderId(anilistId) {
    if (!anilistId) {
      return {
        error: "Invalid or missing required parameter: anilistId!",
        data: null,
        provider: null,
        status: 400
      };
    }
    try {
      const [anilist, anizone] = await Promise.allSettled([
        this.fetchInfo(anilistId, "ANIME"),
        this.client.fetch(`${this.workerUrl}/api/anime/anilist/${anilistId}?provider=anizone`, {
          method: "GET"
        })
      ]);
      if (anilist.status === "rejected") {
        return {
          data: null,
          provider: null,
          error: anilist.reason,
          status: 500
        };
      }
      const anilistData = anilist.value;
      if (!anilistData.data) {
        return {
          error: anilistData.error,
          data: null,
          provider: null,
          status: anilistData.status
        };
      }
      if (anizone.status === "rejected") {
        return {
          data: null,
          provider: null,
          error: anizone.reason,
          status: 500
        };
      }
      if (anizone.value.ok) {
        const anizoneResult = await anizone.value.json();
        if (anizoneResult?.provider?.id) {
          return {
            data: anilistData.data,
            provider: anizoneResult.provider
          };
        }
      }
      const titles = [anilistData.data.title.romaji, anilistData.data.title.english, anilistData.data.title.native].filter((title) => Boolean(title)).filter((title, index, arr) => arr.indexOf(title) === index);
      let searchResults = null;
      for (const query of titles) {
        const result = await this.anizone.search(query);
        if (result.data.length > 0) {
          searchResults = result;
          break;
        }
      }
      if (!searchResults) {
        return {
          error: "No Anizone search results found.",
          data: null,
          provider: null,
          status: 404
        };
      }
      const match = this.findBestMatch(
        anilistData.data.title,
        searchResults.data.map((item) => ({
          id: item.id,
          name: item.name,
          romaji: item.romaji
        }))
      );
      if (!match) {
        return {
          error: "No matching Anizone entry found.",
          data: null,
          provider: null,
          status: 404
        };
      }
      return {
        data: anilistData.data,
        provider: {
          id: match.id,
          name: match.name,
          romaji: match.romaji,
          provider: "anizone",
          score: null
        }
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown error occurred",
        data: null,
        provider: null,
        status: 500
      };
    }
  }
  /**
   * Maps an Anilist anime ID to the corresponding AniBD provider ID.
   *
   * @param anilistId - Anilist media ID (required)
   * @returns Provider mapping result including Anilist metadata and provider-specific ID (if found)
   */
  async fetchAniBDProviderId(anilistId) {
    if (!anilistId) {
      return {
        error: "Invalid or missing required parameter: anilistId!",
        data: null,
        provider: null,
        status: 400
      };
    }
    try {
      const anilist = await this.fetchInfo(anilistId, "ANIME");
      if (!anilist.data) {
        return {
          error: anilist.error,
          data: null,
          provider: null,
          status: anilist.status
        };
      }
      const searchQueries = [anilist.data.title.romaji, anilist.data.title.english, anilist.data.title.native].filter((title) => Boolean(title)).filter((title, index, array) => array.indexOf(title) === index);
      let anibdResults = null;
      for (const query of searchQueries) {
        const result = await this.anibd.search(query);
        if (result.data.length > 0) {
          anibdResults = result;
          break;
        }
      }
      if (!anibdResults) {
        return {
          error: "No matching AniBD entry found.",
          data: null,
          provider: null,
          status: 404
        };
      }
      const idMatch = anibdResults.data.find((anime) => Number(anime.anilistId) === anilistId);
      if (idMatch) {
        return {
          data: anilist.data,
          provider: {
            id: idMatch.id,
            name: idMatch.name,
            romaji: idMatch.name,
            provider: "anibd",
            score: null
          }
        };
      }
      const titleMatch = this.findBestMatch(
        anilist.data.title,
        anibdResults.data.map((item) => ({
          id: item.id,
          name: item.name,
          romaji: item.name
        }))
      );
      if (!titleMatch) {
        return {
          error: "No matching AniBD entry found.",
          data: null,
          provider: null,
          status: 404
        };
      }
      return {
        data: anilist.data,
        provider: {
          id: titleMatch.id,
          name: titleMatch.name,
          romaji: titleMatch.romaji,
          provider: "anibd",
          score: null
        }
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown error occurred",
        data: null,
        provider: null,
        status: 500
      };
    }
  }
  /**
   * Maps an Anilist anime ID to the corresponding AnimeHeaven provider ID.
   *
   * @param anilistId - Anilist media ID (required)
   * @returns Provider mapping result including Anilist metadata and provider-specific ID (if found)
   */
  async fetchAnimeHeavenProviderId(anilistId) {
    if (!anilistId) {
      return {
        error: "Invalid or missing required parameter: anilistId!",
        data: null,
        provider: null,
        status: 400
      };
    }
    try {
      const anilist = await this.fetchInfo(anilistId, "ANIME");
      if (!anilist.data) {
        return {
          error: anilist.error,
          data: null,
          provider: null,
          status: anilist.status
        };
      }
      const searchQueries = [anilist.data.title.romaji, anilist.data.title.english, anilist.data.title.native].filter((title) => Boolean(title)).filter((title, index, array) => array.indexOf(title) === index);
      let animeheavenResults = null;
      for (const query of searchQueries) {
        const result = await this.animeheaven.search(query);
        if (result.data.length > 0) {
          animeheavenResults = result;
          break;
        }
      }
      if (!animeheavenResults) {
        return {
          error: "No matching AnimeHeaven entry found.",
          data: null,
          provider: null,
          status: 404
        };
      }
      const match = this.findBestMatch(
        anilist.data.title,
        animeheavenResults.data.map((item) => ({
          id: item.id,
          name: item.name,
          romaji: null
        }))
      );
      if (!match) {
        return {
          error: "No matching AnimeHeaven entry found.",
          data: null,
          provider: null,
          status: 404
        };
      }
      return {
        data: anilist.data,
        provider: {
          id: match.id,
          name: match.name,
          romaji: match.romaji,
          provider: "animeheaven",
          score: null
        }
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown error occurred",
        data: null,
        provider: null,
        status: 500
      };
    }
  }
  /**
   * Maps an Anilist anime ID to the corresponding AniDB (animepahe reupload) provider ID.
   *
   * @param anilistId - Anilist media ID (required)
   * @returns Provider mapping result including Anilist metadata and provider-specific ID (if found)
   */
  async fetchAniDBProviderId(anilistId) {
    if (!anilistId) {
      return {
        error: "Invalid or missing required parameter: anilistId!",
        data: null,
        provider: null,
        status: 400
      };
    }
    try {
      const [anilist, anidb] = await Promise.allSettled([
        this.fetchInfo(anilistId, "ANIME"),
        this.client.fetch(`${this.workerUrl}/api/anime/anilist/${anilistId}?provider=anidb`, {
          method: "GET"
        })
      ]);
      if (anilist.status === "rejected") {
        return {
          data: null,
          provider: null,
          error: anilist.reason,
          status: 500
        };
      }
      const anilistData = anilist.value;
      if (!anilistData.data) {
        return {
          error: anilistData.error,
          data: null,
          provider: null,
          status: anilistData.status
        };
      }
      if (anidb.status === "rejected") {
        return {
          data: null,
          provider: null,
          error: anidb.reason,
          status: 500
        };
      }
      if (anidb.value.ok) {
        const anidbResult = await anidb.value.json();
        if (anidbResult?.provider?.id) {
          return {
            data: anilistData.data,
            provider: anidbResult.provider
          };
        }
      }
      const titles = [anilistData.data.title.english, anilistData.data.title.romaji, anilistData.data.title.native].filter((title) => Boolean(title)).filter((title, index, arr) => arr.indexOf(title) === index);
      let searchResults = null;
      for (const query of titles) {
        const result = await this.anidb.search(query);
        if (result.data.length > 0) {
          searchResults = result;
          break;
        }
      }
      if (!searchResults) {
        return {
          error: "No AniDB search results found.",
          data: null,
          provider: null,
          status: 404
        };
      }
      const match = this.findBestMatch(
        anilistData.data.title,
        searchResults.data.map((item) => ({
          id: item.id,
          name: item.name,
          romaji: item.romaji
        }))
      );
      if (!match) {
        return {
          error: "No matching AniDB entry found.",
          data: null,
          provider: null,
          status: 404
        };
      }
      return {
        data: anilistData.data,
        provider: {
          id: match.id,
          name: match.name,
          romaji: match.romaji,
          provider: "anidb",
          score: null
        }
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown error occurred",
        data: null,
        provider: null,
        status: 500
      };
    }
  }
  /**
   * Maps an Anilist anime ID to the corresponding Anikoto provider ID.
   *
   * @param anilistId - Anilist media ID (required)
   * @returns Provider mapping result including Anilist metadata and provider-specific ID (if found)
   */
  async fetchAnikotoProviderId(anilistId) {
    if (!anilistId) {
      return {
        error: "Invalid or missing required parameter: anilistId!",
        data: null,
        provider: null,
        status: 400
      };
    }
    try {
      const [anilist, anikoto] = await Promise.allSettled([
        this.fetchInfo(anilistId, "ANIME"),
        this.client.fetch(`${this.workerUrl}/api/anime/anilist/${anilistId}?provider=anikoto`, {
          method: "GET"
        })
      ]);
      if (anilist.status === "rejected") {
        return {
          data: null,
          provider: null,
          error: anilist.reason,
          status: 500
        };
      }
      const anilistData = anilist.value;
      if (!anilistData.data) {
        return {
          error: "Anime not found on AniList.",
          data: null,
          provider: null,
          status: 404
        };
      }
      if (anikoto.status === "fulfilled" && anikoto.value.ok) {
        const anikotoResult = await anikoto.value.json();
        if (anikotoResult?.provider.id) {
          return {
            data: anilistData.data,
            provider: anikotoResult.provider
          };
        }
      }
      const anizip = await this.anilistAnizip(anilistId);
      const query = anizip.titles?.english || anizip.titles?.romanized;
      const anikotoSearchResults = await this.anikoto.search(query);
      const match = this.findBestMatch(
        anilistData.data.title,
        anikotoSearchResults.data.map((item) => ({
          id: item.id,
          name: item.name,
          romaji: item.romaji
        }))
      );
      if (!match) {
        return {
          error: "No matching entry found.",
          data: null,
          provider: null,
          status: 404
        };
      }
      return {
        data: anilistData.data,
        provider: {
          //@ts-ignore
          id: match.id,
          name: match.name,
          romaji: match.romaji,
          provider: "anikoto",
          score: null
        }
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown error occurred",
        data: null,
        provider: null,
        status: 500
      };
    }
  }
  /**
   * Fetches episode list from Anikoto provider and enriches episodes with Anizip metadata (titles, thumbnails, etc.).
   *
   * @param anilistId - Anilist media ID (required)
   * @returns Enriched episode list from Anizone + Anilist base data
   */
  async fetchAnikotoProviderEpisodes(anilistId) {
    if (!anilistId) {
      return {
        error: "Invalid or missing required parameter: anilistId!",
        data: null,
        providerEpisodes: [],
        provider: null,
        status: 400
      };
    }
    try {
      const [initialResponse, anizip, tmdb] = await Promise.allSettled([
        this.fetchAnikotoProviderId(anilistId),
        this.anilistAnizip(anilistId),
        this.client.fetch(`${this.workerUrl}/api/meta/anilist/${anilistId}?platform=tmdb`, { method: "GET" })
      ]);
      if (initialResponse.status === "rejected") {
        return {
          data: null,
          providerEpisodes: [],
          provider: null,
          error: initialResponse.reason,
          status: 500
        };
      }
      if (anizip.status === "rejected") {
        return {
          data: null,
          providerEpisodes: [],
          provider: null,
          error: anizip.reason,
          status: 500
        };
      }
      const anikotoAnimeId = initialResponse.value.provider?.id;
      const anikotoResult = await this.anikoto.fetchAnimeInfo(anikotoAnimeId);
      const tmdbData = tmdb.status === "fulfilled" ? await tmdb.value.json() : null;
      const tmdbEpisodesList = Array.isArray(tmdbData?.episodes) ? tmdbData.episodes : [];
      const tmdbMap = new Map(
        tmdbEpisodesList.map((item) => [item.absoluteEpisodeNumber || item.absoluteEpisode, item])
      );
      const anizipEpisodes = anizip.value.episodes;
      const aniZipMap = new Map(
        (anizipEpisodes || []).map((item) => [item.episodeAnizipNumber, item])
      );
      const enrichedEpisodes = anikotoResult.providerEpisodes.filter((ep) => typeof ep.episodeNumber === "number" && !isNaN(ep.episodeNumber) && ep.episodeNumber > 0).map((episode) => {
        const epNum = episode.episodeNumber;
        const tmdbEp = tmdbMap.get(epNum);
        const aniZipEp = aniZipMap.get(epNum);
        return this.mergeEpisodeData(episode, aniZipEp, tmdbEp, "anikoto");
      });
      const anilistData = initialResponse.value.data;
      const providerInfo = initialResponse.value.provider;
      return {
        data: anilistData,
        providerEpisodes: enrichedEpisodes,
        provider: providerInfo
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Unknown Error",
        providerEpisodes: [],
        provider: null,
        status: 500
      };
    }
  }
  /**
   * Fetches episode list from Animeheaven provider and enriches episodes with Anizip metadata (titles, thumbnails, etc.).
   *
   * @param anilistId - Anilist media ID (required)
   * @returns Enriched episode list from Anizone + Anilist base data
   */
  async fetchAnimeHeavenProviderEpisodes(anilistId) {
    if (!anilistId) {
      return {
        error: "Invalid or missing required parameter: anilistId!",
        data: null,
        providerEpisodes: [],
        provider: null,
        status: 400
      };
    }
    try {
      const [initialResponse, anizip, tmdb] = await Promise.allSettled([
        this.fetchAnimeHeavenProviderId(anilistId),
        this.anilistAnizip(anilistId),
        this.client.fetch(`${this.workerUrl}/api/meta/anilist/${anilistId}?platform=tmdb`, { method: "GET" })
      ]);
      if (initialResponse.status === "rejected") {
        return {
          data: null,
          providerEpisodes: [],
          provider: null,
          error: initialResponse.reason,
          status: 500
        };
      }
      if (anizip.status === "rejected") {
        return {
          data: null,
          providerEpisodes: [],
          provider: null,
          error: anizip.reason,
          status: 500
        };
      }
      const animeheavenAnimeId = initialResponse.value.provider?.id;
      const animeheavenResult = await this.animeheaven.fetchAnimeInfo(animeheavenAnimeId);
      const tmdbData = tmdb.status === "fulfilled" ? await tmdb.value.json() : null;
      const tmdbEpisodesList = Array.isArray(tmdbData?.episodes) ? tmdbData.episodes : [];
      const tmdbMap = new Map(
        tmdbEpisodesList.map((item) => [item.absoluteEpisodeNumber || item.absoluteEpisode, item])
      );
      const anizipEpisodes = anizip.value.episodes;
      const aniZipMap = new Map(
        (anizipEpisodes || []).map((item) => [item.episodeAnizipNumber, item])
      );
      const enrichedEpisodes = animeheavenResult.providerEpisodes.filter((ep) => typeof ep.episodeNumber === "number" && !isNaN(ep.episodeNumber) && ep.episodeNumber > 0).map((episode) => {
        const epNum = episode.episodeNumber;
        const tmdbEp = tmdbMap.get(epNum);
        const aniZipEp = aniZipMap.get(epNum);
        return this.mergeEpisodeData(episode, aniZipEp, tmdbEp, "animeheaven");
      });
      const anilistData = initialResponse.value.data;
      const providerInfo = initialResponse.value.provider;
      return {
        data: anilistData,
        providerEpisodes: enrichedEpisodes,
        provider: providerInfo
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Unknown Error",
        providerEpisodes: [],
        provider: null,
        status: 500
      };
    }
  }
  /**
   * Fetches episode list from Kitsu provider and enriches episodes with Anizip metadata (titles, thumbnails, etc.).
   *
   * @param anilistId - Anilist media ID (required)
   * @returns Enriched episode list from Anizone + Anilist base data
   */
  async fetchKitsuProviderEpisodes(anilistId) {
    if (!anilistId) {
      return {
        error: "Invalid or missing required parameter: anilistId!",
        data: null,
        providerEpisodes: [],
        provider: null,
        status: 400
      };
    }
    try {
      const [initialResponse, anizip, tmdb] = await Promise.allSettled([
        this.fetchKitsuProviderId(anilistId),
        this.anilistAnizip(anilistId),
        this.client.fetch(`${this.workerUrl}/api/meta/anilist/${anilistId}?platform=tmdb`, { method: "GET" })
      ]);
      if (initialResponse.status === "rejected") {
        return {
          data: null,
          providerEpisodes: [],
          provider: null,
          error: initialResponse.reason,
          status: 500
        };
      }
      if (anizip.status === "rejected") {
        return {
          data: null,
          providerEpisodes: [],
          provider: null,
          error: anizip.reason,
          status: 500
        };
      }
      const tmdbData = tmdb.status === "fulfilled" ? await tmdb.value.json() : null;
      const tmdbEpisodesList = Array.isArray(tmdbData?.episodes) ? tmdbData.episodes : [];
      const tmdbMap = new Map(
        tmdbEpisodesList.map((item) => [item.absoluteEpisodeNumber || item.absoluteEpisode, item])
      );
      const anizipEpisodes = anizip.value.episodes || [];
      const enrichedEpisodes = anizipEpisodes.filter(
        (ep) => typeof ep.episodeAnizipNumber === "number" && !isNaN(ep.episodeAnizipNumber) && ep.episodeAnizipNumber > 0
      ).map((aniZipEp) => {
        const epNum = aniZipEp.episodeAnizipNumber;
        const tmdbEp = tmdbMap.get(epNum);
        return this.mergeEpisodeData(initialResponse.value.provider, aniZipEp, tmdbEp, "meta");
      });
      const anilistData = initialResponse.value.data;
      const providerInfo = initialResponse.value.provider;
      return {
        data: anilistData,
        providerEpisodes: enrichedEpisodes,
        provider: providerInfo
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Unknown Error",
        providerEpisodes: [],
        provider: null,
        status: 500
      };
    }
  }
  /**
   * Fetches episode list from AniBD provider and enriches episodes with Anizip metadata (titles, thumbnails, etc.).
   *
   * @param anilistId - Anilist media ID (required)
   * @returns Enriched episode list from Anizone + Anilist base data
   */
  async fetchAniBDProviderEpisodes(anilistId) {
    if (!anilistId) {
      return {
        error: "Invalid or missing required parameter: anilistId!",
        data: null,
        providerEpisodes: [],
        provider: null,
        status: 400
      };
    }
    try {
      const [initialResponse, anizip, tmdb] = await Promise.allSettled([
        this.fetchAniBDProviderId(anilistId),
        this.anilistAnizip(anilistId),
        this.client.fetch(`${this.workerUrl}/api/meta/anilist/${anilistId}?platform=tmdb`, { method: "GET" })
      ]);
      if (initialResponse.status === "rejected") {
        return {
          data: null,
          providerEpisodes: [],
          provider: null,
          error: initialResponse.reason,
          status: 500
        };
      }
      if (anizip.status === "rejected") {
        return {
          data: null,
          providerEpisodes: [],
          provider: null,
          error: anizip.reason,
          status: 500
        };
      }
      const anibdAnimeId = initialResponse.value.provider?.id;
      const anibdResult = await this.anibd.fetchAnimeInfo(anibdAnimeId);
      const tmdbData = tmdb.status === "fulfilled" ? await tmdb.value.json() : null;
      const tmdbEpisodesList = Array.isArray(tmdbData?.episodes) ? tmdbData.episodes : [];
      const tmdbMap = new Map(
        tmdbEpisodesList.map((item) => [item.absoluteEpisodeNumber || item.absoluteEpisode, item])
      );
      const anizipEpisodes = anizip.value.episodes;
      const aniZipMap = new Map(
        (anizipEpisodes || []).map((item) => [item.episodeAnizipNumber, item])
      );
      const enrichedEpisodes = anibdResult.providerEpisodes.filter((ep) => typeof ep.episodeNumber === "number" && !isNaN(ep.episodeNumber) && ep.episodeNumber > 0).map((episode) => {
        const epNum = episode.episodeNumber;
        const tmdbEp = tmdbMap.get(epNum);
        const aniZipEp = aniZipMap.get(epNum);
        return this.mergeEpisodeData(episode, aniZipEp, tmdbEp, "anibd");
      });
      const anilistData = initialResponse.value.data;
      const providerInfo = initialResponse.value.provider;
      return {
        data: anilistData,
        providerEpisodes: enrichedEpisodes,
        provider: providerInfo
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Unknown Error",
        providerEpisodes: [],
        provider: null,
        status: 500
      };
    }
  }
  /**
   * Fetches episode list from AniDbApp provider and enriches episodes with Anizip metadata (titles, thumbnails, etc.).
   *
   * @param anilistId - Anilist media ID (required)
   * @returns Enriched episode list from Anizone + Anilist base data
   */
  async fetchAniDBProviderEpisodes(anilistId) {
    if (!anilistId) {
      return {
        error: "Invalid or missing required parameter: anilistId!",
        data: null,
        providerEpisodes: [],
        provider: null,
        status: 400
      };
    }
    try {
      const [initialResponse, anizip, tmdb] = await Promise.allSettled([
        this.fetchAniDBProviderId(anilistId),
        this.anilistAnizip(anilistId),
        this.client.fetch(`${this.workerUrl}/api/meta/anilist/${anilistId}?platform=tmdb`, { method: "GET" })
      ]);
      if (initialResponse.status === "rejected") {
        return {
          data: null,
          providerEpisodes: [],
          provider: null,
          error: initialResponse.reason,
          status: 500
        };
      }
      if (anizip.status === "rejected") {
        return {
          data: null,
          providerEpisodes: [],
          provider: null,
          error: anizip.reason,
          status: 500
        };
      }
      const anidbAnimeId = initialResponse.value.provider?.id;
      const anidbResult = await this.anidb.fetchEpisodes(anidbAnimeId);
      const tmdbData = tmdb.status === "fulfilled" ? await tmdb.value.json() : null;
      const tmdbEpisodesList = Array.isArray(tmdbData?.episodes) ? tmdbData.episodes : [];
      const tmdbMap = new Map(
        tmdbEpisodesList.map((item) => [item.absoluteEpisodeNumber || item.absoluteEpisode, item])
      );
      const anizipEpisodes = anizip.value.episodes;
      const aniZipMap = new Map(
        (anizipEpisodes || []).map((item) => [item.episodeAnizipNumber, item])
      );
      const enrichedEpisodes = anidbResult.data.filter((ep) => typeof ep.episodeNumber === "number" && !isNaN(ep.episodeNumber) && ep.episodeNumber > 0).map((episode) => {
        const epNum = episode.episodeNumber;
        const tmdbEp = tmdbMap.get(epNum);
        const aniZipEp = aniZipMap.get(epNum);
        return this.mergeEpisodeData(episode, aniZipEp, tmdbEp, "anidb");
      });
      const anilistData = initialResponse.value.data;
      const providerInfo = initialResponse.value.provider;
      return {
        data: anilistData,
        providerEpisodes: enrichedEpisodes,
        provider: providerInfo
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Unknown Error",
        providerEpisodes: [],
        provider: null,
        status: 500
      };
    }
  }
  /**
   * Fetches episode list from Anizone provider and enriches episodes with Anizip metadata (titles, thumbnails, etc.).
   *
   * @param anilistId - Anilist media ID (required)
   * @returns Enriched episode list from Anizone + Anilist base data
   */
  async fetchAnizoneProviderEpisodes(anilistId) {
    if (!anilistId) {
      return {
        error: "Invalid or missing required parameter: anilistId!",
        data: null,
        providerEpisodes: [],
        provider: null,
        status: 400
      };
    }
    try {
      const [initialResponse, anizip, tmdb] = await Promise.allSettled([
        this.fetchAnizoneProviderId(anilistId),
        this.anilistAnizip(anilistId),
        this.client.fetch(`${this.workerUrl}/api/meta/anilist/${anilistId}?platform=tmdb`, { method: "GET" })
      ]);
      if (initialResponse.status === "rejected") {
        return {
          data: null,
          providerEpisodes: [],
          provider: null,
          error: initialResponse.reason,
          status: 500
        };
      }
      if (anizip.status === "rejected") {
        return {
          data: null,
          providerEpisodes: [],
          provider: null,
          error: anizip.reason,
          status: 500
        };
      }
      const anizoneAnimeId = initialResponse.value.provider?.id;
      const anizoneResult = await this.anizone.fetchAnimeInfo(anizoneAnimeId);
      const tmdbData = tmdb.status === "fulfilled" ? await tmdb.value.json() : null;
      const tmdbEpisodesList = Array.isArray(tmdbData?.episodes) ? tmdbData.episodes : [];
      const tmdbMap = new Map(
        tmdbEpisodesList.map((item) => [
          item.absoluteEpisodeNumber || item.absoluteEpisode,
          // Use the field name we just added
          item
        ])
      );
      const anizipEpisodes = anizip.value.episodes;
      const aniZipMap = new Map(
        (anizipEpisodes || []).map((item) => [item.episodeAnizipNumber, item])
      );
      const enrichedEpisodes = anizoneResult.providerEpisodes.filter((ep) => typeof ep.episodeNumber === "number" && !isNaN(ep.episodeNumber) && ep.episodeNumber > 0).map((episode) => {
        const epNum = episode.episodeNumber;
        const tmdbEp = tmdbMap.get(epNum);
        const aniZipEp = aniZipMap.get(epNum);
        return this.mergeEpisodeData(episode, aniZipEp, tmdbEp, "anizone");
      });
      const anilistData = initialResponse.value.data;
      const providerInfo = initialResponse.value.provider;
      return {
        data: anilistData,
        providerEpisodes: enrichedEpisodes,
        provider: providerInfo
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Unknown Error",
        providerEpisodes: [],
        provider: null,
        status: 500
      };
    }
  }
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
  async search(search, mediaType, page = 1, perPage = 20) {
    if (!search) {
      return {
        hasNextPage: false,
        currentPage: 0,
        lastPage: 0,
        perPage: 0,
        data: [],
        error: "Missing required parameter: query",
        status: 400
      };
    }
    try {
      const variables = { search, page, perPage, type: mediaType, isAdult: false };
      const payload = {
        query: searchQueryWithSort,
        variables
      };
      const response = await this.client.fetch(
        this.baseUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify(payload)
        }
      );
      if (!response.ok) {
        return {
          hasNextPage: false,
          currentPage: 0,
          lastPage: 0,
          perPage: 0,
          data: [],
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      const pagination = {
        hasNextPage: result.data.Page.pageInfo.hasNextPage,
        total: result.data.Page.pageInfo.total,
        lastPage: result.data.Page.pageInfo.lastPage,
        currentPage: result.data.Page.pageInfo.currentPage,
        perPage: result.data.Page.pageInfo.perPage
      };
      const res = result.data.Page.media.map((item) => ({
        malId: item.idMal,
        anilistId: item.id,
        image: item.coverImage.extraLarge ?? item.coverImage.large ?? item.coverImage.medium,
        color: item.coverImage.color,
        bannerImage: item.bannerImage ?? null,
        title: {
          romaji: item.title.romaji ?? item.title.userPreferred,
          english: item.title.english,
          native: item.title.native
        },
        trailer: item.trailer,
        format: item.format,
        status: item.status,
        duration: item.duration,
        score: item.meanScore ?? item.averageScore,
        genres: item.genres,
        episodes: item.episodes,
        synopsis: item.description,
        season: item.season,
        releaseDate: item.startDate && item.startDate.year ? new Date(item.startDate.year, item.startDate.month - 1, item.startDate.day).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric"
        }) : "Unknown",
        endDate: item.endDate && item.endDate.year ? new Date(item.endDate.year, item.endDate.month - 1, item.endDate.day).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric"
        }) : "Unknown",
        studio: item.studios.nodes.length > 0 ? item.studios.nodes[0].name : null,
        producers: item.studios.nodes.map((item2) => item2.name)
      }));
      let items = res;
      if (mediaType === "MANGA") {
        items = res.filter((item) => item.format === "MANGA");
      }
      return {
        hasNextPage: pagination.hasNextPage,
        currentPage: pagination.currentPage,
        lastPage: pagination.lastPage,
        perPage: pagination.perPage,
        data: items
      };
    } catch (error) {
      return {
        hasNextPage: false,
        currentPage: 0,
        lastPage: 0,
        perPage: 0,
        data: [],
        status: 500,
        error: error instanceof Error ? error.message : "Internal Server Error "
      };
    }
  }
  /**
   * Fetches detailed metadata for a single anime or manga entry by its Anilist ID.
   *
   * @param id - Anilist media ID (required)
   * @param mediaType - Type of media
   * @param mediaType - `'ANIME'` or `'MANGA'`
   * @returns Detailed media information or error
   */
  async fetchInfo(id, mediaType) {
    if (!id) {
      return {
        error: "Missing required parameter : Anilistid!",
        data: null,
        status: 500
      };
    }
    const variables = { id, type: mediaType };
    const payload = {
      query: fetchByIdQuery,
      variables
    };
    try {
      const response = await this.client.fetch(
        this.baseUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify(payload)
        }
      );
      if (!response.ok) {
        return {
          error: response.statusText,
          data: null,
          status: response.status
        };
      }
      const result = await response.json();
      const res = {
        malId: result.data.Media.idMal,
        anilistId: result.data.Media.id,
        isAdult: result.data.Media.isAdult,
        image: result.data.Media.coverImage.extraLarge ?? result.data.Media.coverImage.large ?? result.data.Media.coverImage.medium,
        color: result.data.Media.coverImage.color,
        bannerImage: result.data.Media.bannerImage ?? null,
        title: {
          romaji: result.data.Media.title.romaji ?? result.data.Media.title.userPreferred,
          english: result.data.Media.title.english,
          native: result.data.Media.title.native
        },
        trailer: result.data.Media.trailer,
        format: result.data.Media.format,
        country: result.data.Media.countryOfOrigin || null,
        synonyms: result.data.Media.synonyms || null,
        year: result.data.Media.seasonYear || null,
        status: result.data.Media.status || null,
        duration: result.data.Media.duration,
        score: result.data.Media.meanScore || result.data.Media.averageScore,
        genres: result.data.Media.genres,
        episodes: result.data.Media.episodes,
        synopsis: result.data.Media.description,
        season: result.data.Media.season,
        releaseDate: result.data.Media.startDate && result.data.Media.startDate.year ? new Date(
          result.data.Media.startDate.year,
          result.data.Media.startDate.month - 1,
          result.data.Media.startDate.day
        ).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric"
        }) : "Unknown",
        endDate: result.data.Media.endDate && result.data.Media.endDate.year ? new Date(
          result.data.Media.endDate.year,
          result.data.Media.endDate.month - 1,
          result.data.Media.endDate.day
        ).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric"
        }) : "Unknown",
        studio: result.data.Media.studios.nodes.length > 0 ? result.data.Media.studios.nodes[0].name : null,
        producers: result.data.Media.studios.nodes.map((item2) => item2.name)
      };
      return {
        data: res
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown Err",
        data: null,
        status: 500
      };
    }
  }
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
  async fetchTopUpcoming(page = 1, perPage = 20, sort = "POPULARITY_DESC", status = "NOT_YET_RELEASED", format = "TV") {
    try {
      const variables = { page, perPage, type: "ANIME", format, status, isAdult: false, sort };
      const payload = {
        query: topQuery,
        variables
      };
      const response = await this.client.fetch(
        this.baseUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify(payload)
        }
      );
      if (!response.ok) {
        return {
          hasNextPage: false,
          currentPage: 0,
          lastPage: 0,
          perPage: 0,
          data: [],
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      const pagination = {
        hasNextPage: result.data.Page.pageInfo.hasNextPage,
        total: result.data.Page.pageInfo.total,
        lastPage: result.data.Page.pageInfo.lastPage,
        currentPage: result.data.Page.pageInfo.currentPage,
        perPage: result.data.Page.pageInfo.perPage
      };
      const res = result.data.Page.media.map((item) => ({
        malId: item.idMal,
        anilistId: item.id,
        image: item.coverImage.extraLarge ?? item.coverImage.large ?? item.coverImage.medium,
        bannerImage: item.bannerImage ?? null,
        title: {
          romaji: item.title.romaji ?? item.title.userPreferred,
          english: item.title.english,
          native: item.title.native
        },
        trailer: item.trailer,
        format: item.format,
        status: item.status,
        genres: item.genres,
        synopsis: item.description,
        releaseDate: item.startDate && item.startDate.year ? new Date(item.startDate.year, item.startDate.month - 1, item.startDate.day).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric"
        }) : "Unknown",
        studio: item.studios.nodes.length > 0 ? item.studios.nodes[0].name : null,
        producers: item.studios.nodes.map((item2) => item2.name)
      }));
      return {
        hasNextPage: pagination.hasNextPage,
        currentPage: pagination.currentPage,
        lastPage: pagination.lastPage,
        perPage: pagination.perPage,
        data: res
      };
    } catch (error) {
      return {
        hasNextPage: false,
        currentPage: 0,
        lastPage: 0,
        perPage: 0,
        data: [],
        error: error instanceof Error ? error.message : "Unknown Err",
        status: 500
      };
    }
  }
  /**
   * Fetches a list of the top airing anime.
   *
   * @param page - The page number for pagination (optional, defaults to 1)
   * @param perPage - The number of results per page (optional, defaults to 20)
   * @param sort - The sorting order for results (optional, defaults to SCORE_DESC)
   * @param status - Anime state defaults to RELEASING.
   * @returns Promise that resolves to paginated list of airing anime
   */
  async fetchTopAiring(page = 1, perPage = 20, sort = "SCORE_DESC", status = "RELEASING") {
    return this.fetchTopUpcoming(page, perPage, sort, status);
  }
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
  async fetchMostPopular(mediaType, format, page = 1, perPage = 20, sort = "POPULARITY_DESC") {
    try {
      const variables = { page, perPage, type: mediaType, format, isAdult: false, sort };
      const payload = {
        query: popularAnimeQuery,
        variables
      };
      const response = await this.client.fetch(
        this.baseUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify(payload)
        }
      );
      if (!response.ok) {
        return {
          hasNextPage: false,
          currentPage: 0,
          lastPage: 0,
          perPage: 0,
          data: [],
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      const pagination = {
        hasNextPage: result.data.Page.pageInfo.hasNextPage,
        total: result.data.Page.pageInfo.total,
        lastPage: result.data.Page.pageInfo.lastPage,
        currentPage: result.data.Page.pageInfo.currentPage,
        perPage: result.data.Page.pageInfo.perPage
      };
      const res = result.data.Page.media.map((item) => ({
        malId: item.idMal,
        anilistId: item.id,
        image: item.coverImage.extraLarge ?? item.coverImage.large ?? item.coverImage.medium,
        bannerImage: item.bannerImage ?? null,
        title: {
          romaji: item.title.romaji ?? item.title.userPreferred,
          english: item.title.english,
          native: item.title.native
        },
        trailer: item.trailer,
        format: item.format,
        status: item.status,
        duration: item.duration,
        score: item.meanScore ?? item.averageScore,
        genres: item.genres,
        episodes: item.episodes,
        synopsis: item.description,
        season: item.season,
        releaseDate: item.startDate && item.startDate.year ? new Date(item.startDate.year, item.startDate.month - 1, item.startDate.day).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric"
        }) : "Unknown",
        endDate: item.endDate && item.endDate.year ? new Date(item.endDate.year, item.endDate.month - 1, item.endDate.day).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric"
        }) : "Unknown",
        studio: item.studios.nodes.length > 0 ? item.studios.nodes[0].name : null,
        producers: item.studios.nodes.map((item2) => item2.name)
      }));
      return {
        hasNextPage: pagination.hasNextPage,
        currentPage: pagination.currentPage,
        lastPage: pagination.lastPage,
        perPage: pagination.perPage,
        data: res
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown err",
        hasNextPage: false,
        currentPage: 0,
        lastPage: 0,
        perPage: 0,
        data: [],
        status: 500
      };
    }
  }
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
  async fetchTopRated(mediaType, format, page = 1, perPage = 20, sort = "SCORE_DESC") {
    return this.fetchMostPopular(mediaType, format, page, perPage, sort);
  }
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
  async fetchSeasonalAnime(season, seasonYear, page = 1, perPage = 20, format = "TV") {
    if (!season || !seasonYear) {
      return {
        hasNextPage: false,
        currentPage: 0,
        lastPage: 0,
        perPage: 0,
        data: [],
        error: "Missing a required parameter : season or  seasonYear",
        status: 400
      };
    }
    try {
      const variables = {
        page,
        perPage,
        type: "ANIME",
        format,
        isAdult: false,
        season,
        seasonYear,
        sort: "POPULARITY_DESC"
      };
      const payload = {
        query: seasonQuery,
        variables
      };
      const response = await this.client.fetch(
        this.baseUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify(payload)
        }
      );
      if (!response.ok) {
        return {
          hasNextPage: false,
          currentPage: 0,
          lastPage: 0,
          perPage: 0,
          data: [],
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      const pagination = {
        hasNextPage: result.data.Page.pageInfo.hasNextPage,
        total: result.data.Page.pageInfo.total,
        lastPage: result.data.Page.pageInfo.lastPage,
        currentPage: result.data.Page.pageInfo.currentPage,
        perPage: result.data.Page.pageInfo.perPage
      };
      const res = result.data.Page.media.map((item) => ({
        malId: item.idMal,
        anilistId: item.id,
        image: item.coverImage.extraLarge ?? item.coverImage.large ?? item.coverImage.medium,
        bannerImage: item.bannerImage ?? null,
        title: {
          romaji: item.title.romaji ?? item.title.userPreferred,
          english: item.title.english,
          native: item.title.native
        },
        trailer: item.trailer,
        format: item.format,
        status: item.status,
        duration: item.duration,
        score: item.meanScore ?? item.averageScore,
        genres: item.genres,
        episodes: item.episodes,
        synopsis: item.description,
        season: item.season,
        releaseDate: item.startDate && item.startDate.year ? new Date(item.startDate.year, item.startDate.month - 1, item.startDate.day).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric"
        }) : "Unknown",
        endDate: item.endDate && item.endDate.year ? new Date(item.endDate.year, item.endDate.month - 1, item.endDate.day).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric"
        }) : "Unknown",
        studio: item.studios.nodes.length > 0 ? item.studios.nodes[0].name : null,
        producers: item.studios.nodes.map((item2) => item2.name)
      }));
      return {
        hasNextPage: pagination.hasNextPage,
        currentPage: pagination.currentPage,
        lastPage: pagination.lastPage,
        perPage: pagination.perPage,
        data: res
      };
    } catch (error) {
      return {
        hasNextPage: false,
        currentPage: 0,
        lastPage: 0,
        perPage: 0,
        data: [],
        error: error instanceof Error ? error.message : "Unknown err",
        status: 500
      };
    }
  }
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
  async fetchTrending(mediaType, format, page = 1, perPage = 20) {
    const variables = {
      page,
      perPage,
      type: mediaType,
      format
    };
    try {
      const payload = {
        query: mediaTrendQuery,
        variables
      };
      const response = await this.client.fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        return {
          hasNextPage: false,
          currentPage: 0,
          lastPage: 0,
          perPage: 0,
          data: [],
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      const pagination = {
        hasNextPage: result.data.Page.pageInfo.hasNextPage,
        total: result.data.Page.pageInfo.total,
        lastPage: result.data.Page.pageInfo.lastPage,
        currentPage: result.data.Page.pageInfo.currentPage,
        perPage: result.data.Page.pageInfo.perPage
      };
      const res = result.data.Page.media.map((item) => ({
        malId: item.idMal,
        anilistId: item.id,
        bannerImage: item.bannerImage ?? null,
        image: item.coverImage.extraLarge ?? item.coverImage.large ?? item.coverImage.medium,
        title: {
          romaji: item.title.romaji ?? item.title.userPreferred,
          english: item.title.english,
          native: item.title.native
        },
        format: item.format,
        status: item.status,
        popularity: item.popularity,
        score: item.meanScore ?? item.averageScore,
        genres: item.genres,
        episodes: item.episodes,
        synopsis: item.description,
        season: item.season,
        releaseDate: item.startDate && item.startDate.year ? new Date(item.startDate.year, item.startDate.month - 1, item.startDate.day).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric"
        }) : "Unknown",
        endDate: item.endDate && item.endDate.year ? new Date(item.endDate.year, item.endDate.month - 1, item.endDate.day).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric"
        }) : "Unknown",
        studio: item.studios.nodes.length > 0 ? item.studios.nodes[0].name : null,
        producers: item.studios?.nodes.map((item2) => item2.name)
      }));
      return {
        hasNextPage: pagination.hasNextPage,
        currentPage: pagination.currentPage,
        lastPage: pagination.lastPage,
        perPage: pagination.perPage,
        data: res
      };
    } catch (error) {
      return {
        hasNextPage: false,
        currentPage: 0,
        lastPage: 0,
        perPage: 0,
        data: [],
        error: error instanceof Error ? error.message : "Unknown err",
        status: 500
      };
    }
  }
  /**
   * Fetches anime titles related to a specific anime ID, such as sequels, prequels, or spin-offs.
   *
   * @param mediaId - The unique Anilist anime ID (required)
   * @returns Promise that resolves to related anime information
   */
  async fetchRelatedAnime(mediaId) {
    if (!mediaId) {
      return {
        data: [],
        error: "Missing a required param : season | seasonYear"
      };
    }
    const variables = {
      mediaId,
      type: "ANIME"
    };
    try {
      const payload = {
        query: relatedQuery,
        variables
      };
      const response = await this.client.fetch(
        this.baseUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify(payload)
        }
      );
      if (!response.ok) {
        return {
          error: response.statusText || "Server returned an empty response",
          data: [],
          status: response.status
        };
      }
      const result = await response.json();
      const res = result.data.Media.relations.edges.filter((item) => item.node.type === "ANIME").map((item) => ({
        anilistId: item.node.id,
        malId: item.node.idMal,
        title: {
          romaji: item.node.title.romaji ?? item.node.title.userPreferred,
          english: item.node.title.english,
          native: item.node.title.native
        },
        type: item.node.type,
        country: item.node.countryOfOrigin || null,
        synonyms: item.node.synonyms || null,
        year: item.node.seasonYear || null,
        score: item.node.averageScore ?? item.node.meanScore,
        image: item.node.coverImage.extraLarge ?? item.node.coverImage.large ?? item.node.coverImage.medium,
        bannerImage: item.node.bannerImage ?? null,
        color: item.node.coverImage.color ?? null
      }));
      return {
        data: res
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown Err",
        data: [],
        status: 500
      };
    }
  }
  /**
   * Fetches characters associated with a specific anime.
   *
   * @param mediaId - The unique Anilist anime ID (required)
   * @returns Promise that resolves to anime characters and their voice actors
   */
  async fetchCharacters(mediaId) {
    if (!mediaId) {
      return {
        error: "Missing required parameter: mediaId!",
        data: null,
        status: 400
      };
    }
    try {
      const variables = {
        mediaId,
        sort: "RELEVANCE",
        voiceActorsSort2: "RELEVANCE"
      };
      const payload = {
        query: characterQuery,
        variables
      };
      const response = await this.client.fetch(
        this.baseUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify(payload)
        }
      );
      if (!response.ok) {
        return {
          error: response.statusText || "Server returned an empty response",
          data: null,
          status: response.status
        };
      }
      const result = await response.json();
      const res = {
        malId: result.data.Media.idMal,
        anilistId: result.data.Media.id,
        title: {
          romaji: result.data.Media.title.romaji ?? result.data.Media.title.userPreferred,
          english: result.data.Media.title.english,
          native: result.data.Media.title.native
        },
        characters: result.data?.Media.characters.edges.map((item) => ({
          role: item.role,
          id: item.node.id,
          name: item.node.name.full,
          image: item.node.image.large ?? item.node.image.medium,
          voiceActors: item.voiceActors.map((item2) => ({
            name: item2.name.full,
            language: item2.languageV2,
            image: item2.image.large ?? item2.image.medium
          }))
        }))
      };
      return {
        data: res
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown err",
        data: null,
        status: 500
      };
    }
  }
  /**
   * Fetches the airing schedule for a specific anime by its Anilist ID.
   *
   * @param {number} mediaId - The unique Anilist anime ID (required).
   * @returns  A promise that resolves to an object containing the airing schedule data or an error.
   * **/
  async fetchMediaSchedule(mediaId) {
    if (!mediaId) {
      return { error: "Missing required params: anilistId", data: null, status: 400 };
    }
    try {
      const variables = {
        mediaId
      };
      const payload = {
        query: mediaAiringSchedule,
        variables
      };
      const response = await this.client.fetch(
        this.baseUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify(payload)
        }
      );
      if (!response.ok) {
        return {
          error: response.statusText || "Server returned an empty response",
          data: null,
          status: response.status
        };
      }
      const result = await response.json();
      const res = {
        malId: result.data.AiringSchedule.media.idMal,
        anilistId: result.data.AiringSchedule.media.id,
        image: result.data.AiringSchedule.media.coverImage.extraLarge ?? result.data.AiringSchedule.media.coverImage.large ?? result.data.AiringSchedule.media.coverImage.medium,
        color: result.data.AiringSchedule.media.coverImage.color,
        bannerImage: result.data.AiringSchedule.media.bannerImage ?? null,
        title: {
          romaji: result.data.AiringSchedule.media.title.romaji ?? result.data.AiringSchedule.media.title.userPreferred,
          english: result.data.AiringSchedule.media.title.english,
          native: result.data.AiringSchedule.media.title.native
        },
        status: result.data.AiringSchedule.media.status,
        format: result.data.AiringSchedule.media.format,
        duration: result.data.AiringSchedule.media.duration,
        releaseDate: result.data.AiringSchedule.media.startDate?.year ? new Date(
          result.data.AiringSchedule.media.startDate.year,
          result.data.AiringSchedule.media.startDate.month - 1,
          result.data.AiringSchedule.media.startDate.day
        ).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "Unknown",
        endDate: result.data.AiringSchedule.media.endDate?.year ? new Date(
          result.data.AiringSchedule.media.endDate.year,
          result.data.AiringSchedule.media.endDate.month - 1,
          result.data.AiringSchedule.media.endDate.day
        ).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "Unknown",
        nextAiringEpisode: result.data.AiringSchedule.media.nextAiringEpisode ? {
          episode: result.data.AiringSchedule.media.nextAiringEpisode.episode,
          id: result.data.AiringSchedule.media.nextAiringEpisode.id,
          airingAt: result.data.AiringSchedule.media.nextAiringEpisode.airingAt,
          timeUntilAiring: result.data.AiringSchedule.media.nextAiringEpisode.timeUntilAiring
        } : null
      };
      return { data: res };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown err",
        data: null,
        status: 500
      };
    }
  }
  /**
   * Fetches a paginated list of all anime airing on a specific date.
   * @param {string} date - The date to check for airing episodes (Format: ISO 8601 standard (YYYY-MM-DD)).
   * @param {number} [page=1] - The page number to fetch for pagination.
   * @param {number} [perPage=20] - The number of results to return per page.
   * @returns  A promise resolving to a paginated  object containing an array of airing schedules and page metadata.
   */
  async fetchAiringSchedule(date, page = 1, perPage = 20) {
    try {
      const start = this.getAniListVariables(date).start;
      const end = this.getAniListVariables(date).end;
      const variables = {
        airingAtLesser: end,
        airingAtGreater: start,
        page,
        perPage
      };
      const payload = {
        query: fetchAiringByDate,
        variables
      };
      const response = await this.client.fetch(
        this.baseUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify(payload)
        }
      );
      if (!response.ok) {
        return {
          hasNextPage: false,
          currentPage: 0,
          lastPage: 0,
          perPage: 0,
          error: response.statusText || "Server returned an empty response",
          data: [],
          status: response.status
        };
      }
      const result = await response.json();
      const res = result.data.Page.airingSchedules.map((item) => ({
        malId: item.media.idMal,
        anilistId: item.media.id,
        bannerImage: item.media.bannerImage ?? null,
        image: item.media.coverImage.extraLarge ?? item.media.coverImage.large ?? item.media.coverImage.medium,
        color: item.media.coverImage.color,
        title: {
          romaji: item.media.title.romaji ?? item.media.title.userPreferred,
          english: item.media.title.english,
          native: item.media.title.native
        },
        format: item.media.format,
        status: item.media.status,
        popularity: item.media.popularity,
        score: item.media.meanScore ?? item.media.averageScore,
        genres: item.media.genres,
        episodes: item.media.episodes,
        duration: item.media.duration,
        synopsis: item.media.description,
        season: item.media.season,
        releaseDate: item.media.startDate && item.media.startDate.year ? new Date(
          item.media.startDate.year,
          item.media.startDate.month - 1,
          item.media.startDate.day
        ).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric"
        }) : "Unknown",
        endDate: item.media.endDate && item.media.endDate.year ? new Date(item.media.endDate.year, item.media.endDate.month - 1, item.media.endDate.day).toLocaleDateString(
          "en-US",
          {
            year: "numeric",
            month: "long",
            day: "numeric"
          }
        ) : "Unknown",
        nextAiringEpisode: item.media.nextAiringEpisode ? {
          episode: item.media.nextAiringEpisode.episode,
          id: item.media.nextAiringEpisode.id,
          airingAt: item.media.nextAiringEpisode.airingAt,
          timeUntilAiring: item.media.nextAiringEpisode.timeUntilAiring
        } : null
      }));
      return {
        hasNextPage: result.data.Page.pageInfo.hasNextPage,
        currentPage: result.data.Page.pageInfo.currentPage,
        lastPage: result.data.Page.pageInfo.lastPage,
        perPage: result.data.Page.pageInfo.perPage,
        data: res
      };
    } catch (error) {
      return {
        hasNextPage: false,
        currentPage: 0,
        lastPage: 0,
        perPage: 0,
        data: [],
        error: error instanceof Error ? error.message : "Unknown err"
      };
    }
  }
  /**
   * Converts two date strings into a variables object for AniList
   * @param {string} startDate - Format "YYYY-MM-DD"
   */
  getAniListVariables(startDate) {
    const start = /* @__PURE__ */ new Date(`${startDate}T00:00:00Z`);
    const end = /* @__PURE__ */ new Date(`${startDate}T23:59:59Z`);
    return {
      start: Math.floor(start.getTime() / 1e3),
      end: Math.floor(end.getTime() / 1e3)
    };
  }
};

// src/provider/meta/tmdb.ts
var TheMovieDatabase = class extends BaseClass {
  apiKey = "ea021b3b0775c8531592713ab727f254";
  /** Base URL for the TMDb API */
  baseUrl = "https://api.themoviedb.org/3";
  /**
   * Creates an instance of the TMDb API client.
   */
  constructor(options = {
    browser: "okhttp4",
    http3: false
  }) {
    super(options);
  }
  /**
   * Searches for TV shows based on the provided query string using TMDb API.
   *
   * @param query - The search query string (required)
   * @param page - The page number for pagination (optional, defaults to 1)
   * @returns Promise resolving to paginated list of TV shows matching the search query
   */
  async searchShows(query, page = 1) {
    if (!query) {
      return {
        hasNextPage: false,
        currentPage: 0,
        totalResults: 0,
        lastPage: 0,
        data: [],
        error: "Missing required parameter. Query"
      };
    }
    return this.fetchPaginatedData("/search/tv", {
      include_adult: "false",
      page: String(page),
      query
    });
  }
  /**
   * Fetches detailed TV show information from TMDb using append_to_response
   */
  async fetchShowInfo(tmdbId) {
    if (!tmdbId) {
      return {
        data: null,
        error: "Missing required parameter: tmdbId",
        status: 400
      };
    }
    try {
      const params = new URLSearchParams({
        api_key: this.apiKey,
        append_to_response: "images",
        include_image_language: "en,null"
      });
      const finalUrl = `${this.baseUrl}/tv/${tmdbId}?${params.toString()}`;
      const response = await this.client.fetch(finalUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      });
      if (!response.ok) {
        return {
          data: null,
          error: response?.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      const data = {
        tmdbId: result.id || null,
        name: result.name || null,
        originalName: result.original_name || null,
        posterImage: this.buildImageUrls(result.poster_path),
        coverImage: this.buildImageUrls(result.backdrop_path, {
          small: "w300",
          medium: "w780",
          large: "w1280"
        }),
        status: result.status || null,
        country: result.origin_country || null,
        language: result.original_language || null,
        episodes: result.number_of_episodes || null,
        totalSeasons: result.number_of_seasons || null,
        rating: result.vote_average || null,
        genres: result.genres || null,
        summary: result.overview || null,
        releaseDate: result.first_air_date || null,
        lastAired: result.last_air_date || null,
        latestEpisode: this.formatEpisode(result.last_episode_to_air),
        nextEpisode: this.formatEpisode(result.next_episode_to_air),
        seasons: (result.seasons || []).map((item) => ({
          airDate: item.air_date || null,
          id: item.id || null,
          name: item.name || null,
          rating: item.vote_average || null,
          totalEpisodes: item.episode_count || null,
          summary: item.overview || null,
          seasonNumber: item.season_number,
          posterImage: this.buildImageUrls(item.poster_path)
        })),
        artWorks: {
          coverImages: (result.images?.backdrops || []).map(
            (item) => this.buildImageUrls(item.file_path, { small: "w300", medium: "w780", large: "w1280" })
          ),
          logos: (result.images?.logos || []).map(
            (item) => this.buildImageUrls(item.file_path, { small: "w300", medium: "w780", large: "w1280" })
          ),
          posterImages: (result.images?.posters || []).map(
            (item) => this.buildImageUrls(item.file_path, { small: "w300", medium: "w780", large: "w1280" })
          )
        }
      };
      return { data };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Unknown error occurred",
        status: 500
      };
    }
  }
  /**
   * Fetches episodes available in a specific season of a TV show from TMDb.
   *
   * @param tmdbId - The unique TMDb ID for the TV show (required)
   * @param season - The season number for which to fetch episodes (required)
   * @returns Promise resolving to array of episodes with their detailed information for the specified season
   */
  async fetchTvEpisodes(tmdbId, season) {
    if (!tmdbId) {
      return { error: "Missing required params: tmdbId!", data: [], status: 400 };
    }
    try {
      const queryString = new URLSearchParams({
        api_key: this.apiKey
      }).toString();
      const response = await this.client.fetch(`${this.baseUrl}/tv/${tmdbId}/season/${season}?${queryString}`, {
        method: "GET",
        headers: {
          accept: "application/json"
        }
      });
      if (!response.ok) return { error: response.statusText, data: [], status: response.status };
      const result = await response.json();
      const episodes = result.episodes.map((item) => ({
        airDate: item.air_date || null,
        episodeNumber: item.episode_number || null,
        episodeType: item.episode_type || null,
        tmdbEpisodeId: item.id || null,
        title: item.name || null,
        summary: item.overview || null,
        rating: item.vote_average || null,
        seasonNumber: item.season_number,
        tmdbId: item.show_id || null,
        runtime: item.runtime || null,
        images: this.buildImageUrls(item.still_path)
      }));
      return { data: episodes };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unknown error", data: [], status: 500 };
    }
  }
  /**
   * Fetches detailed information about a specific episode from a TV show.
   *
   * @param tmdbId - The unique TMDb ID for the TV show (required)
   * @param season - The season number containing the episode (optional, defaults to 1)
   * @param episodeNumber - The episode number for which to fetch information (optional, defaults to 1)
   * @returns Promise resolving to detailed episode information including images and ratings
   */
  async fetchEpisodeInfo(tmdbId, season, episodeNumber) {
    try {
      const queryString = new URLSearchParams({
        api_key: this.apiKey
      }).toString();
      const response = await this.client.fetch(
        `${this.baseUrl}/tv/${tmdbId}/season/${season}/episode/${episodeNumber}?${queryString}`,
        {
          method: "GET",
          headers: {
            accept: "application/json"
          }
        }
      );
      if (!response.ok) return { error: response.statusText, data: null, status: response.status };
      const result = await response.json();
      const episode = {
        airDate: result.air_date || null,
        title: result.name || null,
        summary: result.overview || null,
        rating: result.vote_average || null,
        seasonNumber: result.season_number || null,
        tmdbEpisodeId: result.id || null,
        runtime: result.runtime || null,
        images: this.buildImageUrls(result.still_path)
      };
      return {
        data: episode
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown error",
        data: null,
        status: 500
      };
    }
  }
  /**
   * Fetches trending TV shows based on a specified time window from TMDb.
   *
   * @param timeWindow - The time window to fetch trending shows (day or week) (optional, defaults to 'week')
   * @param page - The page number for pagination (optional, defaults to 1)
   * @returns Promise resolving to paginated list of trending TV shows
   */
  async fetchTrendingTv(timeWindow = "week", page = 1) {
    return this.fetchPaginatedData(`/trending/tv/${timeWindow}`, { page: String(page) });
  }
  /**
   * Fetches popular TV shows from TMDb.
   *
   * @param page - The page number for pagination (optional, defaults to 1)
   * @returns Promise resolving to paginated list of popular TV shows
   */
  async fetchPopularTv(page = 1) {
    return this.fetchPaginatedData("/tv/popular", { page: String(page) });
  }
  /**
   * Fetches top-rated TV shows from TMDb.
   *
   * @param page - The page number for pagination (optional, defaults to 1)
   * @returns Promise resolving to paginated list of top-rated TV shows
   */
  async fetchTopShows(page = 1) {
    return this.fetchPaginatedData("/tv/top_rated", { page: String(page) });
  }
  /**
   * Searches for movies based on the provided query string using TMDb API.
   *
   * @param query - The search query string (required)
   * @param page - The page number for pagination (optional, defaults to 1)
   * @returns Promise resolving to paginated list of movies matching the search query
   */
  async searchMovie(query, page = 1) {
    if (!query) {
      return {
        hasNextPage: false,
        currentPage: 0,
        totalResults: 0,
        lastPage: 0,
        data: [],
        error: "Missing required parameter. Query"
      };
    }
    return this.fetchPaginatedMovieData("/search/movie", {
      include_adult: "false",
      page: String(page),
      query
    });
  }
  /**
   * Fetches detailed information about a specific movie using its TMDb ID.
   *
   * @param tmdbId - The unique TMDb ID for the movie (required)
   * @returns Promise resolving to comprehensive movie information
   */
  async fetchMovieInfo(tmdbId) {
    if (!tmdbId) {
      return {
        data: null,
        error: "Missing required parameter: tmdbId",
        status: 400
      };
    }
    try {
      const queryParams = new URLSearchParams({
        api_key: this.apiKey,
        include_image_language: "en,null"
      }).toString();
      const url = `${this.baseUrl}/movie/${tmdbId}?append_to_response=images&${queryParams}`;
      const response = await this.client.fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      });
      if (!response.ok) {
        return {
          data: null,
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      const data = {
        tmdbId: result.id || null,
        name: result.title || null,
        originalName: result.original_title || null,
        posterImage: this.buildImageUrls(result.poster_path),
        coverImage: this.buildImageUrls(result.backdrop_path, {
          small: "w300",
          medium: "w780",
          large: "w1280"
        }),
        status: result.status || null,
        country: result.origin_country || null,
        language: result.original_language || null,
        rating: result.vote_average || null,
        genres: result.genres || null,
        runtime: result.runtime || null,
        summary: result.overview || null,
        releaseDate: result.release_date || null,
        artWorks: {
          coverImages: (result.images?.backdrops || []).map(
            (item) => this.buildImageUrls(item.file_path, { small: "w300", medium: "w780", large: "w1280" })
          ),
          logos: (result.images?.logos || []).map(
            (item) => this.buildImageUrls(item.file_path, { small: "w300", medium: "w780", large: "w1280" })
          ),
          posterImages: (result.images?.posters || []).map(
            (item) => this.buildImageUrls(item.file_path, { small: "w300", medium: "w780", large: "w1280" })
          )
        }
      };
      return { data };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Unknown error occurred",
        status: 500
      };
    }
  }
  /**
   * Fetches trending movies based on a specified time window from TMDb.
   *
   * @param timeWindow - The time window to fetch trending movies (day or week) (optional, defaults to 'week')
   * @param page - The page number for pagination (optional, defaults to 1)
   * @returns Promise resolving to paginated list of trending movies
   */
  async fetchTrendingMovies(timeWindow = "week", page = 1) {
    return this.fetchPaginatedMovieData(`/trending/movie/${timeWindow}`, { page: String(page) });
  }
  /**
   * Fetches popular movies from TMDb.
   *
   * @param page - The page number for pagination (optional, defaults to 1)
   * @returns Promise resolving to paginated list of popular movies
   */
  async fetchPopularMovies(page = 1) {
    return this.fetchPaginatedMovieData("/movie/popular", { page: String(page) });
  }
  /**
   * Fetches top-rated movies from TMDb.
   *
   * @param page - The page number for pagination (optional, defaults to 1)
   * @returns Promise resolving to paginated list of top-rated movies
   */
  async fetchTopMovies(page = 1) {
    return this.fetchPaginatedMovieData("/movie/top_rated", { page: String(page) });
  }
  /**
   * Fetches the current season's anime automatically based on today's date.
   * @param env - Cloudflare Environment
   * @param page - Page number (default: 1)
   * @returns Promise with enriched current seasonal anime data
   */
  async fetchSeasonalAnime(page = 1) {
    try {
      const endpoint = "/discover/tv";
      const { season, year } = this.getCurrentSeasonAndYear();
      const { start, end } = this.getSeasonDates(season, year);
      const params = {
        api_key: this.apiKey,
        with_genres: "16,10759",
        with_original_language: "ja",
        with_origin_country: "JP",
        "air_date.gte": start,
        "air_date.lte": end,
        sort_by: "popularity.desc",
        page: page.toString()
      };
      const queryString = new URLSearchParams(params).toString();
      const separator = endpoint.includes("?") ? "&" : "?";
      const url = `${this.baseUrl}${endpoint}${separator}${queryString}`;
      const response = await this.client.fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      });
      if (!response.ok) {
        return {
          hasNextPage: false,
          currentPage: 0,
          totalResults: 0,
          lastPage: 0,
          data: [],
          error: response?.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      const data = result.results.map((item) => ({
        tmdbId: item.id || null,
        name: item.name || item.title || null,
        originalName: item.original_name || item.original_title || null,
        posterImage: this.buildImageUrls(item.poster_path),
        coverImage: this.buildImageUrls(item.backdrop_path),
        country: item.origin_country?.[0] || null,
        type: "tv",
        language: item.original_language || null,
        releaseDate: item.first_air_date || null,
        summary: item.overview || null,
        genres: item.genre_ids || null,
        rating: item.vote_average || null
      }));
      return {
        hasNextPage: result.page < result.total_pages,
        currentPage: result.page,
        totalResults: result.total_results,
        lastPage: result.total_pages,
        data
      };
    } catch (error) {
      return {
        hasNextPage: false,
        currentPage: 0,
        totalResults: 0,
        lastPage: 0,
        data: [],
        error: error instanceof Error ? error.message : "Unknown error occurred",
        status: 500
      };
    }
  }
  /**
   * Fetches popular anime from TMDb
   * @param page - Page number (default: 1)
   * @returns Promise with enriched top anime data
   */
  async fetchPopularAnime(page) {
    try {
      const endpoint = "/discover/tv";
      const queryString = new URLSearchParams({
        api_key: this.apiKey,
        with_genres: "16,10759",
        with_original_language: "ja",
        with_origin_country: "JP",
        sort_by: "popularity.desc",
        page: String(page)
      }).toString();
      const url = `${this.baseUrl}${endpoint}?${queryString}`;
      const response = await this.client.fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      });
      if (!response.ok) {
        return {
          hasNextPage: false,
          currentPage: 0,
          totalResults: 0,
          lastPage: 0,
          data: [],
          error: response?.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      const data = result.results.map((item) => ({
        tmdbId: item.id || null,
        name: item.name || item.title || null,
        originalName: item.original_name || item.original_title || null,
        posterImage: this.buildImageUrls(item.poster_path),
        coverImage: this.buildImageUrls(item.backdrop_path),
        country: item.origin_country || null,
        type: item.media_type || null,
        language: item.original_language || null,
        releaseDate: item.first_air_date || null,
        summary: item.overview || null,
        genres: item.genre_ids || null,
        rating: item.vote_average || null
      }));
      return {
        hasNextPage: result.page < result.total_pages,
        currentPage: result.page,
        totalResults: result.total_results,
        lastPage: result.total_pages,
        data
      };
    } catch (error) {
      return {
        hasNextPage: false,
        currentPage: 0,
        totalResults: 0,
        lastPage: 0,
        data: [],
        error: error instanceof Error ? error.message : "Unknown error occurred",
        status: 500
      };
    }
  }
  /**
     * Fetches top anime from TMDb and enriches with detailed info
     *
  
     * @param page - Page number (default: 1)
     * @returns Promise with enriched top anime data
     */
  async fetchTopAnime(page) {
    try {
      const endpoint = "/discover/tv";
      const params = {
        api_key: this.apiKey,
        with_genres: "16,10759,10765",
        with_original_language: "ja",
        with_origin_country: "JP",
        sort_by: "vote_average.desc",
        "vote_count.gte": `${200}`,
        page: page.toString()
      };
      const queryString = new URLSearchParams(params).toString();
      const separator = endpoint.includes("?") ? "&" : "?";
      const url = `${this.baseUrl}${endpoint}${separator}${queryString}`;
      const response = await this.client.fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      });
      if (!response.ok) {
        return {
          hasNextPage: false,
          currentPage: 0,
          totalResults: 0,
          lastPage: 0,
          data: [],
          error: response?.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      const data = result.results.map((item) => ({
        tmdbId: item.id || null,
        name: item.name || item.title || null,
        originalName: item.original_name || item.original_title || null,
        posterImage: this.buildImageUrls(item.poster_path),
        coverImage: this.buildImageUrls(item.backdrop_path),
        country: item.origin_country || null,
        type: item.media_type || null,
        language: item.original_language || null,
        releaseDate: item.first_air_date || null,
        summary: item.overview || null,
        genres: item.genre_ids || null,
        rating: item.vote_average || null
      }));
      return {
        hasNextPage: result.page < result.total_pages,
        currentPage: result.page,
        totalResults: result.total_results,
        lastPage: result.total_pages,
        data
      };
    } catch (error) {
      return {
        hasNextPage: false,
        currentPage: 0,
        totalResults: 0,
        lastPage: 0,
        data: [],
        error: error instanceof Error ? error.message : "Unknown error occurred"
      };
    }
  }
  /**
   * Fetches anime airing within the current week and enriches the data.
   * Useful for "Airing This Week" or "Simulcast" sections.
   * @param env - Cloudflare Environment
   * @param page - Page number (default: 1)
   * @returns Promise with enriched weekly anime data
   */
  async fetchWeeklyAnime(page = 1) {
    try {
      const endpoint = "/discover/tv";
      const { start, end } = this.getWeeklyDates();
      const params = {
        api_key: this.apiKey,
        with_genres: "16,10759",
        with_original_language: "ja",
        with_origin_country: "JP",
        "air_date.gte": start,
        "air_date.lte": end,
        sort_by: "popularity.desc",
        page: page.toString()
      };
      const queryString = new URLSearchParams(params).toString();
      const url = `${this.baseUrl}${endpoint}${endpoint.includes("?") ? "&" : "?"}${queryString}`;
      const response = await this.client.fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      });
      if (!response.ok) {
        return {
          hasNextPage: false,
          currentPage: 0,
          totalResults: 0,
          lastPage: 0,
          data: [],
          error: response?.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      const data = result.results.map((item) => ({
        tmdbId: item.id || null,
        name: item.name || item.title || null,
        originalName: item.original_name || item.original_title || null,
        posterImage: this.buildImageUrls(item.poster_path),
        coverImage: this.buildImageUrls(item.backdrop_path),
        country: item.origin_country?.[0] || null,
        type: "tv",
        language: item.original_language || null,
        releaseDate: item.first_air_date || null,
        summary: item.overview || null,
        genres: item.genre_ids || null,
        rating: item.vote_average || null
      }));
      return {
        hasNextPage: result.page < result.total_pages,
        currentPage: result.page,
        totalResults: result.total_results,
        lastPage: result.total_pages,
        data
      };
    } catch (error) {
      return {
        hasNextPage: false,
        currentPage: 0,
        totalResults: 0,
        lastPage: 0,
        data: [],
        error: error instanceof Error ? error.message : "Unknown error occurred"
      };
    }
  }
  /**
   * Fetches Artworks for shows
   */
  async fetchShowArtWorks(tmdbId) {
    if (!tmdbId) {
      return {
        data: null,
        error: "Missing required parameter: tmdbId",
        status: 400
      };
    }
    try {
      const queryString = new URLSearchParams({
        api_key: this.apiKey
      }).toString();
      const response = await this.client.fetch(`${this.baseUrl}/tv/${tmdbId}/images?${queryString}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      });
      if (!response.ok) {
        return {
          data: null,
          error: response?.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      const data = {
        coverImages: (result.backdrops || []).map(
          (item) => this.buildImageUrls(item.file_path, { small: "w300", medium: "w780", large: "w1280" })
        ),
        logos: (result.logos || []).map(
          (item) => this.buildImageUrls(item.file_path, { small: "w300", medium: "w780", large: "w1280" })
        ),
        posterImages: (result.posters || []).map(
          (item) => this.buildImageUrls(item.file_path, { small: "w300", medium: "w780", large: "w1280" })
        )
      };
      return { data };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Unknown error occurred",
        status: 500
      };
    }
  }
  /**
   * Fetches Artworks for movies
   */
  async fetchMovieArtWorks(tmdbId) {
    if (!tmdbId) {
      return {
        data: null,
        error: "Missing required parameter: tmdbId",
        status: 400
      };
    }
    try {
      const queryString = new URLSearchParams({
        api_key: this.apiKey
      }).toString();
      const response = await this.client.fetch(`${this.baseUrl}/movie/${tmdbId}/images?${queryString}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      });
      if (!response.ok) {
        return {
          data: null,
          error: response?.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      const data = {
        coverImages: (result.backdrops || []).map(
          (item) => this.buildImageUrls(item.file_path, { small: "w300", medium: "w780", large: "w1280" })
        ),
        logos: (result.logos || []).map(
          (item) => this.buildImageUrls(item.file_path, { small: "w300", medium: "w780", large: "w1280" })
        ),
        posterImages: (result.posters || []).map(
          (item) => this.buildImageUrls(item.file_path, { small: "w300", medium: "w780", large: "w1280" })
        )
      };
      return { data };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Unknown error occurred",
        status: 500
      };
    }
  }
  /**
   * Helper to build consistent image URL objects
   */
  buildImageUrls(path, sizes = {
    small: "w185",
    medium: "w342",
    large: "w780"
  }) {
    if (!path) {
      return { small: null, medium: null, large: null, original: null };
    }
    return {
      small: `https://image.tmdb.org/t/p/${sizes.small}${path}`,
      medium: `https://image.tmdb.org/t/p/${sizes.medium}${path}`,
      large: `https://image.tmdb.org/t/p/${sizes.large}${path}`,
      original: `https://image.tmdb.org/t/p/original${path}`
    };
  }
  /**
   * Helper to format episode data (latest / next)
   */
  formatEpisode(episode) {
    if (!episode) return null;
    return {
      episodeId: episode.id,
      title: episode.name,
      episodeNumber: episode.episode_number,
      episodeType: episode.episode_type,
      season: episode.season_number,
      summary: episode.overview,
      rating: episode.vote_average,
      airDate: episode.air_date
    };
  }
  /**
   * Automatically determines the current anime season and year
   */
  getCurrentSeasonAndYear() {
    const now = /* @__PURE__ */ new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    let season;
    if (month >= 1 && month <= 3) season = "winter";
    else if (month >= 4 && month <= 6) season = "spring";
    else if (month >= 7 && month <= 9) season = "summer";
    else season = "fall";
    return { season, year };
  }
  getSeasonDates(season, year) {
    const seasons = {
      winter: { start: `${year}-01-01`, end: `${year}-03-31` },
      spring: { start: `${year}-04-01`, end: `${year}-06-30` },
      summer: { start: `${year}-07-01`, end: `${year}-09-30` },
      fall: { start: `${year}-10-01`, end: `${year}-12-31` }
    };
    return seasons[season.toLowerCase()];
  }
  /**
   * Calculates a weekly date range with a past offset.
   * @param offsetWeeks - How many weeks to go back (default 1) very useful
   */
  getWeeklyDates(offsetWeeks = 0) {
    const now = /* @__PURE__ */ new Date();
    now.setDate(now.getDate() - offsetWeeks * 7);
    const dayOfWeek = now.getDay();
    const diffToMonday = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diffToMonday));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      start: monday.toISOString().split("T")[0],
      end: sunday.toISOString().split("T")[0]
    };
  }
  /**
   * Reusable method to fetch paginated TV show data from TMDb API.
   *
   * @private
   * @param endpoint - The API endpoint to fetch data from (e.g., '/search/tv')
   * @param params - Query parameters for the API request
   * @returns Promise resolving to paginated TV show data with metadata
   */
  async fetchPaginatedData(endpoint, params) {
    try {
      const allParams = {
        language: "en-US",
        api_key: this.apiKey,
        ...params
      };
      const queryString = new URLSearchParams(allParams).toString();
      const response = await this.client.fetch(`${this.baseUrl}${endpoint}?${queryString}`, {
        method: "GET",
        headers: {
          accept: "application/json"
        }
      });
      if (!response.ok) {
        return {
          hasNextPage: false,
          currentPage: 0,
          totalResults: 0,
          lastPage: 0,
          data: [],
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      const pagination = {
        currentPage: result.page,
        hasNextPage: result.total_pages > 1,
        totalPages: result.total_pages,
        totalResults: result.total_results
      };
      const data = result.results.map((item) => ({
        tmdbId: item.id || null,
        name: item.name || item.title || null,
        originalName: item.original_name || item.original_title || null,
        posterImage: this.buildImageUrls(item.poster_path),
        coverImage: this.buildImageUrls(item.backdrop_path),
        country: item.origin_country || null,
        type: item.media_type || null,
        language: item.original_language || null,
        releaseDate: item.first_air_date || null,
        summary: item.overview || null,
        genres: item.genre_ids || null,
        rating: item.vote_average || null
      }));
      return {
        hasNextPage: pagination.hasNextPage,
        currentPage: pagination.currentPage,
        totalResults: pagination.totalResults,
        lastPage: pagination.totalPages,
        data
      };
    } catch (error) {
      return {
        hasNextPage: false,
        currentPage: 0,
        totalResults: 0,
        lastPage: 0,
        data: [],
        error: error instanceof Error ? error.message : "Unknown error",
        status: 500
      };
    }
  }
  /**
   * Reusable method to fetch paginated movie data from TMDb API.
   *
   * @private
   * @param endpoint - The API endpoint to fetch data from (e.g., '/search/movie')
   * @param params - Query parameters for the API request
   * @returns Promise resolving to paginated movie data with metadata
   */
  async fetchPaginatedMovieData(endpoint, params) {
    try {
      const queryParams = new URLSearchParams({
        language: "en-US",
        api_key: this.apiKey,
        ...params
      }).toString();
      const response = await this.client.fetch(`${this.baseUrl}${endpoint}?${queryParams}`, {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      });
      if (!response.ok) {
        return {
          hasNextPage: false,
          currentPage: 0,
          totalResults: 0,
          lastPage: 0,
          data: [],
          error: response.statusText,
          status: response.status
        };
      }
      const result = await response.json();
      const pagination = {
        currentPage: result.page,
        hasNextPage: result.total_pages > 1,
        totalPages: result.total_pages,
        totalResults: result.total_results
      };
      const data = result.results.map((item) => ({
        tmdbId: item.id || null,
        name: item.title || null,
        originalName: item.original_title || null,
        posterImage: this.buildImageUrls(item.poster_path),
        coverImage: this.buildImageUrls(item.backdrop_path),
        language: item.original_language || null,
        releaseDate: item.release_date || null,
        summary: item.overview || null,
        genres: item.genre_ids || null,
        rating: item.vote_average || null
      }));
      return {
        hasNextPage: pagination.hasNextPage,
        currentPage: pagination.currentPage,
        totalResults: pagination.totalResults,
        lastPage: pagination.totalPages,
        data
      };
    } catch (error) {
      return {
        hasNextPage: false,
        currentPage: 0,
        totalResults: 0,
        lastPage: 0,
        data: [],
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
};
export {
  AniBD,
  AniDB,
  Anikoto,
  Anilist,
  AnimeHeaven,
  Anizone,
  Kitsu,
  TheMovieDatabase
};
