"use client";

import { useState } from "react";
import { Check, Link2, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  saveProfile,
  setProfileForkPolicy,
  setProfileVisibility,
  validateUsername,
  type Profile,
} from "@/lib/supabase/profiles";
import { trackListPublished } from "@/lib/analytics/events";

interface UsernameFormProps {
  userId: string;
  profile: Profile | null;
  onSaved: (profile: Profile) => void;
}

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "error"; message: string } | { kind: "saved" };

export function UsernameForm({ userId, profile, onSaved }: UsernameFormProps) {
  const [username, setUsername] = useState(profile?.username ?? "");
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [donationUrl, setDonationUrl] = useState(profile?.donationUrl ?? "");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const localError = username ? validateUsername(username) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "saving" });
    const result = await saveProfile({ userId, username, displayName, donationUrl });
    if (result.ok) {
      setStatus({ kind: "saved" });
      onSaved(result.profile);
    } else {
      setStatus({ kind: "error", message: result.error });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-surface p-4">
      <h2 className="font-semibold">Public profile</h2>
      <p className="mt-1 text-sm text-muted">
        A username gives your tier list a permanent address you can share.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Username</span>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted">@</span>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="username"
              aria-label="Username"
              autoComplete="off"
              required
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Display name</span>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How you appear to others"
            aria-label="Display name"
            autoComplete="off"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-muted">
            Support link <span className="font-normal">— optional</span>
          </span>
          <Input
            value={donationUrl}
            onChange={(e) => setDonationUrl(e.target.value)}
            placeholder="https://boosty.to/…, CloudTips, Patreon"
            aria-label="Support link"
            inputMode="url"
            autoComplete="off"
          />
          <span className="mt-1 block text-xs text-muted">
            Appears as a “Support” button on your public page. TierListOnline accepts no payments
            and withholds nothing — the visitor goes straight to your service.
          </span>
        </label>
      </div>

      {username && !localError && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Link: /u/{username}
        </p>
      )}
      {localError && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-tier-s">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {localError}
        </p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <Button type="submit" size="sm" disabled={status.kind === "saving" || Boolean(localError)}>
          {status.kind === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {profile ? "Save" : "Claim username"}
        </Button>

        {status.kind === "saved" && (
          <span className="flex items-center gap-1.5 text-sm text-accent">
            <Check className="h-3.5 w-3.5" aria-hidden />
            Saved
          </span>
        )}
        {status.kind === "error" && (
          <span className="flex items-center gap-1.5 text-sm text-tier-s">
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
            {status.message}
          </span>
        )}
      </div>

      {profile && (
        <div className="mt-3 flex items-start gap-2.5 border-t border-border pt-3">
          <input
            id="is-public"
            type="checkbox"
            checked={profile.isPublic}
            onChange={async (e) => {
              const next = e.target.checked;
              const ok = await setProfileVisibility(userId, next);
              if (ok) {
                onSaved({ ...profile, isPublic: next });
                // Only the switch to public is a publication; turning it back
                // off is the opposite and has no event of its own.
                if (next) trackListPublished(profile.username);
              }
            }}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
          />
          <label htmlFor="is-public" className="text-xs leading-relaxed text-muted">
            <span className="font-medium text-foreground">Publish my tier list.</span> While this is
            on, anyone holding the address can read it — including visitors with no account.
            Clear it to close access without giving up the username.
          </label>
        </div>
      )}

      {profile?.isPublic && (
        <div className="mt-3 flex items-start gap-2.5">
          <input
            id="allow-fork"
            type="checkbox"
            checked={profile.allowFork}
            onChange={async (e) => {
              const next = e.target.checked;
              const ok = await setProfileForkPolicy(userId, next);
              if (ok) onSaved({ ...profile, allowFork: next });
            }}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
          />
          <label htmlFor="allow-fork" className="text-xs leading-relaxed text-muted">
            <span className="font-medium text-foreground">
              Let other people fork my tier list.
            </span>{" "}
            Visitors can copy your arrangement onto their own board. Turning this off hides the
            button — though anything visible on the page can still be retyped by hand.
          </label>
        </div>
      )}
    </form>
  );
}
