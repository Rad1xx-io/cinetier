"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Download, ListChecks, LogOut, Settings as SettingsIcon, User, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { useSupabaseSession } from "@/lib/hooks/use-supabase-session";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

/** Closes `open` on outside click / Escape — same hand-rolled popover pattern as QuickTierMenu and CountrySelect. */
function useDismiss(open: boolean, close: () => void) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, close]);

  return rootRef;
}

interface AuthAreaProps {
  /** Mobile header: single icon-ish trigger and no inline email text. */
  compact?: boolean;
}

export function AuthArea({ compact = false }: AuthAreaProps) {
  const { configured, loading, user } = useSupabaseSession();

  if (!configured) return null;
  if (loading) return <Skeleton className="h-9 w-9 rounded-full" />;
  if (user) return <AccountMenu email={user.email ?? ""} compact={compact} />;
  return <SignedOutButtons compact={compact} />;
}

function SignedOutButtons({ compact }: { compact: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useDismiss(open, () => setOpen(false));

  return (
    <div ref={rootRef} className="relative flex items-center gap-2">
      {compact ? (
        <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
          Sign in
        </Button>
      ) : (
        <>
          {/* Between md and lg the desktop nav is too tight for two full-width buttons — collapse to one. */}
          <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setOpen((v) => !v)}>
            Sign in
          </Button>
          <Button variant="ghost" size="sm" className="hidden lg:inline-flex" onClick={() => setOpen((v) => !v)}>
            Sign in
          </Button>
          <Button size="sm" className="hidden lg:inline-flex" onClick={() => setOpen((v) => !v)}>
            Create account
          </Button>
        </>
      )}

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 max-w-[90vw] rounded-xl border border-border bg-surface-raised p-4 shadow-xl">
          <h2 className="text-sm font-semibold">Sign in to TierListOnline</h2>
          <p className="mt-1 text-xs text-muted">
            If you do not have an account yet, one is created for you.
          </p>
          <div className="mt-3">
            <MagicLinkForm redirectTo="/" />
          </div>
        </div>
      )}
    </div>
  );
}

function AccountMenu({ email, compact }: { email: string; compact: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useDismiss(open, () => setOpen(false));
  const initial = (email.charAt(0) || "?").toUpperCase();

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase?.auth.signOut();
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-surface-raised"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
          {initial}
        </span>
        {!compact && (
          <>
            <span className="hidden max-w-[140px] truncate text-sm text-muted lg:inline">{email}</span>
            <ChevronDown className="hidden h-3.5 w-3.5 text-muted lg:inline" aria-hidden />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account menu"
          className="absolute right-0 top-full z-30 mt-2 w-56 rounded-xl border border-border bg-surface-raised p-1.5 shadow-xl"
        >
          <p className="truncate px-2.5 py-1.5 text-xs text-muted lg:hidden">{email}</p>
          <MenuLink href="/profile" icon={User} label="Profile" onClick={() => setOpen(false)} />
          <MenuLink href="/tier-list" icon={ListChecks} label="My rankings" onClick={() => setOpen(false)} />
          {/* Also in the desktop overflow, but the account menu is the only way
              to reach it from a phone — the tab bar is full. */}
          <MenuLink href="/custom" icon={Images} label="Custom lists" onClick={() => setOpen(false)} />
          <MenuLink href="/settings" icon={SettingsIcon} label="Settings" onClick={() => setOpen(false)} />
          <MenuLink href="/settings#export" icon={Download} label="Export data" onClick={() => setOpen(false)} />
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-tier-s transition-colors hover:bg-tier-s/10"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon: Icon,
  label,
  onClick,
}: {
  href: string;
  icon: typeof User;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-surface"
      )}
    >
      <Icon className="h-4 w-4 text-muted" aria-hidden />
      {label}
    </Link>
  );
}
