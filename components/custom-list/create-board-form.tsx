"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { createCustomBoard } from "@/lib/supabase/custom-lists";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImagePlus, Plus } from "lucide-react";

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
    <form
      onSubmit={submit}
      className="rounded-2xl border border-dashed border-border bg-surface/60 p-4 transition-colors focus-within:border-accent/60 hover:border-accent/40 sm:p-5"
    >
      <div className="flex items-center gap-2 text-accent">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10">
          <ImagePlus className="h-4.5 w-4.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Start a new board</p>
          <p className="text-xs text-muted">
            Name it, then add pictures and drag them into tiers.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="Name a new board — “Holiday photos”, “Every cat I met”"
          className="w-full min-w-0 sm:flex-1"
          aria-label="Board name"
        />
        {/* Full width on a phone: sharing the row left the name box too
            narrow to read what had been typed into it. */}
        <Button type="submit" className="w-full sm:w-auto" disabled={title.trim().length === 0 || busy}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          {busy ? "Creating…" : "Create board"}
        </Button>
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </form>
  );
}
