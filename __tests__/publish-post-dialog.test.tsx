import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const publishPost = vi.fn();
const trackListPublished = vi.fn();
const trackPostPublished = vi.fn();
const push = vi.fn();

vi.mock("@/lib/supabase/feed", () => ({
  publishPost: (...args: unknown[]) => publishPost(...args),
}));
vi.mock("@/lib/analytics/events", () => ({
  trackListPublished: (...args: unknown[]) => trackListPublished(...args),
  trackPostPublished: (...args: unknown[]) => trackPostPublished(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const { PublishPostDialog } = await import("@/components/feed/publish-post-dialog");
const { POST_TITLE_MAX } = await import("@/lib/feed/post-preview");

const onClose = vi.fn();

function open(props: Partial<Parameters<typeof PublishPostDialog>[0]> = {}) {
  return render(<PublishPostDialog open onClose={onClose} titles={[]} {...props} />);
}

function submitButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /Publish/ }) as HTMLButtonElement;
}

function categoryButton(name: RegExp): HTMLButtonElement {
  const group = screen.getByRole("group", { name: /Category/ });
  return within(group).getByRole("button", { name }) as HTMLButtonElement;
}

beforeEach(() => {
  publishPost.mockResolvedValue({ ok: true, postId: "post-1" });
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
});

describe("PublishPostDialog — the form", () => {
  it("cannot be submitted empty", () => {
    open();

    expect(submitButton().disabled).toBe(true);
  });

  it("stays disabled for a title below the minimum", () => {
    open();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "ок" } });

    expect(submitButton().disabled).toBe(true);
  });

  it("enables once the title is long enough", () => {
    open();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Мой топ" } });

    expect(submitButton().disabled).toBe(false);
  });

  it("caps the title at the length the database accepts", () => {
    open();

    const input = screen.getByLabelText("Title") as HTMLInputElement;
    expect(input.maxLength).toBe(POST_TITLE_MAX);
  });

  it("opens on the suggested category", () => {
    open({ suggestedCategory: "game" });

    expect(categoryButton(/Games/).getAttribute("aria-pressed")).toBe("true");
    expect(categoryButton(/Everything/).getAttribute("aria-pressed")).toBe("false");
  });

  it("defaults to mixed when nothing is suggested", () => {
    open();

    expect(categoryButton(/Everything/).getAttribute("aria-pressed")).toBe("true");
  });

  it("lets the category be changed", () => {
    open();

    fireEvent.click(categoryButton(/Anime/));

    expect(categoryButton(/Anime/).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("PublishPostDialog — publishing", () => {
  function fill(title = "Мой топ сай-фая", description = "Почему именно так") {
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: title } });
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: description } });
  }

  it("sends the title, description and category", async () => {
    open({ suggestedCategory: "anime" });
    fill();

    fireEvent.click(submitButton());

    await waitFor(() => expect(publishPost).toHaveBeenCalledTimes(1));
    expect(publishPost).toHaveBeenCalledWith({
      title: "Мой топ сай-фая",
      description: "Почему именно так",
      category: "anime",
      titles: [],
      channels: [],
    });
  });

  it("freezes the board it was handed, not a fresh read", async () => {
    const titles = [
      { tmdbId: 1, mediaType: "movie" as const, title: "A", posterPath: null, releaseDate: null, tier: "S" as const, order: 0, addedAt: 0, updatedAt: 0 },
    ];
    open({ suggestedCategory: "movie", titles });
    fill();

    fireEvent.click(submitButton());

    await waitFor(() => expect(publishPost).toHaveBeenCalledTimes(1));
    expect(publishPost).toHaveBeenCalledWith(expect.objectContaining({ titles }));
  });

  it("scopes the snapshot to the picked category, not the whole board", async () => {
    // Same bug as Clear List: the category button changed what was shown on
    // screen but never reached the actual submit — every post snapshotted
    // the full unfiltered board no matter which button was clicked.
    const movie = { tmdbId: 1, mediaType: "movie" as const, title: "A", posterPath: null, releaseDate: null, tier: "S" as const, order: 0, addedAt: 0, updatedAt: 0 };
    const anime = { tmdbId: 2, mediaType: "anime" as const, title: "B", posterPath: null, releaseDate: null, tier: "A" as const, order: 1, addedAt: 0, updatedAt: 0 };
    open({ suggestedCategory: "movie", titles: [movie, anime] });
    fill();

    fireEvent.click(submitButton());

    await waitFor(() => expect(publishPost).toHaveBeenCalledTimes(1));
    expect(publishPost).toHaveBeenCalledWith(expect.objectContaining({ titles: [movie] }));
  });

  it("keeps the whole board when the category is Everything", async () => {
    const movie = { tmdbId: 1, mediaType: "movie" as const, title: "A", posterPath: null, releaseDate: null, tier: "S" as const, order: 0, addedAt: 0, updatedAt: 0 };
    const anime = { tmdbId: 2, mediaType: "anime" as const, title: "B", posterPath: null, releaseDate: null, tier: "A" as const, order: 1, addedAt: 0, updatedAt: 0 };
    open({ suggestedCategory: "mixed", titles: [movie, anime] });
    fill();

    fireEvent.click(submitButton());

    await waitFor(() => expect(publishPost).toHaveBeenCalledTimes(1));
    expect(publishPost).toHaveBeenCalledWith(expect.objectContaining({ titles: [movie, anime] }));
  });

  it("re-scopes the snapshot when the category is changed before submit", async () => {
    const movie = { tmdbId: 1, mediaType: "movie" as const, title: "A", posterPath: null, releaseDate: null, tier: "S" as const, order: 0, addedAt: 0, updatedAt: 0 };
    const anime = { tmdbId: 2, mediaType: "anime" as const, title: "B", posterPath: null, releaseDate: null, tier: "A" as const, order: 1, addedAt: 0, updatedAt: 0 };
    open({ suggestedCategory: "movie", titles: [movie, anime] });
    fill();

    fireEvent.click(categoryButton(/Anime/));
    fireEvent.click(submitButton());

    await waitFor(() => expect(publishPost).toHaveBeenCalledTimes(1));
    expect(publishPost).toHaveBeenCalledWith(expect.objectContaining({ titles: [anime] }));
  });

  const someChannel = {
    channelId: "c1",
    title: "Some Channel",
    thumbnailUrl: null,
    country: null,
    tier: "S" as const,
    order: 0,
    addedAt: 0,
    updatedAt: 0,
  };

  it("snapshots channels for the YouTube category — the whole bug this dialog existed to fix", async () => {
    // Before this: PublishPostDialog never received channels at all, so a
    // "YouTube" post always froze an empty list regardless of what the
    // author had actually ranked.
    open({ suggestedCategory: "youtube", channels: [someChannel] });
    fireEvent.click(categoryButton(/YouTube/));
    fill();

    fireEvent.click(submitButton());

    await waitFor(() => expect(publishPost).toHaveBeenCalledTimes(1));
    expect(publishPost).toHaveBeenCalledWith(
      expect.objectContaining({ category: "youtube", titles: [], channels: [someChannel] })
    );
  });

  it("keeps channels out of a single catalogue's snapshot", async () => {
    const anime = { tmdbId: 2, mediaType: "anime" as const, title: "B", posterPath: null, releaseDate: null, tier: "A" as const, order: 1, addedAt: 0, updatedAt: 0 };
    open({ suggestedCategory: "anime", titles: [anime], channels: [someChannel] });
    fill();

    fireEvent.click(submitButton());

    await waitFor(() => expect(publishPost).toHaveBeenCalledTimes(1));
    expect(publishPost).toHaveBeenCalledWith(
      expect.objectContaining({ category: "anime", titles: [anime], channels: [] })
    );
  });

  it("includes channels in Everything, same as every catalogue", async () => {
    const anime = { tmdbId: 2, mediaType: "anime" as const, title: "B", posterPath: null, releaseDate: null, tier: "A" as const, order: 1, addedAt: 0, updatedAt: 0 };
    open({ suggestedCategory: "mixed", titles: [anime], channels: [someChannel] });
    fill();

    fireEvent.click(submitButton());

    await waitFor(() => expect(publishPost).toHaveBeenCalledTimes(1));
    expect(publishPost).toHaveBeenCalledWith(
      expect.objectContaining({ category: "mixed", titles: [anime], channels: [someChannel] })
    );
  });

  it("reports the publication and moves to the feed", async () => {
    open();
    fill();

    fireEvent.click(submitButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/feed"));
    expect(trackListPublished).toHaveBeenCalledWith("post-1");
    // The feed's own event carries the category the funnel breaks down on.
    expect(trackPostPublished).toHaveBeenCalledWith("post-1", expect.any(String));
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the draft and shows why when the write is refused", async () => {
    publishPost.mockResolvedValue({ ok: false, error: "Claim a username in settings first." });
    open();
    fill();

    fireEvent.click(submitButton());

    expect(await screen.findByText(/Claim a username/)).toBeDefined();
    // The draft survives, so a retry does not mean retyping it.
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Мой топ сай-фая");
    expect(push).not.toHaveBeenCalled();
    expect(trackListPublished).not.toHaveBeenCalled();
  });

  it("does not navigate away on a failure", async () => {
    publishPost.mockResolvedValue({ ok: false, error: "Could not publish the post." });
    open();
    fill();

    fireEvent.click(submitButton());

    await waitFor(() => expect(publishPost).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });
});
