import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { RankedTitle, TierOrUnrated, MediaType } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";

const createBattle = vi.fn();
const trackEvent = vi.fn();

vi.mock("@/lib/supabase/battles", () => ({
  createBattle: (...args: unknown[]) => createBattle(...args),
}));
vi.mock("@/lib/analytics/tracker", () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));

const { CreateBattleModal } = await import("@/components/battle/create-battle-modal");
const { MIN_POOL_SIZE, MAX_POOL_SIZE, DEFAULT_POOL_SIZE } = await import("@/lib/battle/pool");
const { BATTLE_PRESETS } = await import("@/lib/battle/presets");

function title(
  id: number,
  name: string,
  tier: TierOrUnrated,
  mediaType: MediaType = "movie"
): RankedTitle {
  return {
    tmdbId: id,
    mediaType,
    title: name,
    posterPath: null,
    releaseDate: null,
    tier,
    order: id,
    addedAt: id,
    updatedAt: id,
  };
}

/** Enough rated films to clear the minimum, plus noise that must be filtered out. */
const titles: RankedTitle[] = [
  title(1, "Фильм A", "S"),
  title(2, "Фильм B", "A"),
  title(3, "Фильм C", "B"),
  title(4, "Сериал D", "S", "tv"),
  title(5, "Фильм E", "C"),
  title(6, "Неоценённый", "Unrated"),
  title(7, "Аниме A", "S", "anime"),
  title(8, "Игра A", "B", "game"),
];

const writeText = vi.fn().mockResolvedValue(undefined);

function open(list: RankedTitle[] = titles, list2: RankedChannel[] = []) {
  return render(<CreateBattleModal open onClose={vi.fn()} titles={list} channels={list2} />);
}

function channel(id: string, name: string, tier: TierOrUnrated, order = 0): RankedChannel {
  return {
    channelId: id,
    title: name,
    thumbnailUrl: null,
    country: null,
    tier,
    order,
    addedAt: order,
    updatedAt: order,
  };
}

/** The item rows, excluding the category tabs and footer buttons. */
function itemButtons(): HTMLElement[] {
  return screen.queryAllByRole("listitem").map((li) => within(li).getAllByRole("button")[0]);
}

/** Row labels only. The poster placeholder repeats the title, so reading the
 *  rows beats a text query that would match both copies. */
function itemTitles(): string[] {
  return itemButtons().map((b) => b.textContent ?? "");
}

/** A category tab, scoped to the tab group so item rows cannot match it. */
function categoryTab(name: RegExp): HTMLButtonElement {
  const group = screen.getByRole("group", { name: "Категория батла" });
  return within(group).getByRole("button", { name }) as HTMLButtonElement;
}

beforeEach(() => {
  createBattle.mockResolvedValue("battle-xyz");
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  Object.defineProperty(window, "location", {
    value: { origin: "https://cinetier.app" },
    configurable: true,
  });
  // jsdom implements <dialog> but not showModal in every version; a no-op keeps
  // the component's open/close effect from throwing.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  Reflect.deleteProperty(navigator, "share");
});

