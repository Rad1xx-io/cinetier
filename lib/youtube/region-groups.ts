/**
 * The YouTube Data API only filters by a single ISO 3166-1 country code
 * (`regionCode`) — there's no "CIS" or "Europe" region built in. These groups
 * are our own curated grouping for the UI filter; picking a group narrows the
 * country dropdown, but the actual API call always uses one specific country.
 */
export interface RegionCountry {
  code: string;
  label: string;
}

export interface RegionGroup {
  id: string;
  label: string;
  countries: RegionCountry[];
}

export const REGION_GROUPS: RegionGroup[] = [
  {
    id: "sng",
    label: "CIS",
    countries: [
      { code: "RU", label: "Russia" },
      { code: "UA", label: "Ukraine" },
      { code: "BY", label: "Belarus" },
      { code: "KZ", label: "Kazakhstan" },
      { code: "UZ", label: "Uzbekistan" },
      { code: "AM", label: "Armenia" },
      { code: "AZ", label: "Azerbaijan" },
      { code: "KG", label: "Kyrgyzstan" },
      { code: "MD", label: "Moldova" },
      { code: "TJ", label: "Tajikistan" },
    ],
  },
  {
    id: "europe",
    label: "Europe",
    countries: [
      { code: "DE", label: "Germany" },
      { code: "FR", label: "France" },
      { code: "GB", label: "United Kingdom" },
      { code: "IT", label: "Italy" },
      { code: "ES", label: "Spain" },
      { code: "PL", label: "Poland" },
      { code: "NL", label: "Netherlands" },
      { code: "SE", label: "Sweden" },
    ],
  },
  {
    id: "america",
    label: "Americas",
    countries: [
      { code: "US", label: "United States" },
      { code: "CA", label: "Canada" },
      { code: "BR", label: "Brazil" },
      { code: "MX", label: "Mexico" },
      { code: "AR", label: "Argentina" },
    ],
  },
  {
    id: "asia",
    label: "Asia",
    countries: [
      { code: "JP", label: "Japan" },
      { code: "KR", label: "South Korea" },
      { code: "IN", label: "India" },
      { code: "CN", label: "China" },
      { code: "TR", label: "Turkey" },
    ],
  },
  {
    id: "oceania",
    label: "Oceania",
    countries: [
      { code: "AU", label: "Australia" },
      { code: "NZ", label: "New Zealand" },
    ],
  },
];

export const ALL_COUNTRIES: RegionCountry[] = REGION_GROUPS.flatMap((g) => g.countries);

export function findCountryLabel(code: string): string {
  for (const group of REGION_GROUPS) {
    const match = group.countries.find((c) => c.code === code);
    if (match) return match.label;
  }
  return code;
}

/** ISO 3166-1 alpha-2 -> flag emoji via regional indicator symbol offset. */
export function flagEmoji(code: string): string {
  if (code.length !== 2) return "";
  return code
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(c.charCodeAt(0) + 127397));
}
