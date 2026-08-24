import type { LucideIcon } from "lucide-react";
import {
  Clapperboard,
  Drama,
  Gamepad2,
  ListChecks,
  SquarePlay,
  MessagesSquare,
  Images,
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
// Boards built from uploaded pictures rather than from a catalogue. It sits in
// the row with the catalogues all the same: it is somewhere you go, and burying
// it under a "More" menu holding one item made it look like an afterthought
// while costing a click to reach.
const CUSTOM: NavItem = { href: "/custom", label: "Custom", icon: Images };

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
 * Seven, and seven is the ceiling: at 375px an eighth leaves each tab too
 * narrow for its label. Settings is the one left out — it is a place you visit
 * rarely and deliberately, reachable from the desktop header and by its own
 * address, where the six catalogues and the board are what a thumb reaches for
 * repeatedly.
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
  CUSTOM,
];

/**
 * The categories flanking the centred tier-list tab, split evenly so the header
 * reads as balanced. The grid centres the middle column regardless of how wide
 * either side ends up, so these two lists only need to be roughly even, not
 * pixel-matched.
 */
export const DESKTOP_NAV_LEFT: NavItem[] = [FEED, MOVIES, ANIME];
export const DESKTOP_NAV_RIGHT: NavItem[] = [YOUTUBE, GAMES, CUSTOM];


/** `/` only matches exactly; other routes also match their nested sub-pages (e.g. /youtube/tier-list). */
export function isNavItemActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
