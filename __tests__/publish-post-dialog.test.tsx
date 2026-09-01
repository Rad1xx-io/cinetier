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

// A board of nothing cannot be published (see the "cannot be published empty"
// suite below), so most of these tests need at least one title on the board —
// otherwise the submit button would refuse for a reason unrelated to what
// each test actually checks. A plain movie, since none of these tests care
// which catalogue it is in.
const anyTitle = {
  tmdbId: 1,
  mediaType: "movie" as const,
  title: "Something ranked",
  posterPath: null,
  releaseDate: null,
  tier: "S" as const,
  order: 0,
  addedAt: 0,
  updatedAt: 0,
};

function open(props: Partial<Parameters<typeof PublishPostDialog>[0]> = {}) {
  return render(<PublishPostDialog open onClose={onClose} titles={[anyTitle]} {...props} />);
}

function submitButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /Publish/ }) as HTMLButtonElement;
}

function categoryButton(name: RegExp): HTMLButtonElement {
  const group = screen.getByRole("group", { name: /Category/ });
  return within(group).getByRole("button", { name }) as HTMLButtonElement;
}

/** The one checkbox in the dialog — ticking it is required before Publish can be pressed. */
function tickRules() {
  fireEvent.click(screen.getByRole("checkbox"));
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
    tickRules();

    expect(submitButton().disabled).toBe(false);
  });

  it("stays disabled until the content-rules box is ticked, title aside", () => {
    open();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Мой топ" } });
    expect(submitButton().disabled).toBe(true);

    tickRules();
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
    tickRules();
  }

  it("sends the title, description and category", async () => {
    const anime = { ...anyTitle, tmdbId: 2, mediaType: "anime" as const };
    open({ suggestedCategory: "anime", titles: [anime] });
    fill();

    fireEvent.click(submitButton());

    await waitFor(() => expect(publishPost).toHaveBeenCalledTimes(1));
    expect(publishPost).toHaveBeenCalledWith({
      title: "Мой топ сай-фая",
      description: "Почему именно так",
      category: "anime",
      titles: [anime],
      channels: [],
      rulesConfirmed: true,
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

/*
 * A board can be non-empty overall and still be empty for the category on
 * screen — the whole-board case (nothing ranked at all) is refused one layer
 * up, at the button that opens this dialog, before it ever exists; see
 * tier-list-actions-empty-publish.test.tsx. This is the narrower case: the
 * category picker inside the dialog can filter a real board down to nothing.
 */
describe("PublishPostDialog — a category with nothing ranked in it", () => {
  const movie = { ...anyTitle, tmdbId: 1, mediaType: "movie" as const };

  it("disables Publish and says why, without touching the title check", () => {
    open({ suggestedCategory: "movie", titles: [movie] });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Мой топ" } });

    fireEvent.click(categoryButton(/Anime/));

    expect(submitButton().disabled).toBe(true);
    expect(screen.getByText(/nothing is ranked in tiers for/i)).toBeTruthy();
  });

  it("does not call publishPost even if Publish is clicked while disabled", () => {
    open({ suggestedCategory: "movie", titles: [movie] });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Мой топ" } });
    fireEvent.click(categoryButton(/Anime/));

    fireEvent.click(submitButton());

    expect(publishPost).not.toHaveBeenCalled();
  });

  it("re-enables once a category with content is picked again", () => {
    open({ suggestedCategory: "movie", titles: [movie] });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Мой топ" } });
    tickRules();
    fireEvent.click(categoryButton(/Anime/));
    expect(submitButton().disabled).toBe(true);

    fireEvent.click(categoryButton(/Films/));

    expect(submitButton().disabled).toBe(false);
    expect(screen.queryByText(/nothing is ranked in tiers for/i)).toBeNull();
  });

  it("never disables Everything, since it always means the whole board", () => {
    open({ suggestedCategory: "movie", titles: [movie] });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Мой топ" } });
    tickRules();

    fireEvent.click(categoryButton(/Everything/));

    expect(submitButton().disabled).toBe(false);
  });
});

/*
 * Whether the whole post follows the site's rules — a separate confirmation
 * from the upload dialog's per-picture "I confirm I have the right to use
 * this image", and the only one a regular tier-list post (no uploads at all)
 * ever shows.
 */
describe("PublishPostDialog — the content-rules confirmation", () => {
  it("starts unticked, and Publish stays disabled with everything else filled in", () => {
    open();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Мой топ" } });

    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    expect(submitButton().disabled).toBe(true);
  });

  it("does not call publishPost if Publish is somehow triggered while unticked", () => {
    open();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Мой топ" } });

    fireEvent.click(submitButton());

    expect(publishPost).not.toHaveBeenCalled();
  });

  it("resets to unticked when the dialog is reopened, rather than carrying a stale yes", () => {
    const { rerender } = open();
    tickRules();
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);

    rerender(<PublishPostDialog open={false} onClose={onClose} titles={[anyTitle]} />);
    rerender(<PublishPostDialog open onClose={onClose} titles={[anyTitle]} />);

    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });
});
