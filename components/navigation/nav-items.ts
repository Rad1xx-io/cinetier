import type { LucideIcon } from "lucide-react";
import {
  Settings,
  Clapperboard,
  Drama,
  Gamepad2,
  ListChecks,
  SquarePlay,
  MessagesSquare,
  Smartphone,
} from "lucide-react";

/** A single destination — a real link, nothing to choose before arriving. */
export interface NavLeaf {
  kind: "leaf";
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * A top-level entry that actually leads to more than one place. The two nav
 * surfaces answer "which one?" differently, not because this type says so,
 * but because a phone has nowhere sane to anchor a dropdown off the bottom
 * edge of the screen: desktop (TopNav) renders `items` as a menu off this
 * entry; mobile (BottomNav) links straight to `hubHref`, a page that asks
 * the same question full-screen instead. See
 * .ai/PLAN-nav-and-mobile-games.md, part A.2/A.3 for why.
 */
export interface NavGroup {
  kind: "group";
  label: string;
  icon: LucideIcon;
  hubHref: string;
  items: NavLeaf[];
}

export type NavEntry = NavLeaf | NavGroup;

// No "Home" entry anywhere: the logo is the way home on desktop, and the
// mobile tab bar leads with the tier list instead.
const MOVIES: NavLeaf = { kind: "leaf", href: "/discover", label: "Films", icon: Clapperboard };
const ANIME: NavLeaf = { kind: "leaf", href: "/anime", label: "Anime", icon: Drama };
const YOUTUBE: NavLeaf = { kind: "leaf", href: "/youtube", label: "YouTube", icon: SquarePlay };

/**
 * Two platforms, not two sources of the same catalog — see
 * .ai/PLAN-nav-and-mobile-games.md (B.1): a PC game and a mobile game are
 * different products someone may well want ranked side by side, not one
 * catalog standing in for the other the way Steam/IGDB or AniList/Jikan do.
 * The label/icon this group wears are exactly what the flat "Games" entry
 * always used, so nothing about arriving at this tab changes at a glance;
 * only Mobile is new, and it gets its own icon on purpose — Gamepad2 twice
 * over would read as one option restated, not two.
 */
const GAMES: NavGroup = {
  kind: "group",
  label: "Games",
  icon: Gamepad2,
  hubHref: "/games",
  items: [
    { kind: "leaf", href: "/games/pc", label: "PC", icon: Gamepad2 },
    { kind: "leaf", href: "/games/mobile", label: "Mobile", icon: Smartphone },
  ],
};

const FEED: NavLeaf = { kind: "leaf", href: "/feed", label: "Feed", icon: MessagesSquare };
const SETTINGS: NavLeaf = { kind: "leaf", href: "/settings", label: "Settings", icon: Settings };

/**
 * The tab the whole app exists for. It gets the centre slot of the desktop
 * header and a look of its own, rather than sitting in the row of categories:
 * the categories are where you *find* things, this is where you rank them.
 */
export const TIER_LIST_NAV_ITEM: NavLeaf = {
  kind: "leaf",
  href: "/tier-list",
  label: "Tier list",
  icon: ListChecks,
};

/**
 * The mobile tab bar. It leads with the tier list rather than a dashboard —
 * on a phone the ranking board is what you actually open the app for, and the
 * home page stays one tap away through the logo in the mobile header.
 *
 * Custom boards are not a tab here, on purpose: they are a destination one
 * level down from the tier list, reached from a button in its own toolbar
 * rather than by a seventh thing to scan for on every screen. Putting it in
 * this row and in the header's catalogue group both read, on use, as "Custom
 * is a sixth catalogue" — which it never was.
 *
 * Its length drives BottomNav's column count; keep the two in step. A group
 * still costs exactly one slot here, same as a leaf — it is one tab that
 * links to its own hub page, not two tabs.
 */
export const NAV_ITEMS: NavEntry[] = [
  TIER_LIST_NAV_ITEM,
  FEED,
  MOVIES,
  ANIME,
  YOUTUBE,
  GAMES,
  SETTINGS,
];

/**
 * The two tabs sharing the desktop header's centre column: ranking your own
 * list, and watching everyone else's. Neither is a catalog you browse to
 * *find* something, which is what the flanking groups below are for — see
 * TIER_LIST_NAV_ITEM's own comment. Tier List keeps the accent treatment;
 * Feed sits beside it a step quieter (TopNav), rather than in the row of
 * catalogs it used to share with Films/Anime.
 */
export const DESKTOP_NAV_CENTER: NavLeaf[] = [TIER_LIST_NAV_ITEM, FEED];

/**
 * The categories flanking the centred tabs, split evenly so the header
 * reads as balanced. The grid centres the middle column regardless of how wide
 * either side ends up, so these two lists only need to be roughly even, not
 * pixel-matched.
 */
export const DESKTOP_NAV_LEFT: NavEntry[] = [MOVIES, ANIME];
export const DESKTOP_NAV_RIGHT: NavEntry[] = [YOUTUBE, GAMES];

function isHrefActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * `/` only matches exactly; other routes also match their nested sub-pages
 * (e.g. /youtube/tier-list). A group reads as active from its own hub page
 * or from any one of its items — landing on /games/mobile should still light
 * up "Games" in the header, not leave every tab looking closed.
 */
export function isNavItemActive(pathname: string, entry: NavEntry): boolean {
  if (entry.kind === "group") {
    return (
      isHrefActive(pathname, entry.hubHref) ||
      entry.items.some((item) => isHrefActive(pathname, item.href))
    );
  }
  return isHrefActive(pathname, entry.href);
}
