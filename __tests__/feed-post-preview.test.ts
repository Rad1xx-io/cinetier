import { describe, expect, it } from "vitest";
import {
  avatarInitials,
  buildChannelTierRows,
  buildMiniBoard,
  buildMiniChannelBoard,
  buildTierRows,
  channelsByAuthor,
  MINI_BOARD_PER_ROW,
  MINI_BOARD_TIERS,
  POST_DESCRIPTION_MAX,
  POST_TITLE_MAX,
  resolveSnapshotChannels,
  resolveSnapshotTitles,
  suggestedPostCategory,
  tierCountPhrase,
  titlesByAuthor,
  validatePost,
} from "@/lib/feed/post-preview";
import type { RankedChannelSnapshotEntry, RankedTitleSnapshotEntry } from "@/lib/supabase/feed";
import type { MediaType, RankedTitle, TierOrUnrated } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";

function title(
  tmdbId: number,
  name: string,
  tier: TierOrUnrated,
  order = 0,
  mediaType: MediaType = "movie"
): RankedTitle {
  return {
    tmdbId,
    mediaType,
    title: name,
    posterPath: null,
    releaseDate: null,
    tier,
    order,
    addedAt: tmdbId,
    updatedAt: tmdbId,
  };
}

function channel(channelId: string, name: string, tier: TierOrUnrated, order = 0): RankedChannel {
  return {
    channelId,
    title: name,
    thumbnailUrl: null,
    country: null,
    tier,
    order,
    addedAt: 0,
    updatedAt: 0,
  };
}

describe("buildTierRows", () => {
  it("returns every filled tier, in tier order", () => {
    const titles = [title(1, "F", "F"), title(2, "S", "S"), title(3, "C", "C")];

    expect(buildTierRows(titles).map((row) => row.tier)).toEqual(["S", "C", "F"]);
  });

  it("keeps every title of a tier — the dialog caps nothing", () => {
    const titles = Array.from({ length: 40 }, (_, i) => title(i, `S${i}`, "S", i));

    const rows = buildTierRows(titles);

    expect(rows).toHaveLength(1);
    expect(rows[0].titles).toHaveLength(40);
  });

  it("skips tiers nothing was put in", () => {
    const titles = [title(1, "Лучшее", "S"), title(2, "Худшее", "F")];

    expect(buildTierRows(titles).map((row) => row.tier)).toEqual(["S", "F"]);
  });

  it("drops unrated entries", () => {
    expect(buildTierRows([title(1, "Не оценён", "Unrated")])).toEqual([]);
  });

  it("orders a tier by the author's own arrangement", () => {
    const titles = [title(1, "Второй", "S", 1), title(2, "Первый", "S", 0)];

    expect(buildTierRows(titles)[0].titles.map((t) => t.title)).toEqual(["Первый", "Второй"]);
  });

  it("does not mutate the list it was given", () => {
    const titles = [title(1, "Второй", "S", 1), title(2, "Первый", "S", 0)];
    const original = [...titles];

    buildTierRows(titles);

    expect(titles).toEqual(original);
  });

  it("returns nothing for an empty board", () => {
    expect(buildTierRows([])).toEqual([]);
  });
});

