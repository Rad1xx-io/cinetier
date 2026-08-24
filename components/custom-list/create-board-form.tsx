"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { createCustomBoard } from "@/lib/supabase/custom-lists";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Naming a new board.
 *
 * The board is created with its starter tiers already in place, so the first
 * thing after this is adding a picture rather than building a scaffold.
 */
export function CreateBoardForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setBusy(true);
    setError("");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Sign in first.");
      setBusy(false);
      return;
    }

    const outcome = await createCustomBoard(supabase, user.id, title.trim());
    setBusy(false);
    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    router.push(`/custom/${outcome.id}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        placeholder="Name a new board — “Holiday photos”, “Every cat I met”"
        className="min-w-0 flex-1"
        aria-label="Board name"
      />
      <Button type="submit" size="sm" disabled={title.trim().length === 0 || busy}>
        {busy ? "Creating…" : "Create board"}
      </Button>
      {error && <p className="w-full text-xs text-red-400">{error}</p>}
    </form>
  );
}
