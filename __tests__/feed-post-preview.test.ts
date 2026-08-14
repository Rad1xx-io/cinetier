import { describe, expect, it } from "vitest";
import {
  avatarInitials,
  buildMiniBoard,
  buildTierRows,
  MINI_BOARD_PER_ROW,
  MINI_BOARD_TIERS,
  POST_DESCRIPTION_MAX,
  POST_TITLE_MAX,
  suggestedPostCategory,
  titlesByAuthor,
  validatePost,
} from "@/lib/feed/post-preview";
import type { MediaType, RankedTitle, TierOrUnrated } from "@/lib/types";

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
    expect(validatePost("   ", "")).toEqual({ ok: false, error: "Заголовок слишком короткий." });
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
