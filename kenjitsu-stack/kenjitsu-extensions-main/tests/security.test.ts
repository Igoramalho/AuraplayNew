import { describe, expect, test } from 'vitest';
import { AniBD } from '../src/provider/anime/anibd.js';

type PlayerConfigParser = {
  parsePlayerConfig(source: string): {
    videoUrl: string;
    tracks?: { label: string; file: string; default?: boolean }[];
  };
};

describe('AniBD player configuration parsing', () => {
  const parser = new AniBD() as unknown as PlayerConfigParser;

  test('extracts supported literal fields without evaluating the input', () => {
    const config = parser.parsePlayerConfig(`{
      videoUrl: '/stream/master.m3u8',
      tracks: [{ label: 'English', file: '/subs/en.vtt', default: true }]
    }`);

    expect(config).toEqual({
      videoUrl: '/stream/master.m3u8',
      tracks: [{ label: 'English', file: '/subs/en.vtt', default: true }],
    });
  });

  test('rejects executable expressions instead of interpreting them', () => {
    expect(() => parser.parsePlayerConfig(`{ videoUrl: (() => 'https://example.invalid/video.m3u8')() }`)).toThrow(
      'literal videoUrl',
    );
  });
});