describe("CreateBattleModal — choosing the pool", () => {
  it("opens on the category with the most rated titles", () => {
    open();

    // Four rated films/series beats one anime and one game.
    expect(categoryTab(/^Кино/).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/Выбрано 5 из 5/)).toBeDefined();
  });

  it("leaves unrated titles out of the pool", () => {
    open();

    expect(screen.queryByText("Неоценённый")).toBeNull();
  });

  it("keeps films and series together but other categories apart", () => {
    open();

    expect(itemTitles().some((t) => t.includes("Сериал D"))).toBe(true);
    expect(itemTitles().some((t) => t.includes("Аниме A"))).toBe(false);
    expect(itemTitles().some((t) => t.includes("Игра A"))).toBe(false);
  });

  it("orders the pool by tier, best first", () => {
    open();

    const names = itemButtons().map((b) => b.textContent);
    expect(names[0]).toContain("Фильм A");
    expect(names[1]).toContain("Сериал D");
    expect(names[names.length - 1]).toContain("Фильм E");
  });

  it("switches the pool when another category is chosen", () => {
    open();

    fireEvent.click(categoryTab(/^Аниме/));

    expect(itemTitles().some((t) => t.includes("Аниме A"))).toBe(true);
    expect(itemTitles().some((t) => t.includes("Фильм A"))).toBe(false);
  });

  it("disables a category with nothing rated in it", () => {
    open([title(1, "Только кино", "S")]);

    expect(categoryTab(/^Игры/).disabled).toBe(true);
  });

  it("opens capped at the default size, not the maximum", () => {
    const many = Array.from({ length: MAX_POOL_SIZE + 8 }, (_, i) =>
      title(i + 1, `Фильм ${i + 1}`, "A")
    );
    open(many);

    expect(itemButtons()).toHaveLength(DEFAULT_POOL_SIZE);
  });

  it("lets the creator raise the cap to the maximum", () => {
    const many = Array.from({ length: MAX_POOL_SIZE + 8 }, (_, i) =>
      title(i + 1, `Фильм ${i + 1}`, "A")
    );
    open(many);

    fireEvent.change(screen.getByLabelText(/Максимум позиций/), {
      target: { value: String(MAX_POOL_SIZE) },
    });

    expect(itemButtons()).toHaveLength(MAX_POOL_SIZE);
  });

  it("lets the creator lower the cap", () => {
    open();

    fireEvent.change(screen.getByLabelText(/Максимум позиций/), { target: { value: "5" } });

    expect(itemButtons()).toHaveLength(5);
  });

  it("drops an item from the selection when it is unticked", () => {
    open();

    fireEvent.click(itemButtons()[0]);

    expect(screen.getByText(/Выбрано 4 из 5/)).toBeDefined();
    expect(itemButtons()[0].getAttribute("aria-pressed")).toBe("false");
  });

  it("puts an unticked item back on a second click", () => {
    open();

    fireEvent.click(itemButtons()[0]);
    fireEvent.click(itemButtons()[0]);

    expect(screen.getByText(/Выбрано 5 из 5/)).toBeDefined();
  });
});

