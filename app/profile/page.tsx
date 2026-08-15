"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Copy, ExternalLink, ListChecks, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Toast } from "@/components/ui/toast";
import { ContentTypeBadge } from "@/components/ui/content-type-badge";
import { Poster } from "@/components/movie-card/poster";
import { ChannelThumbnail } from "@/components/channel-card/channel-thumbnail";
import { UsernameForm } from "@/components/profile/username-form";
import { useSupabaseSession } from "@/lib/hooks/use-supabase-session";
import { useRankedTitles } from "@/lib/hooks/use-ranked-titles";
import { useRankedChannels } from "@/lib/hooks/use-ranked-channels";
import { useToast } from "@/lib/hooks/use-toast";
import { getMyProfile, type Profile } from "@/lib/supabase/profiles";
import { TierPill } from "@/components/movie-card/tier-pill";
import { titleHref } from "@/lib/utils/title-route";
import { cn } from "@/lib/utils/cn";
import type { ContentType } from "@/lib/utils/content-type";

type RatingsTab = "all" | ContentType;

const TABS: { value: RatingsTab; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "movie", label: "Фильмы" },
  { value: "tv", label: "Сериалы" },
  { value: "anime", label: "Аниме" },
  { value: "game", label: "Игры" },
  { value: "youtube", label: "YouTube" },
];

export default function ProfilePage() {
  const { configured, loading, user } = useSupabaseSession();
  const { titles } = useRankedTitles();
  const { channels } = useRankedChannels();
  const { toast, show: notify } = useToast();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<RatingsTab>("all");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMyProfile(user.id).then((p) => {
      if (!cancelled) setProfile(p);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const counts = useMemo(() => {
    const by = (t: ContentType) => titles.filter((x) => x.mediaType === t).length;
    return {
      movieTv: by("movie") + by("tv"),
      anime: by("anime"),
      game: by("game"),
      youtube: channels.length,
    };
  }, [titles, channels]);

  const visibleTitles = useMemo(() => {
    if (tab === "all") return titles;
    if (tab === "youtube") return [];
    return titles.filter((t) => t.mediaType === tab);
  }, [titles, tab]);

  const visibleChannels = tab === "all" || tab === "youtube" ? channels : [];

  if (!configured) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-sm text-muted">
          Облачные аккаунты не настроены на этом развёртывании — TierListOnline работает в гостевом
          режиме, профиль недоступен.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8 md:px-6">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-sm text-muted">Войдите, чтобы увидеть профиль.</p>
        <Button asChild variant="secondary" className="mt-4">
          <Link href="/settings">Войти</Link>
        </Button>
      </div>
    );
  }

  const handle = profile ? `@${profile.username}` : null;
  const heading = profile?.displayName || handle || "Профиль";
  const initial = (profile?.displayName ?? profile?.username ?? user.email ?? "?")
    .charAt(0)
    .toUpperCase();
  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString("ru-RU", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  async function copyShareLink() {
    if (!profile) return;
    const url = `${window.location.origin}/u/${profile.username}`;
    try {
      await navigator.clipboard.writeText(url);
      notify("Ссылка скопирована!");
    } catch {
      notify(url);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:px-6">
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent text-xl font-semibold text-accent-foreground">
          {initial}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight">{heading}</h1>
          {/* The handle replaces the email here: this is the identity other people see. */}
          {handle ? (
            <p className="text-sm text-muted">{handle}</p>
          ) : (
            <p className="text-sm text-muted">Юзернейм не задан</p>
          )}
          {memberSince && <p className="text-xs text-muted">С нами с {memberSince}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard value={counts.movieTv} label="Фильмов и сериалов" />
        <StatCard value={counts.anime} label="Аниме" />
        <StatCard value={counts.game} label="Игр" />
        <StatCard value={counts.youtube} label="YouTube-каналов" />
      </div>

      <UsernameForm userId={user.id} profile={profile} onSaved={setProfile} />

      {profile && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={copyShareLink}>
            <Copy className="h-3.5 w-3.5" aria-hidden />
            Скопировать ссылку
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/u/${profile.username}`}>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Открыть публичный вид
            </Link>
          </Button>
        </div>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Мои рейтинги</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/tier-list">
              <ListChecks className="h-3.5 w-3.5" aria-hidden />
              Открыть тир-лист
            </Link>
          </Button>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Фильтр по типу">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              aria-pressed={tab === t.value}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                tab === t.value
                  ? "border-transparent bg-accent text-accent-foreground"
                  : "border-border text-muted hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {visibleTitles.length + visibleChannels.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
            Здесь пока пусто.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {visibleTitles.map((t) => (
              <Link
                key={`${t.mediaType}-${t.tmdbId}`}
                href={titleHref(t.mediaType, t.tmdbId)}
                className="w-20 shrink-0 sm:w-24"
              >
                <div className="relative">
                  <Poster posterPath={t.posterPath} title={t.title} sizes="96px" />
                  <TierPill tier={t.tier} className="absolute left-1.5 top-1.5 shadow" />
                </div>
                <p className="mt-1.5 line-clamp-1 break-words text-[11px] font-medium">{t.title}</p>
                <ContentTypeBadge type={t.mediaType} className="mt-0.5" />
              </Link>
            ))}

            {visibleChannels.map((c) => (
              <Link
                key={c.channelId}
                href={`/youtube/channel/${c.channelId}`}
                className="w-20 shrink-0 sm:w-24"
              >
                <div className="relative">
                  <ChannelThumbnail thumbnailUrl={c.thumbnailUrl} title={c.title} sizes="96px" />
                  <TierPill tier={c.tier} className="absolute left-1.5 top-1.5 shadow" />
                </div>
                <p className="mt-1.5 line-clamp-1 break-words text-[11px] font-medium">{c.title}</p>
                <ContentTypeBadge type="youtube" className="mt-0.5" />
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/settings">
            <SettingsIcon className="h-3.5 w-3.5" aria-hidden />
            Настройки
          </Link>
        </Button>
      </div>

      <Toast toast={toast} />
    </div>
  );
}

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