describe("buildMiniBoard", () => {
  it("is a capped projection of the full rows", () => {
    const titles = [
      ...Array.from({ length: 9 }, (_, i) => title(i, `S${i}`, "S", i)),
      title(100, "A", "A"),
      title(101, "F", "F"),
    ];

    const full = buildTierRows(titles);
    const mini = buildMiniBoard(titles);

    // Same rows, fewer of them and shorter — never a different arrangement.
    expect(mini.rows.map((r) => r.tier)).toEqual(full.slice(0, mini.rows.length).map((r) => r.tier));
    expect(mini.rows[0].titles[0]).toEqual(full[0].titles[0]);
  });

  it("groups titles into rows, best tier first", () => {
    const titles = [title(1, "C", "C"), title(2, "S", "S"), title(3, "A", "A")];

    const board = buildMiniBoard(titles);

    expect(board.rows.map((row) => row.tier)).toEqual(["S", "A", "C"]);
    expect(board.hiddenCount).toBe(0);
  });

  it("puts every title of a tier in that tier's row", () => {
    const titles = [title(1, "S-1", "S", 0), title(2, "S-2", "S", 1), title(3, "B-1", "B")];

    const board = buildMiniBoard(titles);

    expect(board.rows[0].titles.map((t) => t.title)).toEqual(["S-1", "S-2"]);
    expect(board.rows[1].titles.map((t) => t.title)).toEqual(["B-1"]);
  });

  it("skips empty tiers rather than rendering them blank", () => {
    // Someone who only uses S and F should get both rows, not S plus three
    // empty ones eating the tier budget.
    const titles = [title(1, "Лучшее", "S"), title(2, "Худшее", "F")];

    const board = buildMiniBoard(titles);

    expect(board.rows.map((row) => row.tier)).toEqual(["S", "F"]);
  });

  it("shows no more than the tier limit, counting only filled tiers", () => {
    const titles = [
      title(1, "S", "S"),
      title(2, "A", "A"),
      title(3, "B", "B"),
      title(4, "C", "C"),
      title(5, "D", "D"),
      title(6, "F", "F"),
    ];

    const board = buildMiniBoard(titles);

    expect(board.rows).toHaveLength(MINI_BOARD_TIERS);
    expect(board.rows.map((row) => row.tier)).toEqual(["S", "A", "B"]);
    // The tiers that did not fit are still accounted for.
    expect(board.hiddenCount).toBe(6 - MINI_BOARD_TIERS);
  });

  it("caps how many posters one row shows", () => {
    const titles = Array.from({ length: MINI_BOARD_PER_ROW + 4 }, (_, i) =>
      title(i, `S${i}`, "S", i)
    );

    const board = buildMiniBoard(titles);

    expect(board.rows[0].titles).toHaveLength(MINI_BOARD_PER_ROW);
    expect(board.hiddenCount).toBe(4);
  });

  it("counts overflow inside rows and whole hidden tiers together", () => {
    const titles = [
      ...Array.from({ length: 7 }, (_, i) => title(i, `S${i}`, "S", i)),
      title(100, "A", "A"),
      title(101, "B", "B"),
      title(102, "C", "C"),
      title(103, "D", "D"),
      title(104, "F", "F"),
    ];

    const board = buildMiniBoard(titles);

    // 12 rated in total; six from S plus one each from A and B are shown.
    expect(board.hiddenCount).toBe(12 - 8);
  });

  it("leaves unrated entries out of the board entirely", () => {
    const titles = [title(1, "Не оценён", "Unrated"), title(2, "Оценён", "B")];

    const board = buildMiniBoard(titles);

    expect(board.rows).toHaveLength(1);
    expect(board.rows[0].tier).toBe("B");
    // An unrated pile is not "hidden" — it was never part of the preview.
    expect(board.hiddenCount).toBe(0);
  });

  it("respects the author's own order inside a tier", () => {
    const titles = [title(1, "Второй", "S", 1), title(2, "Первый", "S", 0)];

    expect(buildMiniBoard(titles).rows[0].titles.map((t) => t.title)).toEqual([
      "Первый",
      "Второй",
    ]);
  });

  it("is stable across calls", () => {
    const titles = [title(1, "Б", "S", 0), title(2, "А", "S", 0)];

    expect(buildMiniBoard(titles)).toEqual(buildMiniBoard(titles));
    expect(buildMiniBoard(titles).rows[0].titles.map((t) => t.title)).toEqual(["А", "Б"]);
  });

  it("honours custom limits", () => {
    const titles = [title(1, "S", "S"), title(2, "A", "A"), title(3, "B", "B")];

    const board = buildMiniBoard(titles, { maxTiers: 2, perRow: 1 });

    expect(board.rows).toHaveLength(2);
    expect(board.hiddenCount).toBe(1);
  });

  it("handles an empty board", () => {
    expect(buildMiniBoard([])).toEqual({ rows: [], hiddenCount: 0 });
  });

  it("does not mutate the list it was given", () => {
    const titles = [title(1, "Второй", "S", 1), title(2, "Первый", "S", 0)];
    const original = [...titles];

    buildMiniBoard(titles);

    expect(titles).toEqual(original);
  });
});

