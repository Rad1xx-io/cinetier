/**
 * Server-rendered first page for the catalogue listings.
 *
 * Each catalogue is a client component: filters, debounced search and
 * load-more all live in the browser, and that stays. What did not exist was
 * anything in the HTML — a crawler with no JavaScript saw a skeleton and left,
 * so four pages full of content were invisible to search.
 *
 * The server now renders the *default* listing only, and deliberately does not
 * read searchParams. Two reasons. The bare URL is the one a crawler and a
 * first-time visitor arrive at, so it is the one worth having in the HTML; and
 * ignoring the query string keeps these pages cacheable instead of rendering
 * per unique filter combination. A visitor who arrives with filters in the URL
 * gets the same client fetch as before.
 */

/*
 * Each page sets its own `export const revalidate = 300` rather than importing
 * one from here: Next reads segment config statically and rejects a value it
 * cannot resolve at build time.
 */

/**
 * Runs a server-side catalogue load, answering with null instead of throwing.
 *
 * A catalogue that is rate-limited or down must not take its page with it: the
 * client still mounts, still fetches, and still shows its own error. The only
 * thing lost is the head start.
 */
export async function loadInitial<T>(label: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    console.error(`[catalog] ${label} did not render server-side:`, error);
    return null;
  }
}
