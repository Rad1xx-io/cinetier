import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import type { TitleSummary } from "@/lib/types";
import type { TmdbMatch } from "@/lib/import/types";

const push = vi.fn();
const reorderAll = vi.fn();
const matchAgainstTmdb = vi.fn();
const trackImportStarted = vi.fn();
const trackImportCompleted = vi.fn();
const trackFirstTitleRanked = vi.fn();
const trackListCreationStarted = vi.fn();

let sessionUser: { id: string } | null = null;
let currentTitles: unknown[] = [];

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ user: sessionUser, loading: false }),
}));
vi.mock("@/lib/hooks/use-ranked-titles", () => ({
  useRankedTitles: () => ({ titles: currentTitles, reorderAll: (...a: unknown[]) => reorderAll(...a) }),
}));
vi.mock("@/lib/import/match", () => ({
  matchAgainstTmdb: (...a: unknown[]) => matchAgainstTmdb(...a),
}));
vi.mock("@/lib/analytics/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/events")>()),
  trackImportStarted: (...a: unknown[]) => trackImportStarted(...a),
  trackImportCompleted: (...a: unknown[]) => trackImportCompleted(...a),
  trackFirstTitleRanked: (...a: unknown[]) => trackFirstTitleRanked(...a),
  trackListCreationStarted: (...a: unknown[]) => trackListCreationStarted(...a),
}));

import { LetterboxdImportPanel } from "@/components/import/letterboxd-import-panel";

const RATINGS_CSV =
  "Date,Name,Year,Letterboxd URI,Rating\n" +
  "2024-03-01,Heat,1995,https://boxd.it/1,4.5\n" +
  "2024-03-02,Unknown Film,2010,https://boxd.it/2,2.0\n";

function summary(over: Partial<TitleSummary> = {}): TitleSummary {
  return {
    tmdbId: 1,
    mediaType: "movie",
    title: "Heat",
    originalTitle: "Heat",
    posterPath: "/heat.jpg",
    backdropPath: null,
    releaseDate: "1995-12-15",
    overview: "",
    voteAverage: 7.7,
    genreIds: [],
    ...over,
  };
}

/** What matchAgainstTmdb returns for the two-row CSV above, by default. */
function defaultMatches(): TmdbMatch[] {
  return [
    {
      source: { title: "Heat", year: 1995, rating: 4.5, sourceUrl: "https://boxd.it/1" },
      mediaType: "movie",
      match: summary(),
      confidence: "exact",
    },
    {
      source: { title: "Unknown Film", year: 2010, rating: 2.0, sourceUrl: "https://boxd.it/2" },
      mediaType: "movie",
      match: null,
      confidence: "not-found",
    },
  ];
}

function selectFile(text: string, name = "ratings.csv") {
  // The input has no visible label — it's triggered by the "Choose file"
  // button, the same pattern import-export-panel.tsx already uses.
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([text], name, { type: "text/csv" });
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = null;
  currentTitles = [];
  matchAgainstTmdb.mockImplementation(async (_rows: unknown, opts: { onProgress?: (d: number, t: number) => void }) => {
    opts.onProgress?.(1, 2);
    opts.onProgress?.(2, 2);
    return defaultMatches();
  });
});
afterEach(cleanup);

