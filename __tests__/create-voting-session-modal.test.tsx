import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { RankedTitle } from "@/lib/types";

const createVotingSession = vi.fn();

vi.mock("@/lib/supabase/voting", () => ({
  createVotingSession: (...args: unknown[]) => createVotingSession(...(args as [])),
}));
vi.mock("@/lib/analytics/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/events")>()),
  trackVotingSessionCreated: vi.fn(),
  trackLinkCopied: vi.fn(),
  trackShareClicked: vi.fn(),
}));

import { CreateVotingSessionModal } from "@/components/voting/create-voting-session-modal";

function makeTitles(count: number, mediaType: RankedTitle["mediaType"] = "movie"): RankedTitle[] {
  return Array.from({ length: count }, (_, i) => ({
    tmdbId: i + 1,
    mediaType,
    title: `Title ${i + 1}`,
    posterPath: `/poster${i + 1}.jpg`,
    releaseDate: "2020-01-01",
    tier: "S" as const,
    order: i,
    addedAt: 0,
    updatedAt: 0,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has neither showModal nor close on <dialog> — same stub every
  // dialog-based test in this repo needs.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
afterEach(() => cleanup());

describe("creating a voting session", () => {
  it("disables creating a link below the minimum pool size", () => {
    render(<CreateVotingSessionModal open onClose={vi.fn()} titles={makeTitles(2)} />);
    const button = screen.getByRole("button", { name: /create voting link/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("creates a session from the selected titles and shows the link", async () => {
    createVotingSession.mockResolvedValue("session-123");
    render(<CreateVotingSessionModal open onClose={vi.fn()} titles={makeTitles(5)} />);

    fireEvent.click(screen.getByRole("button", { name: /create voting link/i }));

    await waitFor(() => expect(createVotingSession).toHaveBeenCalledTimes(1));
    const call = createVotingSession.mock.calls[0][0];
    expect(call.category).toBe("movie");
    expect(call.pool).toHaveLength(5);
    expect(call.pool[0]).toMatchObject({ itemKey: "movie-1", title: "Title 1" });

    await waitFor(() => expect(screen.getByText(/\/vote\/session-123/)).toBeTruthy());
  });

  it("leaves out a title the creator unticked", async () => {
    createVotingSession.mockResolvedValue("session-456");
    render(<CreateVotingSessionModal open onClose={vi.fn()} titles={makeTitles(5)} />);

    fireEvent.click(screen.getByRole("button", { name: /Title 1$/ }));
    fireEvent.click(screen.getByRole("button", { name: /create voting link/i }));

    await waitFor(() => expect(createVotingSession).toHaveBeenCalledTimes(1));
    const pool = createVotingSession.mock.calls[0][0].pool as { title: string }[];
    expect(pool.map((p) => p.title)).not.toContain("Title 1");
    expect(pool).toHaveLength(4);
  });

  it("switches the pool when a different category is picked", () => {
    const titles = [...makeTitles(3, "movie"), ...makeTitles(4, "tv")];
    render(<CreateVotingSessionModal open onClose={vi.fn()} titles={titles} />);

    expect(screen.getByText(/3 of 3 selected/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^tv/i }));
    expect(screen.getByText(/4 of 4 selected/i)).toBeTruthy();
  });

  it("shows an error rather than a link when creation fails", async () => {
    createVotingSession.mockResolvedValue(null);
    render(<CreateVotingSessionModal open onClose={vi.fn()} titles={makeTitles(5)} />);

    fireEvent.click(screen.getByRole("button", { name: /create voting link/i }));

    await waitFor(() => expect(screen.getByText(/could not create the voting session/i)).toBeTruthy());
    expect(screen.queryByText(/\/vote\//)).toBeNull();
  });
});
