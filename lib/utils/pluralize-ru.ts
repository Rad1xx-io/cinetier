/** Picks the correct Russian plural form for a count (1 тайтл / 2 тайтла / 5 тайтлов). */
export function pluralizeRu(n: number, one: string, few: string, many: string): string {
  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

export function titlesCountLabel(n: number): string {
  return `${n} ${pluralizeRu(n, "тайтл", "тайтла", "тайтлов")}`;
}
