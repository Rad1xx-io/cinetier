import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const createCustomBoard = vi.fn();
const push = vi.fn();
const refresh = vi.fn();
const getUser = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ auth: { getUser: () => getUser() } }),
}));
vi.mock("@/lib/supabase/custom-lists", () => ({
  createCustomBoard: (...a: unknown[]) => createCustomBoard(...(a as [])),
}));

import { CreateBoardForm } from "@/components/custom-list/create-board-form";

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  createCustomBoard.mockResolvedValue({ id: "board-1" });
});
afterEach(cleanup);

/*
 * The production report: create a board, land on its own page, press the
 * browser's Back button, and the board you just made is missing from the
 * list — Next reuses the page's Client Cache entry for back/forward
 * navigation, fetched before the board existed. router.refresh() is the
 * documented way to invalidate that entry for the current route before
 * leaving it.
 */
describe("creating a board", () => {
  it("refreshes the current route before navigating to the new board", async () => {
    render(<CreateBoardForm />);

    fireEvent.change(screen.getByLabelText("Board name"), { target: { value: "Holiday photos" } });
    fireEvent.click(screen.getByRole("button", { name: /create board/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/custom/board-1"));
    expect(refresh).toHaveBeenCalledTimes(1);

    // Order matters: refreshed while still on this route, not after leaving it.
    const refreshOrder = refresh.mock.invocationCallOrder[0];
    const pushOrder = push.mock.invocationCallOrder[0];
    expect(refreshOrder).toBeLessThan(pushOrder);
  });

  it("does not refresh or navigate when the write is refused", async () => {
    createCustomBoard.mockResolvedValue({ error: "Could not create the board." });
    render(<CreateBoardForm />);

    fireEvent.change(screen.getByLabelText("Board name"), { target: { value: "Holiday photos" } });
    fireEvent.click(screen.getByRole("button", { name: /create board/i }));

    await screen.findByText("Could not create the board.");
    expect(refresh).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
