export type DeviceType = "mobile" | "tablet" | "desktop";

export interface AnalyticsContext {
  session_id: string;
  device_type: DeviceType;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer: string | null;
}

const SESSION_KEY = "cinetier:analytics:session";
const ATTRIBUTION_KEY = "cinetier:analytics:attribution";

/** Long enough that a normal visit is one session, short enough that tomorrow is a new one. */
const SESSION_TTL_MS = 30 * 60 * 1000;

interface StoredSession {
  id: string;
  /** Refreshed on every read, so a session ends after inactivity rather than at a fixed hour. */
  lastSeenAt: number;
}

interface StoredAttribution {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer: string | null;
}

/**
 * Last-resort store for browsers that reject both localStorage and cookies.
 *
 * Analytics must never be the thing that throws, so every layer degrades:
 * localStorage, then a cookie, then this — which lasts one page load and is
 * still better than crashing on a private-mode visitor.
 */
const memoryStore = new Map<string, string>();

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(key);
    if (value !== null) return value;
  } catch {
    // Private mode or storage disabled — fall through to the cookie.
  }

  const match = document.cookie.match(new RegExp(`(?:^|; )${key.replace(/[:.]/g, "\\$&")}=([^;]*)`));
  if (match) return decodeURIComponent(match[1]);

  return memoryStore.get(key) ?? null;
}

function writeStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
    return;
  } catch {
    // Fall through.
  }

  try {
    // Session-scoped: no Expires, so it goes when the browser does.
    document.cookie = `${key}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
    if (document.cookie.includes(key)) return;
  } catch {
    // Fall through.
  }

  memoryStore.set(key, value);
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The id for the current visit, minted on first use and reused until the
 * visitor has been idle past the TTL.
 */
export function getSessionId(): string {
  const now = Date.now();
  const raw = readStorage(SESSION_KEY);

  if (raw) {
    try {
      const stored = JSON.parse(raw) as StoredSession;
      if (stored.id && now - stored.lastSeenAt < SESSION_TTL_MS) {
        writeStorage(SESSION_KEY, JSON.stringify({ id: stored.id, lastSeenAt: now }));
        return stored.id;
      }
    } catch {
      // Corrupt entry — replaced below rather than trusted.
    }
  }

  const id = createId();
  writeStorage(SESSION_KEY, JSON.stringify({ id, lastSeenAt: now }));
  return id;
}

function currentUrlAttribution(): StoredAttribution | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const source = params.get("utm_source");
  const medium = params.get("utm_medium");
  const campaign = params.get("utm_campaign");
  const referrer = document.referrer || null;

  // Nothing to record: no campaign tags and arrived with no referrer either.
  if (!source && !medium && !campaign && !referrer) return null;

  return {
    utm_source: source,
    utm_medium: medium,
    utm_campaign: campaign,
    referrer,
  };
}

/**
 * Campaign tags and referrer from the visit that started this session.
 *
 * First-touch on purpose: the tags live in the URL of the landing page only, so
 * re-reading them on later navigations would overwrite a real source with
 * nothing. Stored once and left alone for the rest of the session.
 */
export function getAttribution(): StoredAttribution {
  const empty: StoredAttribution = {
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    referrer: null,
  };

  const raw = readStorage(ATTRIBUTION_KEY);
  if (raw) {
    try {
      return { ...empty, ...(JSON.parse(raw) as StoredAttribution) };
    } catch {
      // Corrupt entry — recaptured below.
    }
  }

  const captured = currentUrlAttribution();
  if (!captured) return empty;

  writeStorage(ATTRIBUTION_KEY, JSON.stringify(captured));
  return captured;
}

/** Viewport-based, matching the breakpoints the layout itself uses. */
export function getDeviceType(): DeviceType {
  if (typeof window === "undefined") return "desktop";
  const width = window.innerWidth;
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

export function getAnalyticsContext(): AnalyticsContext {
  return {
    session_id: getSessionId(),
    device_type: getDeviceType(),
    ...getAttribution(),
  };
}

/** Clears both stored keys. Exists for tests and for a "forget me" control. */
export function resetAnalyticsSession(): void {
  memoryStore.clear();
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(ATTRIBUTION_KEY);
  } catch {
    // Nothing to clear there.
  }
  document.cookie = `${SESSION_KEY}=; path=/; Max-Age=0`;
  document.cookie = `${ATTRIBUTION_KEY}=; path=/; Max-Age=0`;
}
