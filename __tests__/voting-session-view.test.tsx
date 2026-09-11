import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const getVotingSession = vi.fn();
const submitBallot = vi.fn();
const closeVotingSession = vi.fn();
const hasVotedLocally = vi.fn();
const markVotedLocally = vi.fn();
const trackVotingBallotSubmitted = vi.fn();
const trackVotingSessionClosed = vi.fn();
const getPost = vi.fn();
const getPostSnapshots = vi.fn();
let sessionUser: { id: string } | null = null;

vi.mock("@/lib/supabase/voting", () => ({
  getVotingSession: (...a: unknown[]) => getVotingSession(...(a as [])),
  submitBallot: (...a: unknown[]) => submitBallot(...(a as [])),
  closeVotingSession: (...a: unknown[]) => closeVotingSession(...(a as [])),
}));
vi.mock("@/lib/voting/voter-key", () => ({
  hasVotedLocally: (...a: unknown[]) => hasVotedLocally(...(a as [])),
  markVotedLocally: (...a: unknown[]) => markVotedLocally(...(a as [])),
  getVoterKey: () => "test-voter-key",
}));
vi.mock("@/lib/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ user: sessionUser, loading: false }),
}));
vi.mock("@/lib/analytics/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/events")>()),
  trackVotingBallotSubmitted: (...a: unknown[]) => trackVotingBallotSubmitted(...(a as [])),
  trackVotingSessionClosed: (...a: unknown[]) => trackVotingSessionClosed(...(a as [])),
  trackLinkCopied: vi.fn(),
  trackShareClicked: vi.fn(),
}));
// VotingResults does its own data fetching against the feed — stubbed here
// so a "closed" test only has to prove this component reaches it, not
// re-prove how a post renders.
vi.mock("@/lib/supabase/feed", () => ({
  getPost: (...a: unknown[]) => getPost(...(a as [])),
  getPostSnapshots: (...a: unknown[]) => getPostSnapshots(...(a as [])),
}));

import { VotingSessionView } from "@/components/voting/voting-session-view";

const OPEN_SESSION = {
  id: "session-1",
  creatorId: "creator-1",
  title: "Best of the year",
  description: "",
  category: "movie" as const,
  pool: [
    { itemKey: "movie-1", tmdbId: 1, mediaType: "movie" as const, title: "Film A", posterPath: null, releaseDate: null },
    { itemKey: "movie-2", tmdbId: 2, mediaType: "movie" as const, title: "Film B", posterPath: null, releaseDate: null },
  ],
  closedAt: null,
  resultPostId: null,
  createdAt: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = null;
  hasVotedLocally.mockReturnValue(false);
  getPost.mockResolvedValue({
    id: "post-1",
    username: "creator",
    displayName: "Creator",
    title: "Best of the year",
    description: "",
  });
  getPostSnapshots.mockResolvedValue(new Map());
});
afterEach(() => cleanup());

describe("an open session, not yet voted", () => {
  it("shows the ballot instead of a share panel for a visitor who is not the creator", async () => {
    getVotingSession.mockResolvedValue(OPEN_SESSION);
    render(<VotingSessionView sessionId="session-1" />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Film A: S" })).toBeTruthy());
    expect(screen.queryByText(/share the link|close voting/i)).toBeNull();
  });

  it("shows the share panel and a close button for the session's own creator", async () => {
    sessionUser = { id: "creator-1" };
    getVotingSession.mockResolvedValue(OPEN_SESSION);
    render(<VotingSessionView sessionId="session-1" />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /close voting/i })).toBeTruthy()
    );
  });

  it("submits the ballot, marks it voted, and reports which items were rated", async () => {
    getVotingSession.mockResolvedValue(OPEN_SESSION);
    submitBallot.mockResolvedValue({ ok: true });
    render(<VotingSessionView sessionId="session-1" />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Film A: S" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Film A: S" }));
    fireEvent.click(screen.getByRole("button", { name: /submit ballot/i }));

    await waitFor(() => expect(submitBallot).toHaveBeenCalledWith("session-1", { "movie-1": "S" }));
    await waitFor(() =>
      expect(trackVotingBallotSubmitted).toHaveBeenCalledWith({
        sessionId: "session-1",
        itemsRated: 1,
        itemsInPool: 2,
      })
    );
    await waitFor(() => expect(screen.getByText(/your ballot is in/i)).toBeTruthy());
  });

  it("shows the same 'already voted' outcome when the server rejects a repeat voter_key, not an error", async () => {
    getVotingSession.mockResolvedValue(OPEN_SESSION);
    submitBallot.mockResolvedValue({ ok: false, reason: "already-voted" });
    render(<VotingSessionView sessionId="session-1" />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Film A: S" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Film A: A" }));
    fireEvent.click(screen.getByRole("button", { name: /submit ballot/i }));

    await waitFor(() => expect(screen.getByText(/your ballot is in/i)).toBeTruthy());
    expect(screen.queryByText(/could not submit/i)).toBeNull();
  });

  it("skips the ballot entirely for a browser this session already remembers voting from", async () => {
    hasVotedLocally.mockReturnValue(true);
    getVotingSession.mockResolvedValue(OPEN_SESSION);
    render(<VotingSessionView sessionId="session-1" />);

    await waitFor(() => expect(screen.getByText(/your ballot is in/i)).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Film A: S" })).toBeNull();
  });
});

describe("closing a session", () => {
  it("calls the close RPC and switches straight to the result", async () => {
    sessionUser = { id: "creator-1" };
    getVotingSession.mockResolvedValue(OPEN_SESSION);
    closeVotingSession.mockResolvedValue({ ok: true, postId: "post-1" });
    render(<VotingSessionView sessionId="session-1" />);

    await waitFor(() => expect(screen.getByRole("button", { name: /close voting/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /close voting/i }));

    await waitFor(() => expect(closeVotingSession).toHaveBeenCalledWith("session-1"));
    await waitFor(() =>
      expect(trackVotingSessionClosed).toHaveBeenCalledWith({ sessionId: "session-1", resultPostId: "post-1" })
    );
    await waitFor(() => expect(getPost).toHaveBeenCalledWith("post-1"));
  });

  it("shows the result directly for a session that was already closed on arrival", async () => {
    getVotingSession.mockResolvedValue({ ...OPEN_SESSION, closedAt: "2026-01-02T00:00:00Z", resultPostId: "post-1" });
    render(<VotingSessionView sessionId="session-1" />);

    await waitFor(() => expect(getPost).toHaveBeenCalledWith("post-1"));
    expect(screen.queryByRole("button", { name: "Film A: S" })).toBeNull();
  });
});

describe("a link that does not resolve", () => {
  it("says so rather than showing an empty ballot", async () => {
    getVotingSession.mockResolvedValue(null);
    render(<VotingSessionView sessionId="nope" />);

    await waitFor(() => expect(screen.getByText(/doesn't exist/i)).toBeTruthy());
  });
});
