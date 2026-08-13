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
    label: "СНГ",
    countries: [
      { code: "RU", label: "Россия" },
      { code: "UA", label: "Украина" },
      { code: "BY", label: "Беларусь" },
      { code: "KZ", label: "Казахстан" },
      { code: "UZ", label: "Узбекистан" },
      { code: "AM", label: "Армения" },
      { code: "AZ", label: "Азербайджан" },
      { code: "KG", label: "Киргизия" },
      { code: "MD", label: "Молдова" },
      { code: "TJ", label: "Таджикистан" },
    ],
  },
  {
    id: "europe",
    label: "Европа",
    countries: [
      { code: "DE", label: "Германия" },
      { code: "FR", label: "Франция" },
      { code: "GB", label: "Великобритания" },
      { code: "IT", label: "Италия" },
      { code: "ES", label: "Испания" },
      { code: "PL", label: "Польша" },
      { code: "NL", label: "Нидерланды" },
      { code: "SE", label: "Швеция" },
    ],
  },
  {
    id: "america",
    label: "Америка",
    countries: [
      { code: "US", label: "США" },
      { code: "CA", label: "Канада" },
      { code: "BR", label: "Бразилия" },
      { code: "MX", label: "Мексика" },
      { code: "AR", label: "Аргентина" },
    ],
  },
  {
    id: "asia",
    label: "Азия",
    countries: [
      { code: "JP", label: "Япония" },
      { code: "KR", label: "Южная Корея" },
      { code: "IN", label: "Индия" },
      { code: "CN", label: "Китай" },
      { code: "TR", label: "Турция" },
    ],
  },
  {
    id: "oceania",
    label: "Океания",
    countries: [
      { code: "AU", label: "Австралия" },
      { code: "NZ", label: "Новая Зеландия" },
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