describe("CreateBattleModal — guardrails", () => {
  it("refuses to create a battle below the minimum", () => {
    open([title(1, "Один", "S"), title(2, "Два", "A")]);

    const create = screen.getByRole("button", { name: "Создать батл" }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    expect(screen.getByText(new RegExp(`минимум ${MIN_POOL_SIZE} позиций`))).toBeDefined();
  });

  it("blocks creation once too many items are unticked", () => {
    open();

    fireEvent.click(itemButtons()[0]);

    expect((screen.getByRole("button", { name: "Создать батл" }) as HTMLButtonElement).disabled)
      .toBe(true);
  });

  it("explains an empty pool instead of showing a bare list", () => {
    // Nothing rated anywhere: every tab is empty, so the default category has
    // no pool to offer. Switching *into* an empty category is impossible — that
    // tab is disabled — so this is the only way the state is reached.
    open([title(1, "Неоценённый", "Unrated")]);

    expect(screen.getByText(/пока нет подходящих позиций/)).toBeDefined();
    expect(itemButtons()).toHaveLength(0);
    expect((screen.getByRole("button", { name: "Создать батл" }) as HTMLButtonElement).disabled)
      .toBe(true);
  });
});

describe("CreateBattleModal — creating", () => {
  it("sends the selected items and the creator's tiers", async () => {
    open();

    fireEvent.click(screen.getByRole("button", { name: "Создать батл" }));

    await waitFor(() => expect(createBattle).toHaveBeenCalledTimes(1));
    const [category, items, ratings] = createBattle.mock.calls[0];

    expect(category).toBe("cinema");
    expect(items).toHaveLength(5);
    expect(items[0]).toEqual({ id: "movie-1", title: "Фильм A", category: "cinema" });
    expect(ratings).toEqual({
      "movie-1": "S",
      "tv-4": "S",
      "movie-2": "A",
      "movie-3": "B",
      "movie-5": "C",
    });
  });

  it("excludes unticked items from what it sends", async () => {
    const many = Array.from({ length: 6 }, (_, i) => title(i + 1, `Фильм ${i + 1}`, "A"));
    open(many);

    fireEvent.click(itemButtons()[0]);
    fireEvent.click(screen.getByRole("button", { name: "Создать батл" }));

    await waitFor(() => expect(createBattle).toHaveBeenCalledTimes(1));
    const [, items] = createBattle.mock.calls[0];
    expect(items).toHaveLength(5);
    expect(items.map((i: { id: string }) => i.id)).not.toContain("movie-1");
  });

  it("shows the link and reports the event once the battle exists", async () => {
    open();

    fireEvent.click(screen.getByRole("button", { name: "Создать батл" }));

    expect(await screen.findByText("https://cinetier.app/battle/battle-xyz")).toBeDefined();
    expect(screen.getByText("Ссылка готова!")).toBeDefined();
    expect(trackEvent).toHaveBeenCalledWith("battle_created", {
      battle_id: "battle-xyz",
      category: "cinema",
      items_count: 5,
      source: "list",
    });
  });

  it("keeps the picker and explains itself when creation fails", async () => {
    createBattle.mockResolvedValue(null);
    open();

    fireEvent.click(screen.getByRole("button", { name: "Создать батл" }));

    expect(await screen.findByText(/Не удалось создать батл/)).toBeDefined();
    expect(screen.queryByText("Ссылка готова!")).toBeNull();
    expect(trackEvent).not.toHaveBeenCalled();
    // The picker survives, so a retry does not mean rebuilding the selection.
    expect(screen.getByRole("button", { name: "Создать батл" })).toBeDefined();
  });
});

describe("CreateBattleModal — sharing the link", () => {
  it("copies the link when there is no share sheet", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Создать батл" }));
    fireEvent.click(await screen.findByRole("button", { name: /Поделиться ссылкой/ }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("https://cinetier.app/battle/battle-xyz")
    );
    expect(await screen.findByText("Ссылка скопирована")).toBeDefined();
  });

  it("prefers the native share sheet where it exists", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });

    open();
    fireEvent.click(screen.getByRole("button", { name: "Создать батл" }));
    fireEvent.click(await screen.findByRole("button", { name: /Поделиться ссылкой/ }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to copying when the share sheet is dismissed", async () => {
    Object.defineProperty(navigator, "share", {
      value: vi.fn().mockRejectedValue(new Error("AbortError")),
      configurable: true,
    });

    open();
    fireEvent.click(screen.getByRole("button", { name: "Создать батл" }));
    fireEvent.click(await screen.findByRole("button", { name: /Поделиться ссылкой/ }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("https://cinetier.app/battle/battle-xyz")
    );
  });
});

describe("CreateBattleModal — YouTube channels", () => {
  const channels: RankedChannel[] = [
    channel("UC-1", "Канал A", "S", 0),
    channel("UC-2", "Канал B", "A", 1),
    channel("UC-3", "Канал C", "B", 2),
    channel("UC-4", "Канал D", "C", 3),
    channel("UC-5", "Канал E", "D", 4),
  ];

  it("offers YouTube as a category of its own", () => {
    open([], channels);

    expect(categoryTab(/^YouTube/).disabled).toBe(false);
    expect(categoryTab(/^YouTube/).getAttribute("aria-pressed")).toBe("true");
  });

  it("opens on channels when they outnumber every catalog", () => {
    open([title(1, "Один фильм", "S")], channels);

    expect(categoryTab(/^YouTube/).getAttribute("aria-pressed")).toBe("true");
    expect(itemTitles().some((t) => t.includes("Канал A"))).toBe(true);
  });

  it("keeps channels out of the film pool and films out of the channel pool", () => {
    open(titles, channels);

    fireEvent.click(categoryTab(/^Кино/));
    expect(itemTitles().some((t) => t.includes("Канал A"))).toBe(false);

    fireEvent.click(categoryTab(/^YouTube/));
    expect(itemTitles().some((t) => t.includes("Фильм A"))).toBe(false);
  });

  it("disables the YouTube tab when nothing is rated there", () => {
    open(titles, []);

    expect(categoryTab(/^YouTube/).disabled).toBe(true);
  });

  it("leaves an unrated channel out of the pool", () => {
    open([], [...channels, channel("UC-x", "Неоценённый", "Unrated", 9)]);

    expect(itemTitles().some((t) => t.includes("Неоценённый"))).toBe(false);
    expect(itemButtons()).toHaveLength(channels.length);
  });

  it("creates a youtube battle with channel ids and tiers", async () => {
    open([], channels);

    fireEvent.click(screen.getByRole("button", { name: "Создать батл" }));

    await waitFor(() => expect(createBattle).toHaveBeenCalledTimes(1));
    const [category, items, ratings] = createBattle.mock.calls[0];

    expect(category).toBe("youtube");
    expect(items[0]).toEqual({ id: "youtube-UC-1", title: "Канал A", category: "youtube" });
    expect(ratings).toEqual({
      "youtube-UC-1": "S",
      "youtube-UC-2": "A",
      "youtube-UC-3": "B",
      "youtube-UC-4": "C",
      "youtube-UC-5": "D",
    });
  });

  it("reports the category on the created event", async () => {
    open([], channels);

    fireEvent.click(screen.getByRole("button", { name: "Создать батл" }));

    await waitFor(() => expect(trackEvent).toHaveBeenCalled());
    expect(trackEvent).toHaveBeenCalledWith("battle_created", {
      battle_id: "battle-xyz",
      category: "youtube",
      items_count: 5,
      source: "list",
    });
  });
});

/** A tier toggle in the "which tiers take part" fieldset. */
function tierToggle(tier: string): HTMLButtonElement {
  const group = screen.getByRole("group", { name: /Тиры в батле/ });
  return within(group).getByRole("button", { name: new RegExp(`^${tier}`) }) as HTMLButtonElement;
}

describe("CreateBattleModal — tier filter", () => {
  const spread: RankedTitle[] = [
    title(1, "S-фильм", "S"),
    title(2, "A-фильм", "A"),
    title(3, "B-фильм", "B"),
    title(4, "C-фильм", "C"),
    title(5, "D-фильм", "D"),
    title(6, "F-фильм", "F"),
  ];

  it("starts with every tier taking part", () => {
    open(spread);

    for (const tier of ["S", "A", "B", "C", "D", "F"]) {
      expect(tierToggle(tier).getAttribute("aria-pressed")).toBe("true");
    }
    expect(itemButtons()).toHaveLength(6);
  });

  it("drops a tier from the pool when it is switched off", () => {
    open(spread);

    fireEvent.click(tierToggle("S"));

    expect(itemTitles().some((t) => t.includes("S-фильм"))).toBe(false);
    expect(itemButtons()).toHaveLength(5);
  });

  it("can build a battle out of the worst tiers alone", async () => {
    const trash: RankedTitle[] = [
      ...spread,
      title(7, "D-два", "D"),
      title(8, "D-три", "D"),
      title(9, "F-два", "F"),
      title(10, "F-три", "F"),
    ];
    open(trash);

    for (const tier of ["S", "A", "B", "C"]) fireEvent.click(tierToggle(tier));
    fireEvent.click(screen.getByRole("button", { name: "Создать батл" }));

    await waitFor(() => expect(createBattle).toHaveBeenCalledTimes(1));
    const [, , ratings] = createBattle.mock.calls[0];
    expect(new Set(Object.values(ratings))).toEqual(new Set(["D", "F"]));
  });

  it("shows how many entries each tier would contribute", () => {
    open(spread);

    expect(tierToggle("S").textContent).toContain("1");
  });

  it("disables a tier nothing is ranked in", () => {
    open([title(1, "Только S", "S")]);

    expect(tierToggle("F").disabled).toBe(true);
  });
});

describe("CreateBattleModal — presets", () => {
  function openPresets(list: RankedTitle[] = []) {
    open(list);
    fireEvent.click(screen.getByRole("button", { name: /Подборки/ }));
  }

  /** The inline tier pickers, one per entry the creator has not rated yet. */
  function unratedRows(): HTMLElement[] {
    return screen
      .queryAllByRole("group")
      .filter((g) => (g.getAttribute("aria-label") ?? "").startsWith("Оценить"));
  }

  /** Rates the first `count` unrated entries, whatever the shuffle dealt. */
  function rateFirst(count: number, tier = "A") {
    for (let i = 0; i < count; i++) {
      const group = unratedRows()[0];
      fireEvent.click(within(group).getByRole("button", { name: new RegExp(`: ${tier}$`) }));
    }
  }

  it("offers the ready-made sets", () => {
    openPresets();

    expect(screen.getByRole("button", { name: /Современная классика/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Игры, о которых спорят/ })).toBeDefined();
  });

  it("deals only as many entries as the slider allows", () => {
    openPresets();

    // The pool is far larger than one battle uses — that is what makes a reroll
    // worth having.
    expect(itemButtons()).toHaveLength(DEFAULT_POOL_SIZE);
    expect(screen.getByText(new RegExp(`из ${DEFAULT_POOL_SIZE}`))).toBeDefined();
  });

  it("says how big the pool behind the set is", () => {
    openPresets();

    expect(screen.getByText(/\d+ позиций в пуле/)).toBeDefined();
  });

  it("lists preset entries with no tier until the creator gives one", () => {
    openPresets();

    expect(screen.getByText(/Выбрано 0 из/)).toBeDefined();
  });

  it("offers a blind pass instead of blocking when nothing is rated", () => {
    openPresets();

    // The old behaviour refused to go on. Picking a set you have not worked
    // through is the normal case, so it now leads into rating it yourself.
    const submit = screen.getByRole("button", { name: /Оценить и создать/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    expect(screen.getByText(/сначала пройдёте набор сами/)).toBeDefined();
  });

  it("counts an entry once the creator rates it inline", () => {
    openPresets();

    rateFirst(1);

    expect(screen.getByText(/Выбрано 1 из/)).toBeDefined();
  });

  it("keeps a rating when the hand is reshuffled", () => {
    openPresets();

    const rated = unratedRows()[0].getAttribute("aria-label");
    rateFirst(1);
    fireEvent.click(screen.getByRole("button", { name: /Перемешать/ }));

    // The entry may or may not be dealt again, but if it is, it keeps its tier
    // rather than reverting to unrated.
    const stillUnrated = unratedRows().map((g) => g.getAttribute("aria-label"));
    expect(stillUnrated).not.toContain(rated);
  });

  it("deals a different hand on reroll", () => {
    openPresets();
    const first = itemTitles().join("|");

    fireEvent.click(screen.getByRole("button", { name: /Перемешать/ }));

    expect(itemTitles().join("|")).not.toBe(first);
  });

  it("rerolls when the same set is picked again", () => {
    openPresets();
    const first = itemTitles().join("|");

    fireEvent.click(screen.getByRole("button", { name: /Современная классика/ }));

    expect(itemTitles().join("|")).not.toBe(first);
  });

  it("does not reshuffle when an unrelated control moves", () => {
    openPresets();
    const before = itemTitles().join("|");

    rateFirst(1);

    // Rating an entry must not deal a new hand under the creator's hand.
    expect(itemTitles().join("|")).toBe(before);
  });

  it("creates a battle straight away once everything on offer is rated", async () => {
    openPresets();
    fireEvent.change(screen.getByLabelText(/Максимум позиций/), {
      target: { value: String(MIN_POOL_SIZE) },
    });

    rateFirst(MIN_POOL_SIZE);
    // Nothing left unrated, so no pass is needed and the label says so.
    fireEvent.click(screen.getByRole("button", { name: "Создать батл" }));

    await waitFor(() => expect(createBattle).toHaveBeenCalledTimes(1));
    const [category, items, ratings] = createBattle.mock.calls[0];

    expect(category).toBe("cinema");
    expect(items).toHaveLength(MIN_POOL_SIZE);
    expect(Object.keys(ratings)).toHaveLength(MIN_POOL_SIZE);
    expect(new Set(Object.values(ratings))).toEqual(new Set(["A"]));
    expect(items.every((i: { id: string }) => i.id.startsWith("movie-"))).toBe(true);
  });

  it("records the preset it came from", async () => {
    openPresets();
    fireEvent.change(screen.getByLabelText(/Максимум позиций/), {
      target: { value: String(MIN_POOL_SIZE) },
    });

    rateFirst(MIN_POOL_SIZE);
    fireEvent.click(screen.getByRole("button", { name: "Создать батл" }));

    await waitFor(() => expect(trackEvent).toHaveBeenCalled());
    expect(trackEvent).toHaveBeenCalledWith("battle_created", {
      battle_id: "battle-xyz",
      category: "cinema",
      items_count: MIN_POOL_SIZE,
      source: "preset",
      preset: "modern-classics",
    });
  });
});

describe("CreateBattleModal — the author's own blind pass", () => {
  function openPresets(list: RankedTitle[] = []) {
    open(list);
    fireEvent.click(screen.getByRole("button", { name: /Подборки/ }));
  }

  function setSize(n: number) {
    fireEvent.change(screen.getByLabelText(/Максимум позиций/), { target: { value: String(n) } });
  }

  function startPass() {
    fireEvent.click(screen.getByRole("button", { name: /Оценить и создать/ }));
  }

  /** A tier button in the one-card-at-a-time voting screen. */
  function voteTier(tier: string) {
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${tier} —`) }));
  }

  function skipCard() {
    fireEvent.click(screen.getByRole("button", { name: /Пропустить/ }));
  }

  it("opens the voting screen instead of writing anything", () => {
    openPresets();
    setSize(MIN_POOL_SIZE);

    startPass();

    expect(screen.getByText("Сначала оцените сами")).toBeDefined();
    expect(screen.getByText(`Позиция 1 из ${MIN_POOL_SIZE}`)).toBeDefined();
    // Nothing is stored until the pass finishes — a half-rated battle must never
    // exist for a friend to open.
    expect(createBattle).not.toHaveBeenCalled();
  });

  it("creates the battle from what the author answered during the pass", async () => {
    openPresets();
    setSize(MIN_POOL_SIZE);
    startPass();

    for (let i = 0; i < MIN_POOL_SIZE; i++) voteTier("B");

    await waitFor(() => expect(createBattle).toHaveBeenCalledTimes(1));
    const [category, items, ratings] = createBattle.mock.calls[0];

    expect(category).toBe("cinema");
    expect(items).toHaveLength(MIN_POOL_SIZE);
    expect(new Set(Object.values(ratings))).toEqual(new Set(["B"]));
  });

  it("hands back the link once the pass is done", async () => {
    openPresets();
    setSize(MIN_POOL_SIZE);
    startPass();

    for (let i = 0; i < MIN_POOL_SIZE; i++) voteTier("A");

    expect(await screen.findByText("https://cinetier.app/battle/battle-xyz")).toBeDefined();
    expect(screen.getByText("Ссылка готова!")).toBeDefined();
  });

  it("only asks about entries the author has not ranked", () => {
    // Deal the whole pool so the hand is known, then put most of it on the
    // author's own board. The shuffle makes any smaller hand non-deterministic.
    const preset = BATTLE_PRESETS[0];
    const owned = preset.items.slice(0, preset.items.length - 3).map((item) => {
      const [mediaType, id] = item.id.split("-");
      return title(Number(id), item.title, "A", mediaType as MediaType);
    });

    openPresets(owned);
    setSize(MAX_POOL_SIZE);
    startPass();

    // Only the three it has never seen: an opinion already on their board is not
    // asked for a second time.
    expect(screen.getByText("Позиция 1 из 3")).toBeDefined();
  });

  it("keeps a tier given inline and does not re-ask for it", () => {
    openPresets();
    setSize(MIN_POOL_SIZE);

    const rated = screen
      .queryAllByRole("group")
      .filter((g) => (g.getAttribute("aria-label") ?? "").startsWith("Оценить"))[0];
    fireEvent.click(within(rated).getByRole("button", { name: /: S$/ }));

    startPass();

    expect(screen.getByText(`Позиция 1 из ${MIN_POOL_SIZE - 1}`)).toBeDefined();
  });

  it("merges the inline tier with the pass answers", async () => {
    openPresets();
    setSize(MIN_POOL_SIZE);

    const rated = screen
      .queryAllByRole("group")
      .filter((g) => (g.getAttribute("aria-label") ?? "").startsWith("Оценить"))[0];
    fireEvent.click(within(rated).getByRole("button", { name: /: S$/ }));

    startPass();
    for (let i = 0; i < MIN_POOL_SIZE - 1; i++) voteTier("D");

    await waitFor(() => expect(createBattle).toHaveBeenCalledTimes(1));
    const [, , ratings] = createBattle.mock.calls[0];

    expect(Object.keys(ratings)).toHaveLength(MIN_POOL_SIZE);
    expect(Object.values(ratings).filter((t) => t === "S")).toHaveLength(1);
    expect(Object.values(ratings).filter((t) => t === "D")).toHaveLength(MIN_POOL_SIZE - 1);
  });

  it("refuses to create when too much was skipped, keeping what was rated", async () => {
    openPresets();
    setSize(MIN_POOL_SIZE);
    startPass();

    voteTier("A");
    for (let i = 0; i < MIN_POOL_SIZE - 1; i++) skipCard();

    expect(await screen.findByText(/Оценено 1 из 5 нужных/)).toBeDefined();
    expect(createBattle).not.toHaveBeenCalled();
    // Back on the picker with the one answer preserved.
    expect(screen.getByText(/Выбрано 1 из/)).toBeDefined();
  });

  it("can be abandoned without losing the line-up", () => {
    openPresets();
    setSize(MIN_POOL_SIZE);
    startPass();

    fireEvent.click(screen.getByRole("button", { name: /Вернуться к набору/ }));

    expect(screen.getByText("Батл вкусов")).toBeDefined();
    expect(itemButtons()).toHaveLength(MIN_POOL_SIZE);
    expect(createBattle).not.toHaveBeenCalled();
  });

  it("does not offer a pass when the author's own list already covers the set", () => {
    openPresets();
    setSize(MIN_POOL_SIZE);
    rateAllVisible();

    expect(screen.queryByRole("button", { name: /Оценить и создать/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Создать батл" })).toBeDefined();
  });

  /** Rates every row shown in the picker, via the inline buttons. */
  function rateAllVisible(tier = "A") {
    let groups = screen
      .queryAllByRole("group")
      .filter((g) => (g.getAttribute("aria-label") ?? "").startsWith("Оценить"));
    while (groups.length > 0) {
      fireEvent.click(within(groups[0]).getByRole("button", { name: new RegExp(`: ${tier}$`) }));
      groups = screen
        .queryAllByRole("group")
        .filter((g) => (g.getAttribute("aria-label") ?? "").startsWith("Оценить"));
    }
  }
});
