"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { useSupabaseSession } from "@/lib/hooks/use-supabase-session";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function AccountPanel() {
  const { configured, loading, user } = useSupabaseSession();

  // Cloud accounts aren't set up on this deployment — the app is guest-only,
  // stay silent rather than showing a broken/half-configured account section.
  if (!configured) return null;

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
        Проверяем сессию…
      </div>
    );
  }

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase?.auth.signOut();
  }

  if (user) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold">Аккаунт</h2>
        <p className="mt-1 text-sm text-muted">
          Вы вошли как <span className="text-foreground">{user.email}</span>. Рейтинг
          синхронизируется с облаком и будет доступен с любого устройства.
        </p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={handleSignOut}>
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          Выйти
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h2 className="font-semibold">Аккаунт</h2>
      <p className="mt-1 text-sm text-muted">
        Сейчас вы гость — рейтинг хранится только в этом браузере. Войдите, чтобы
        синхронизировать его между устройствами.
      </p>
      <div className="mt-3">
        <MagicLinkForm redirectTo="/settings" />
      </div>
    </div>
  );
}
