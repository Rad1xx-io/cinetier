/**
 * English pluralisation: a count and a noun, singular only at exactly one.
 *
 * Replaces the three-form Russian rule this app shipped with. English needs one
 * branch where Russian needed three, so the helper is smaller, but it stays a
 * helper: the count and its noun are decided together in one place rather than
 * at eight call sites.
 */
export function plural(n: number, one: string, many = `${one}s`): string {
  return Math.abs(n) === 1 ? one : many;
}

/** e.g. "1 title" / "12 titles". */
export function titlesCountLabel(n: number): string {
  return `${n} ${plural(n, "title")}`;
}
