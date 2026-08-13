"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveProfile, validateUsername, type Profile } from "@/lib/supabase/profiles";

interface UsernameDialogProps {
  userId: string;
  open: boolean;
  onClose: () => void;
  onSaved: (profile: Profile) => void;
}

/**
 * Claiming a handle without leaving the tier list.
 *
 * A native <dialog> gives focus trapping, Escape handling and the backdrop for
 * free — worth more here than matching the hand-rolled popovers used elsewhere,
 * because this one takes text input and blocks on a network round trip.
 */
export function UsernameDialog({ userId, open, onClose, onSaved }: UsernameDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const localError = username ? validateUsername(username) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await saveProfile({ userId, username, displayName: "" });
    setSaving(false);
    if (result.ok) {
      onSaved(result.profile);
      onClose();
    } else {
      setError(result.error);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // The backdrop is a pseudo-element, so closing on outside click means
      // checking that the click landed on the dialog box itself.
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="w-[min(28rem,92vw)] rounded-2xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={handleSubmit} className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Придумайте юзернейм</h2>
            <p className="mt-1 text-sm text-muted">
              Он станет постоянным адресом вашего тир-листа.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-lg p-1 text-muted transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-1.5">
          <span className="text-sm text-muted">@</span>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="username"
            aria-label="Юзернейм"
            autoComplete="off"
            autoFocus
            required
          />
        </div>

        {username && !localError && (
          <p className="mt-2 truncate text-xs text-muted">Ссылка: /u/{username}</p>
        )}
        {(localError || error) && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-tier-s">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {localError ?? error}
          </p>
        )}

        <p className="mt-3 rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs leading-relaxed text-muted">
          После этого тир-лист станет доступен по ссылке любому, у кого она есть. Отключить можно в
          профиле.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" size="sm" disabled={saving || Boolean(localError) || !username}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            Занять и скопировать ссылку
          </Button>
        </div>
      </form>
    </dialog>
  );
}
