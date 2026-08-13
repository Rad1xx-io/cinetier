/** Raw shapes returned by Steam's storefront endpoints (subset of fields we actually use). */

export interface SteamSearchItem {
  appid: string;
  name: string;
  icon: string;
  logo: string;
}

export interface SteamAppData {
  type: string;
  name: string;
  steam_appid: number;
  short_description?: string;
  header_image?: string;
  capsule_image?: string;
  website?: string | null;
  is_free?: boolean;
  genres?: { id: string; description: string }[];
  categories?: { id: number; description: string }[];
  developers?: string[];
  publishers?: string[];
  platforms?: { windows?: boolean; mac?: boolean; linux?: boolean };
  metacritic?: { score: number; url: string };
  release_date?: { coming_soon: boolean; date: string };
  price_overview?: { final_formatted: string };
}

export interface SteamAppDetailsResponse {
  [appId: string]: { success: boolean; data?: SteamAppData };
}

export interface SteamFeaturedItem {
  id: number;
  name: string;
}

export interface SteamFeaturedCategories {
  top_sellers?: { items?: SteamFeaturedItem[] };
  new_releases?: { items?: SteamFeaturedItem[] };
  specials?: { items?: SteamFeaturedItem[] };
}