describe("titlesByAuthor", () => {
  it("splits one flat query per author", () => {
    const rows = [
      { ...title(1, "A-топ", "S"), userId: "a" },
      { ...title(2, "B-топ", "S"), userId: "b" },
      { ...title(3, "A-слабый", "F"), userId: "a" },
    ];

    const grouped = titlesByAuthor(rows);

    expect(grouped.get("a")?.map((t) => t.title)).toEqual(["A-топ", "A-слабый"]);
    expect(grouped.get("b")?.map((t) => t.title)).toEqual(["B-топ"]);
  });

  it("keeps everything — each card decides how much of it to show", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      ...title(i, `Ф${i}`, "S", i),
      userId: "a",
    }));

    expect(titlesByAuthor(rows).get("a")).toHaveLength(30);
  });

  it("returns an empty map for no rows", () => {
    expect(titlesByAuthor([]).size).toBe(0);
  });
});

describe("validatePost", () => {
  it("accepts an ordinary post", () => {
    expect(validatePost("Мой топ", "Почему именно так")).toEqual({ ok: true });
  });

  it("rejects a title that is only whitespace", () => {
    expect(validatePost("   ", "")).toEqual({ ok: false, error: "The title is too short." });
  });

  it("rejects a title under the minimum", () => {
    expect(validatePost("ок", "").ok).toBe(false);
  });

  it("rejects a title over the maximum", () => {
    expect(validatePost("я".repeat(POST_TITLE_MAX + 1), "").ok).toBe(false);
  });

  it("accepts a title exactly at the maximum", () => {
    expect(validatePost("я".repeat(POST_TITLE_MAX), "").ok).toBe(true);
  });

  it("rejects an over-long description", () => {
    expect(validatePost("Заголовок", "д".repeat(POST_DESCRIPTION_MAX + 1)).ok).toBe(false);
  });

  it("accepts an empty description", () => {
    expect(validatePost("Заголовок", "").ok).toBe(true);
  });
});

describe("suggestedPostCategory", () => {
  it("names the kind that makes up most of the board", () => {
    const titles = [
      title(1, "Ф", "S", 0, "movie"),
      title(2, "Ф", "A", 1, "movie"),
      title(3, "Ф", "B", 2, "movie"),
      title(4, "И", "S", 0, "game"),
    ];

    expect(suggestedPostCategory(titles)).toBe("movie");
  });

  it("falls back to mixed when nothing holds a majority", () => {
    const titles = [
      title(1, "Ф", "S", 0, "movie"),
      title(2, "И", "S", 0, "game"),
      title(3, "А", "S", 0, "anime"),
    ];

    expect(suggestedPostCategory(titles)).toBe("mixed");
  });

  it("counts channels as their own category", () => {
    const channels = [{ tier: "S" }, { tier: "A" }, { tier: "B" }];

    expect(suggestedPostCategory([title(1, "Ф", "S")], channels)).toBe("youtube");
  });

  it("returns mixed for an empty board", () => {
    expect(suggestedPostCategory([])).toBe("mixed");
  });

  it("treats an exact half as mixed, not a theme", () => {
    const titles = [
      title(1, "Ф", "S", 0, "movie"),
      title(2, "Ф", "A", 1, "movie"),
      title(3, "И", "S", 0, "game"),
      title(4, "И", "A", 1, "game"),
    ];

    expect(suggestedPostCategory(titles)).toBe("mixed");
  });
});

