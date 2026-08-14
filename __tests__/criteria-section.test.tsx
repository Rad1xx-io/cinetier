import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { CriterionScore } from "@/lib/types/criteria";

const setCriteria = vi.fn();
const pullCriteria = vi.fn().mockResolvedValue([]);
const pushCriteria = vi.fn().mockResolvedValue(undefined);
let currentUser: { id: string } | null = { id: "user-1" };

vi.mock("@/lib/hooks/use-ranked-titles", () => ({
  useRankedTitles: () => ({ setCriteria }),
}));
vi.mock("@/lib/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ configured: true, loading: false, user: currentUser }),
}));
vi.mock("@/lib/storage/criteria-sync", () => ({
  pullCriteria: (...args: unknown[]) => pullCriteria(...args),
  pushCriteria: (...args: unknown[]) => pushCriteria(...args),
}));

const { CriteriaSection } = await import("@/components/criteria/criteria-section");
const { resetLazyCriteriaCache } = await import("@/lib/hooks/use-lazy-criteria");

const scores: CriterionScore[] = [
  { criterionId: "story", name: "Сюжет", score: 9 },
  { criterionId: "sound", name: "Звук", score: 8 },
];

beforeEach(() => {
  currentUser = { id: "user-1" };
});

afterEach(() => {
  cleanup();
  resetLazyCriteriaCache();
  vi.clearAllMocks();
});

describe("CriteriaSection — owner", () => {
  it("offers the control that creates a first breakdown", () => {
    render(
      <CriteriaSection tmdbId={1} mediaType="movie" isRanked criteriaScores={undefined} />
    );
    expect(screen.getByRole("button", { name: /Добавить критерии/ })).toBeTruthy();
  });

  it("switches the control to editing once scores exist", () => {
    render(<CriteriaSection tmdbId={1} mediaType="movie" isRanked criteriaScores={scores} />);
    expect(screen.getByRole("button", { name: /Изменить критерии/ })).toBeTruthy();
  });

  it("shows the derived average and the chips", () => {
    render(<CriteriaSection tmdbId={1} mediaType="movie" isRanked criteriaScores={scores} />);
    expect(screen.getByText("8.5")).toBeTruthy();
    expect(screen.getByText(/Сюжет/)).toBeTruthy();
    expect(screen.getByText(/Звук/)).toBeTruthy();
  });

  it("renders nothing for a title the user has not ranked", () => {
    const { container } = render(
      <CriteriaSection tmdbId={1} mediaType="movie" isRanked={false} criteriaScores={undefined} />
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("CriteriaSection — read-only", () => {
  it("hides every edit control", () => {
    render(
      <CriteriaSection tmdbId={1} mediaType="movie" isRanked criteriaScores={scores} readOnly />
    );
    expect(screen.queryByRole("button", { name: /критерии/ })).toBeNull();
    // The drawer must not be mounted either — a visitor should have no way in.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("still shows the derived score and chips", () => {
    render(
      <CriteriaSection tmdbId={1} mediaType="movie" isRanked criteriaScores={scores} readOnly />
    );
    expect(screen.getByText("8.5")).toBeTruthy();
    expect(screen.getByText(/Сюжет/)).toBeTruthy();
  });

  it("labels the score as someone else's rather than 'своя'", () => {
    render(
      <CriteriaSection tmdbId={1} mediaType="movie" isRanked criteriaScores={scores} readOnly />
    );
    expect(screen.getByText(/Оценка по критериям/)).toBeTruthy();
    expect(screen.queryByText(/Своя оценка/)).toBeNull();
  });

  it("renders nothing when the owner scored no criteria", () => {
    const { container } = render(
      <CriteriaSection tmdbId={1} mediaType="movie" isRanked criteriaScores={[]} readOnly />
    );
    expect(container.firstChild).toBeNull();
  });

  it("never fetches on someone else's behalf", () => {
    render(
      <CriteriaSection tmdbId={9} mediaType="movie" isRanked criteriaScores={undefined} readOnly />
    );
    expect(pullCriteria).not.toHaveBeenCalled();
  });
});

describe("CriteriaSection — lazy loading", () => {
  it("asks the cloud once when the card opens without local scores", async () => {
    render(
      <CriteriaSection tmdbId={7} mediaType="movie" isRanked criteriaScores={undefined} />
    );
    await vi.waitFor(() => expect(pullCriteria).toHaveBeenCalledWith("user-1", 7, "movie"));
  });

  it("does not ask when the scores are already local", () => {
    render(<CriteriaSection tmdbId={8} mediaType="movie" isRanked criteriaScores={scores} />);
    expect(pullCriteria).not.toHaveBeenCalled();
  });

  it("does not ask for a signed-out visitor", () => {
    currentUser = null;
    render(
      <CriteriaSection tmdbId={10} mediaType="movie" isRanked criteriaScores={undefined} />
    );
    expect(pullCriteria).not.toHaveBeenCalled();
  });
});
