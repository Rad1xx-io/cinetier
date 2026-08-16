import { describe, expect, it } from "vitest";
import { getJson, hasEnv, TEST_TIMEOUT_MS, withRetry } from "./helpers";

const BASE = "https://www.googleapis.com/youtube/v3";
const configured = hasEnv("YOUTUBE_API_KEY");

function youtube<T>(path: string, params: Record<string, string>): Promise<T> {
  const search = new URLSearchParams({ ...params, key: process.env.YOUTUBE_API_KEY! });
  return getJson<T>(`${BASE}${path}?${search}`);
}

interface SearchResponse {
  items: { id: { channelId?: string }; snippet: { title: string } }[];
}

interface ChannelResponse {
  items: {
    id: string;
    snippet: { title: string; thumbnails?: { high?: { url: string } } };
    statistics?: { subscriberCount?: string; videoCount?: string };
  }[];
}

/**
 * The YouTube quota is the tightest of the catalogues — a search costs 100
 * units of a 10,000 daily allowance — so this suite runs two calls and no
 * more. At four scheduled runs a day that is well inside the budget.
 */
describe.skipIf(!configured)("YouTube Data API", () => {
  it(
    "finds a channel by name",
    async () => {
      const data = await withRetry("YouTube search", () =>
        youtube<SearchResponse>("/search", {
          part: "snippet",
          q: "MrBeast",
          type: "channel",
          maxResults: "3",
        })
      );

      expect(data.items.length).toBeGreaterThan(0);
      expect(data.items[0].id.channelId).toBeTruthy();
      expect(data.items[0].snippet.title).toBeTruthy();
    },
    TEST_TIMEOUT_MS
  );

  it(
    "returns the channel statistics the cards display",
    async () => {
      // Looked up by a fixed id rather than by search, which keeps this test
      // to one unit of quota instead of a hundred.
      const data = await withRetry("YouTube channel", () =>
        youtube<ChannelResponse>("/channels", {
          part: "snippet,statistics",
          id: "UCX6OQ3DkcsbYNE6H8uQQuVA",
        })
      );

      const channel = data.items[0];
      expect(channel).toBeDefined();
      expect(channel.snippet.title).toBeTruthy();
      expect(channel.snippet.thumbnails?.high?.url).toContain("http");
      // Counts arrive as strings and are parsed downstream.
      expect(Number(channel.statistics?.subscriberCount)).toBeGreaterThan(0);
    },
    TEST_TIMEOUT_MS
  );
});

describe.skipIf(configured)("YouTube (skipped)", () => {
  it("needs YOUTUBE_API_KEY to run", () => {
    expect(configured).toBe(false);
  });
});