describe("avatarInitials", () => {
  it("uses the first letters of a two-word display name", () => {
    expect(avatarInitials("Денис Радов", "rad1xx")).toBe("ДР");
  });

  it("falls back to the username when there is no display name", () => {
    expect(avatarInitials(null, "rad1xx")).toBe("RA");
    expect(avatarInitials("   ", "rad1xx")).toBe("RA");
  });

  it("drops a leading @", () => {
    expect(avatarInitials(null, "@rad1xx")).toBe("RA");
  });

  it("copes with a one-character handle", () => {
    expect(avatarInitials(null, "r")).toBe("R");
  });
});

describe("resolveSnapshotTitles", () => {
  it("shows the whole live board when there is no snapshot yet — a post published before this existed", () => {
    const live = [title(1, "A", "S"), title(2, "B", "A")];
    expect(resolveSnapshotTitles(undefined, live)).toBe(live);
  });

  it("uses the snapshot's placement, not whatever the live row currently says", () => {
    // The author has since re-tiered this one from S to F and moved it — the
    // post must go on showing where it stood when Publish was pressed.
    const live = [title(1, "A", "F", 9)];
    const snapshot: RankedTitleSnapshotEntry[] = [{ tmdbId: 1, mediaType: "movie", tier: "S", order: 0 }];

    const resolved = resolveSnapshotTitles(snapshot, live);

    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ tier: "S", order: 0, title: "A" });
  });

  it("takes the catalogue facts — name, poster, date — from the live row", () => {
    const live = [
      { ...title(1, "Renamed Since", "F"), posterPath: "/new.jpg", releaseDate: "2030-01-01" },
    ];
    const snapshot: RankedTitleSnapshotEntry[] = [{ tmdbId: 1, mediaType: "movie", tier: "S", order: 0 }];

    const resolved = resolveSnapshotTitles(snapshot, live);

    expect(resolved[0]).toMatchObject({
      title: "Renamed Since",
      posterPath: "/new.jpg",
      releaseDate: "2030-01-01",
    });
  });

  it("drops a title the author has since un-ranked, rather than inventing one", () => {
    // The exact case this whole feature exists for: a title taken down after
    // publishing should leave a gap, not a crash and not a stale poster.
    const live: RankedTitle[] = [];
    const snapshot: RankedTitleSnapshotEntry[] = [{ tmdbId: 1, mediaType: "movie", tier: "S", order: 0 }];

    expect(resolveSnapshotTitles(snapshot, live)).toEqual([]);
  });

  it("tells two media types with the same tmdb id apart", () => {
    const live = [title(1, "The Movie", "S", 0, "movie"), title(1, "The Anime", "A", 0, "anime")];
    const snapshot: RankedTitleSnapshotEntry[] = [{ tmdbId: 1, mediaType: "anime", tier: "S", order: 0 }];

    const resolved = resolveSnapshotTitles(snapshot, live);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].title).toBe("The Anime");
  });
});

describe("buildChannelTierRows", () => {
  it("returns every filled tier, in tier order", () => {
    const channels = [channel("f", "F", "F"), channel("s", "S", "S"), channel("c", "C", "C")];

    expect(buildChannelTierRows(channels).map((row) => row.tier)).toEqual(["S", "C", "F"]);
  });

  it("skips tiers nothing was put in", () => {
    const channels = [channel("s", "Лучший", "S"), channel("f", "Худший", "F")];

    expect(buildChannelTierRows(channels).map((row) => row.tier)).toEqual(["S", "F"]);
  });

  it("drops unrated entries", () => {
    expect(buildChannelTierRows([channel("u", "Не оценён", "Unrated")])).toEqual([]);
  });

  it("orders a tier by the author's own arrangement", () => {
    const channels = [channel("b", "Второй", "S", 1), channel("a", "Первый", "S", 0)];

    expect(buildChannelTierRows(channels)[0].channels.map((c) => c.title)).toEqual([
      "Первый",
      "Второй",
    ]);
  });

  it("returns nothing for an empty board", () => {
    expect(buildChannelTierRows([])).toEqual([]);
  });
});

