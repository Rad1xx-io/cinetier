import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const publishPost = vi.fn();
const trackListPublished = vi.fn();
const push = vi.fn();

vi.mock("@/lib/supabase/feed", () => ({
  publishPost: (...args: unknown[]) => publishPost(...args),
}));
vi.mock("@/lib/analytics/events", () => ({
  trackListPublished: (...args: unknown[]) => trackListPublished(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const { PublishPostDialog } = await import("@/components/feed/publish-post-dialog");
const { POST_TITLE_MAX } = await import("@/lib/feed/post-preview");

const onClose = vi.fn();

function open(props: Partial<Parameters<typeof PublishPostDialog>[0]> = {}) {
  return render(<PublishPostDialog open onClose={onClose} {...props} />);
}

function submitButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /Опубликовать/ }) as HTMLButtonElement;
}

function categoryButton(name: RegExp): HTMLButtonElement {
  const group = screen.getByRole("group", { name: /Категория/ });
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

    fireEvent.change(screen.getByLabelText("Заголовок"), { target: { value: "ок" } });

    expect(submitButton().disabled).toBe(true);
  });

  it("enables once the title is long enough", () => {
    open();

    fireEvent.change(screen.getByLabelText("Заголовок"), { target: { value: "Мой топ" } });

    expect(submitButton().disabled).toBe(false);
  });

  it("caps the title at the length the database accepts", () => {
    open();

    const input = screen.getByLabelText("Заголовок") as HTMLInputElement;
    expect(input.maxLength).toBe(POST_TITLE_MAX);
  });

  it("opens on the suggested category", () => {
    open({ suggestedCategory: "game" });

    expect(categoryButton(/Игры/).getAttribute("aria-pressed")).toBe("true");
    expect(categoryButton(/Всё сразу/).getAttribute("aria-pressed")).toBe("false");
  });

  it("defaults to mixed when nothing is suggested", () => {
    open();

    expect(categoryButton(/Всё сразу/).getAttribute("aria-pressed")).toBe("true");
  });

  it("lets the category be changed", () => {
    open();

    fireEvent.click(categoryButton(/Аниме/));

    expect(categoryButton(/Аниме/).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("PublishPostDialog — publishing", () => {
  function fill(title = "Мой топ сай-фая", description = "Почему именно так") {
    fireEvent.change(screen.getByLabelText("Заголовок"), { target: { value: title } });
    fireEvent.change(screen.getByLabelText(/Описание/), { target: { value: description } });
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
    });
  });

  it("reports the publication and moves to the feed", async () => {
    open();
    fill();

    fireEvent.click(submitButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/feed"));
    expect(trackListPublished).toHaveBeenCalledWith("post-1");
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the draft and shows why when the write is refused", async () => {
    publishPost.mockResolvedValue({ ok: false, error: "Сначала займите юзернейм в настройках." });
    open();
    fill();

    fireEvent.click(submitButton());

    expect(await screen.findByText(/Сначала займите юзернейм/)).toBeDefined();
    // The draft survives, so a retry does not mean retyping it.
    expect((screen.getByLabelText("Заголовок") as HTMLInputElement).value).toBe("Мой топ сай-фая");
    expect(push).not.toHaveBeenCalled();
    expect(trackListPublished).not.toHaveBeenCalled();
  });

  it("does not navigate away on a failure", async () => {
    publishPost.mockResolvedValue({ ok: false, error: "Не удалось опубликовать пост." });
    open();
    fill();

    fireEvent.click(submitButton());

    await waitFor(() => expect(publishPost).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });
});
