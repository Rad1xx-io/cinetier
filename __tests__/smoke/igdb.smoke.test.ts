import { describe, expect, it } from "vitest";
import { getJson, hasEnv, TEST_TIMEOUT_MS, withRetry } from "./helpers";

const configured = hasEnv("TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET");

interface Game {
  id: number;
  name: string;
  cover?: { image_id: string };
}

/**
 * IGDB is reached through a Twitch token the app mints itself, so the exchange
 * is part of the integration and is checked first: credentials that stopped
 * working look exactly like a catalogue that went down.
 */
async function token(): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID!,
    client_secret: process.env.TWITCH_CLIENT_SECRET!,
    grant_type: "client_credentials",
  });
  const body = await getJson<{ access_token: string }>(
    `https://id.twitch.tv/oauth2/token?${params}`,
    { method: "POST" }
  );
  return body.access_token;
}

async function igdb<T>(accessToken: string, query: string): Promise<T> {
  const response = await fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: {
      "Client-ID": process.env.TWITCH_CLIENT_ID!,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    body: query,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from IGDB`);
  return (await response.json()) as T;
}

describe.skipIf(!configured)("IGDB", () => {
  it(
    "exchanges the Twitch credentials for a token",
    async () => {
      const accessToken = await withRetry("Twitch token", token);
      expect(accessToken.length).toBeGreaterThan(10);
    },
    TEST_TIMEOUT_MS
  );

  it(
    "finds a game by name, with the fields the mapper reads",
    async () => {
      const accessToken = await withRetry("Twitch token", token);
      const games = await withRetry("IGDB search", () =>
        igdb<Game[]>(accessToken, 'search "Elden Ring"; fields name,cover.image_id; limit 5;')
      );

      expect(games.length).toBeGreaterThan(0);
      expect(games.some((g) => g.name.toLowerCase().includes("elden ring"))).toBe(true);
      expect(typeof games[0].id).toBe("number");
    },
    TEST_TIMEOUT_MS
  );
});

describe.skipIf(configured)("IGDB (skipped)", () => {
  it("needs TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET to run", () => {
    expect(configured).toBe(false);
  });
});