describe("buildMiniChannelBoard", () => {
  it("shows no more than the tier limit, counting only filled tiers", () => {
    const channels = [
      channel("s", "S", "S"),
      channel("a", "A", "A"),
      channel("b", "B", "B"),
      channel("c", "C", "C"),
      channel("d", "D", "D"),
      channel("f", "F", "F"),
    ];

    const board = buildMiniChannelBoard(channels);

    expect(board.rows).toHaveLength(MINI_BOARD_TIERS);
    expect(board.rows.map((row) => row.tier)).toEqual(["S", "A", "B"]);
    expect(board.hiddenCount).toBe(6 - MINI_BOARD_TIERS);
  });

  it("caps how many avatars one row shows", () => {
    const channels = Array.from({ length: MINI_BOARD_PER_ROW + 4 }, (_, i) =>
      channel(`c${i}`, `S${i}`, "S", i)
    );

    const board = buildMiniChannelBoard(channels);

    expect(board.rows[0].channels).toHaveLength(MINI_BOARD_PER_ROW);
    expect(board.hiddenCount).toBe(4);
  });

  it("handles an empty board", () => {
    expect(buildMiniChannelBoard([])).toEqual({ rows: [], hiddenCount: 0 });
  });
});

describe("channelsByAuthor", () => {
  it("splits one flat query per author", () => {
    const rows = [
      { ...channel("a1", "A-топ", "S"), userId: "a" },
      { ...channel("b1", "B-топ", "S"), userId: "b" },
      { ...channel("a2", "A-слабый", "F"), userId: "a" },
    ];

    const grouped = channelsByAuthor(rows);

    expect(grouped.get("a")?.map((c) => c.title)).toEqual(["A-топ", "A-слабый"]);
    expect(grouped.get("b")?.map((c) => c.title)).toEqual(["B-топ"]);
  });

  it("returns an empty map for no rows", () => {
    expect(channelsByAuthor([]).size).toBe(0);
  });
});

describe("resolveSnapshotChannels", () => {
  it("shows the whole live board when there is no snapshot yet — a post published before this existed", () => {
    const live = [channel("a", "A", "S"), channel("b", "B", "A")];
    expect(resolveSnapshotChannels(undefined, live)).toBe(live);
  });

  it("uses the snapshot's placement, not whatever the live row currently says", () => {
    const live = [channel("a", "A", "F", 9)];
    const snapshot: RankedChannelSnapshotEntry[] = [{ channelId: "a", tier: "S", order: 0 }];

    const resolved = resolveSnapshotChannels(snapshot, live);

    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ tier: "S", order: 0, title: "A" });
  });

  it("takes the live channel's own name and avatar rather than freezing them", () => {
    const live = [{ ...channel("a", "Renamed Since", "F"), thumbnailUrl: "https://example.com/new.jpg" }];
    const snapshot: RankedChannelSnapshotEntry[] = [{ channelId: "a", tier: "S", order: 0 }];

    const resolved = resolveSnapshotChannels(snapshot, live);

    expect(resolved[0]).toMatchObject({
      title: "Renamed Since",
      thumbnailUrl: "https://example.com/new.jpg",
    });
  });

  it("drops a channel the author has since un-ranked, rather than inventing one", () => {
    const live: RankedChannel[] = [];
    const snapshot: RankedChannelSnapshotEntry[] = [{ channelId: "a", tier: "S", order: 0 }];

    expect(resolveSnapshotChannels(snapshot, live)).toEqual([]);
  });
});

describe("tierCountPhrase", () => {
  it("uses the singular for exactly one row", () => {
    expect(tierCountPhrase(1)).toBe("one tier");
  });

  it("uses the count for anything else, including zero", () => {
    expect(tierCountPhrase(0)).toBe("0 tiers");
    expect(tierCountPhrase(3)).toBe("3 tiers");
  });
});
