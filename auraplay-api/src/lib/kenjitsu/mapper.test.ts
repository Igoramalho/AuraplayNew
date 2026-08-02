import { describe, expect, it } from "vitest";

import { mapPlayback } from "./mapper";

describe("mapPlayback", () => {
  it("seleciona explicitamente a maior qualidade e normaliza legendas", () => {
    const result = mapPlayback({
      headers: { Referer: "https://provider.test/" },
      data: {
        subtitles: [{ file: "https://provider.test/pt.vtt", label: "Português", kind: "captions", default: true }],
        sources: [
          { url: "https://provider.test/720.m3u8", type: "hls", isM3u8: true, quality: "720p" },
          { url: "https://provider.test/1080.m3u8", type: "hls", isM3u8: true, quality: "1080p" },
        ],
      },
    }, "sub:server", "SUB", "ja");

    expect(result.selectedSourceId).toBe("sub:server:resolved:2");
    expect(result.sources?.some((source) => source.sourceId === result.selectedSourceId)).toBe(true);
    expect(result.url).toBe("https://provider.test/1080.m3u8");
    expect(result.subtitleTracks?.[0]).toMatchObject({ url: "https://provider.test/pt.vtt", label: "Português" });
  });

  it("aponta selectedSourceId para a única fonte disponível", () => {
    const result = mapPlayback({
      headers: {},
      data: { subtitles: [], sources: [{ url: "https://provider.test/video", isM3u8: false }] },
    }, "raw:default", "RAW");

    expect(result.sources).toHaveLength(1);
    expect(result.selectedSourceId).toBe(result.sources?.[0]?.sourceId);
  });
});