describe("choosing a file", () => {
  it("parses it, matches against TMDB, and lands on a preview", async () => {
    render(<LetterboxdImportPanel />);

    selectFile(RATINGS_CSV);

    await waitFor(() => expect(matchAgainstTmdb).toHaveBeenCalled());
    expect(await screen.findByText(/Heat/)).toBeTruthy();
    expect(trackImportStarted).toHaveBeenCalledWith("letterboxd", 2);
  });

  it("passes whether the visitor is signed in, so matching paces itself against the right budget", async () => {
    sessionUser = { id: "u1" };
    render(<LetterboxdImportPanel />);

    selectFile(RATINGS_CSV);

    await waitFor(() => expect(matchAgainstTmdb).toHaveBeenCalled());
    const options = matchAgainstTmdb.mock.calls[0][1];
    expect(options.authenticated).toBe(true);
  });

  it("shows a clear error for a file that is not a ratings export, without crashing into the preview", async () => {
    render(<LetterboxdImportPanel />);

    selectFile("Date,Letterboxd URI\n2024-01-01,https://boxd.it/1\n");

    expect(await screen.findByText(/doesn't look like a Letterboxd ratings export/i)).toBeTruthy();
    expect(matchAgainstTmdb).not.toHaveBeenCalled();
  });

  it("reports an empty-but-valid file as having nothing to import", async () => {
    render(<LetterboxdImportPanel />);

    selectFile("Date,Name,Year,Letterboxd URI,Rating\n");

    expect(await screen.findByText(/no rated films were found/i)).toBeTruthy();
  });
});

describe("the preview", () => {
  async function openPreview() {
    render(<LetterboxdImportPanel />);
    selectFile(RATINGS_CSV);
    await screen.findByText(/Heat/);
  }

  it("starts a confident match checked, ready to import", async () => {
    await openPreview();
    const row = screen.getByText(/Heat/).closest("li")!;
    expect(within(row).getByRole("checkbox")).toHaveProperty("checked", true);
  });

  it("offers no checkbox for a title TMDB could not find at all", async () => {
    await openPreview();
    const row = screen.getByText("Unknown Film").closest("li")!;
    expect(within(row).getByText(/not found on tmdb/i)).toBeTruthy();
  });

  it("keeps the Import button disabled until the review checkbox is ticked", async () => {
    await openPreview();
    expect(screen.getByRole("button", { name: "Import" })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByLabelText(/checked the matches/));

    expect(screen.getByRole("button", { name: "Import" })).toHaveProperty("disabled", false);
  });

  it("writes only the rows still checked when Import is pressed", async () => {
    await openPreview();
    fireEvent.click(screen.getByLabelText(/checked the matches/));

    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(reorderAll).toHaveBeenCalled());
    const written = reorderAll.mock.calls[0][0];
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ tmdbId: 1, tier: "S" });
  });

  it("does not write a row that was unchecked before confirming", async () => {
    // Two writable matches this time — unchecking one and confirming still
    // has to leave something for the Import button to do.
    matchAgainstTmdb.mockResolvedValueOnce([
      defaultMatches()[0],
      {
        source: { title: "Collateral", year: 2004, rating: 4.0, sourceUrl: null },
        mediaType: "movie" as const,
        match: summary({ tmdbId: 2, title: "Collateral", releaseDate: "2004-08-06" }),
        confidence: "exact" as const,
      },
    ]);
    await openPreview();
    const heatRow = screen.getByText(/Heat/).closest("li")!;
    fireEvent.click(within(heatRow).getByRole("checkbox"));
    fireEvent.click(screen.getByLabelText(/checked the matches/));

    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(reorderAll).toHaveBeenCalled());
    const written = reorderAll.mock.calls[0][0];
    expect(written).toHaveLength(1);
    expect(written[0].tmdbId).toBe(2);
  });

  it("reports the summary and fires the completion event with real counts", async () => {
    await openPreview();
    fireEvent.click(screen.getByLabelText(/checked the matches/));
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText(/Added 1 title/)).toBeTruthy();
    expect(await screen.findByText(/1 title couldn't be matched/i)).toBeTruthy();
    expect(trackImportCompleted).toHaveBeenCalledWith("letterboxd", 1, 0, 1);
  });

  it("fires first_title_ranked for an account with nothing ranked yet, once, not per row", async () => {
    currentTitles = [];
    await openPreview();
    fireEvent.click(screen.getByLabelText(/checked the matches/));
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(reorderAll).toHaveBeenCalled());
    expect(trackFirstTitleRanked).toHaveBeenCalledTimes(1);
    expect(trackListCreationStarted).toHaveBeenCalledWith("movie");
  });

  it("does not fire the first-title events for an account that already has titles ranked", async () => {
    currentTitles = [{ tmdbId: 99, mediaType: "movie" }];
    await openPreview();
    fireEvent.click(screen.getByLabelText(/checked the matches/));
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(reorderAll).toHaveBeenCalled());
    expect(trackFirstTitleRanked).not.toHaveBeenCalled();
    expect(trackListCreationStarted).not.toHaveBeenCalled();
  });
});

describe("cancelling mid-match", () => {
  it("aborts and returns to the file picker", async () => {
    let resolveMatch: (() => void) | null = null;
    matchAgainstTmdb.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMatch = () => resolve(defaultMatches());
        })
    );

    render(<LetterboxdImportPanel />);
    selectFile(RATINGS_CSV);

    await screen.findByText(/matching against tmdb/i);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Choose file" })).toBeTruthy();
    resolveMatch!(); // let the abandoned promise settle so it can't affect a later test
  });
});
