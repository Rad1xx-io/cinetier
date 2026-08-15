import type { LucideIcon } from "lucide-react";
import {
  Settings,
  Clapperboard,
  Drama,
  Gamepad2,
  ListChecks,
  SquarePlay,
  MessagesSquare,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// No "Home" entry anywhere: the logo is the way home on desktop, and the
// mobile tab bar leads with the tier list instead.
const MOVIES: NavItem = { href: "/discover", label: "Films", icon: Clapperboard };
const ANIME: NavItem = { href: "/anime", label: "Anime", icon: Drama };
const YOUTUBE: NavItem = { href: "/youtube", label: "YouTube", icon: SquarePlay };
const GAMES: NavItem = { href: "/games", label: "Games", icon: Gamepad2 };
const FEED: NavItem = { href: "/feed", label: "Feed", icon: MessagesSquare };
const SETTINGS: NavItem = { href: "/settings", label: "Settings", icon: Settings };

/**
 * The tab the whole app exists for. It gets the centre slot of the desktop
 * header and a look of its own, rather than sitting in the row of categories:
 * the categories are where you *find* things, this is where you rank them.
 */
export const TIER_LIST_NAV_ITEM: NavItem = {
  href: "/tier-list",
  label: "Tier list",
  icon: ListChecks,
};

/**
 * The mobile tab bar. It leads with the tier list rather than a dashboard —
 * on a phone the ranking board is what you actually open the app for, and the
 * home page stays one tap away through the logo in the mobile header.
 *
 * Its length drives BottomNav's column count; keep the two in step.
 */
export const NAV_ITEMS: NavItem[] = [
  TIER_LIST_NAV_ITEM,
  FEED,
  MOVIES,
  ANIME,
  YOUTUBE,
  GAMES,
  SETTINGS,
];

/**
 * The categories flanking the centred tier-list tab, split evenly so the header
 * reads as balanced. The grid centres the middle column regardless of how wide
 * either side ends up, so these two lists only need to be roughly even, not
 * pixel-matched.
 */
export const DESKTOP_NAV_LEFT: NavItem[] = [FEED, MOVIES, ANIME];
export const DESKTOP_NAV_RIGHT: NavItem[] = [YOUTUBE, GAMES];

/** Categories that don't get a primary header slot yet — rendered under "More" once non-empty. */
export const NAV_OVERFLOW_ITEMS: NavItem[] = [];

/** `/` only matches exactly; other routes also match their nested sub-pages (e.g. /youtube/tier-list). */
export function isNavItemActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
