import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toSvg } from "html-to-image";
import { TRANSPARENT_PIXEL, boardSvgOptions } from "@/lib/utils/board-export";

/**
 * The export is allowed to fail quietly — a cover that will not load becomes a
 * transparent pixel so one bad poster cannot cost the whole board. That is the
 * right behaviour and it is also why this bug shipped: every cover failed at
 * once, the export succeeded, and the PNG was a full set of blank cards.
 *
 * So these tests do not ask whether the export threw. They ask what is in the
 * card, which is the only question a blank board answers differently.
 */

/** Enough bytes to be a picture rather than a placeholder. */
const COVER_BYTES = new Uint8Array(600).fill(0x42);
COVER_BYTES.set([0xff, 0xd8, 0xff, 0xe0], 0); // JPEG SOI, so the type is honest.

/**
 * What the browser really does, and what no unit test had modelled.
 *
 * A cover displayed by a plain `<img>` with no `crossOrigin` is fetched in
 * no-cors mode and cached as an opaque response. A later `fetch` for the same
 * URL is a cors request, the opaque entry cannot answer it, and the browser
 * rejects it with a bare `TypeError: Failed to fetch` — no status, no CORS
 * message, nothing to distinguish it from the network being down. Only a
 * request allowed past that entry reaches the CDN, which has been willing all
 * along.
 */
function browserWithOpaqueCachedCovers() {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.cache !== "reload") throw new TypeError("Failed to fetch");
    return {
      status: 200,
      url: String(_url),
      headers: new Headers({ "Content-Type": "image/jpeg" }),
      blob: async () => new Blob([COVER_BYTES], { type: "image/jpeg" }),
    } as unknown as Response;
  });
}

/** A board of cards, each with a cover and the small caption underneath. */
function buildBoard(id: string, count: number) {
  const board = document.createElement("div");
  for (let i = 0; i < count; i += 1) {
    const card = document.createElement("div");
    card.dataset.testCard = String(i);

    const cover = document.createElement("img");
    // Unique per test: html-to-image caches what it inlines for the life of the
    // module, so shared urls would let one test's success answer another's
    // fetch — the exact way a test passes without exercising anything.
    cover.src = `https://image.tmdb.org/t/p/w342/${id}-${i}.jpg`;
    cover.alt = `Film ${i} poster`;
    card.appendChild(cover);

    const caption = document.createElement("span");
    caption.textContent = `Film ${i} · 2026 · Film`;
    card.appendChild(caption);

    board.appendChild(card);
  }
  document.body.appendChild(board);
  return board;
}

/** The covers as they will actually be painted, one entry per card. */
function coversInExport(svg: string): string[] {
  const markup = decodeURIComponent(svg.replace(/^data:image\/svg\+xml;charset=utf-8,/, ""));
  return [...markup.matchAll(/<img[^>]*\ssrc="([^"]*)"/g)].map((m) => m[1]);
}

/*
 * jsdom has no SVGImageElement, and the library type-checks against it while
 * walking the tree. Absent, every node it touches throws before a single cover
 * is looked at — which is a gap in the test environment, not in the export.
 */
class StubSvgImageElement {}

/*
 * jsdom never loads an image, so it never fires `load` — and the library waits
 * for that event after swapping in the data it just inlined. Left alone the
 * export simply hangs here, which says nothing about the browser. This makes
 * assignment to `src` behave the way a real one does.
 */
function letImagesLoad(): () => void {
  const proto = HTMLImageElement.prototype;
  const original = Object.getOwnPropertyDescriptor(proto, "src");
  Object.defineProperty(proto, "src", {
    configurable: true,
    get(this: HTMLImageElement) {
      return this.getAttribute("src") ?? "";
    },
    set(this: HTMLImageElement, value: string) {
      this.setAttribute("src", value);
      queueMicrotask(() => this.dispatchEvent(new Event("load")));
    },
  });
  return () => {
    if (original) Object.defineProperty(proto, "src", original);
  };
}

let restoreImages: () => void;

beforeEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.stubGlobal("SVGImageElement", StubSvgImageElement);
  restoreImages = letImagesLoad();
});

afterEach(() => restoreImages());

describe("every card in the exported board carries its cover", () => {
  it("inlines real image data for each card, not the blank placeholder", async () => {
    vi.stubGlobal("fetch", browserWithOpaqueCachedCovers());

    const board = buildBoard("carries", 6);
    const svg = await toSvg(board, { ...boardSvgOptions(), width: 400, height: 600 });

    const covers = coversInExport(svg);
    expect(covers).toHaveLength(6);
    for (const [index, cover] of covers.entries()) {
      // The failure this catches: a card whose whole picture is one
      // transparent pixel, in an export that reported success.
      expect(cover, `card ${index} exported blank`).not.toBe(TRANSPARENT_PIXEL);
      expect(cover, `card ${index} has no image data`).toMatch(/^data:image\/jpeg;base64,/);
      expect(cover.length, `card ${index} holds too little to be a cover`).toBeGreaterThan(200);
    }
  });

  it("asks for the covers in a way the browser's cache cannot refuse", async () => {
    const fetchSpy = browserWithOpaqueCachedCovers();
    vi.stubGlobal("fetch", fetchSpy);

    const board = buildBoard("asks", 3);
    await toSvg(board, { ...boardSvgOptions(), width: 400, height: 600 });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    for (const [, init] of fetchSpy.mock.calls) {
      expect(init?.cache).toBe("reload");
    }
  });

  it("still exports the rest of the board when one cover genuinely 404s", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.cache !== "reload") throw new TypeError("Failed to fetch");
        if (url.endsWith("-1.jpg")) return { status: 404, url } as unknown as Response;
        return {
          status: 200,
          url,
          headers: new Headers({ "Content-Type": "image/jpeg" }),
          blob: async () => new Blob([COVER_BYTES], { type: "image/jpeg" }),
        } as unknown as Response;
      })
    );

    const board = buildBoard("404s", 3);
    const covers = coversInExport(await toSvg(board, { ...boardSvgOptions(), width: 400, height: 600 }));

    expect(covers[1]).toBe(TRANSPARENT_PIXEL);
    expect(covers[0]).toMatch(/^data:image\/jpeg;base64,/);
    expect(covers[2]).toMatch(/^data:image\/jpeg;base64,/);
  });
});

describe("covers that live in a private bucket", () => {
  it("inlines signed Supabase urls the same way, token and all", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        seen.push(url);
        // Storage answers `Access-Control-Allow-Origin: *` and honours the
        // preflight, so a cors fetch is allowed — but the page's own `<img>`
        // fetched it without cors first, and that cached entry cannot answer
        // one. Only a request told to skip the cache gets through.
        if (init?.cache !== "reload") throw new TypeError("Failed to fetch");
        return {
          status: 200,
          url,
          headers: new Headers({ "Content-Type": "image/jpeg" }),
          blob: async () => new Blob([COVER_BYTES], { type: "image/jpeg" }),
        } as unknown as Response;
      })
    );

    const board = document.createElement("div");
    for (let i = 0; i < 3; i += 1) {
      const cover = document.createElement("img");
      // The real shape: a path under the bucket plus an expiring token.
      cover.src =
        `https://lsxnqqzejyvmpwxmagtd.supabase.co/storage/v1/object/sign/custom-uploads/` +
        `owner/list/signed-${i}.jpg?token=eyJhbGciOiJIUzI1NiJ9.signed-${i}`;
      cover.alt = `Card ${i}`;
      board.appendChild(cover);
    }
    document.body.appendChild(board);

    const covers = coversInExport(await toSvg(board, { ...boardSvgOptions(), width: 400, height: 600 }));

    expect(covers).toHaveLength(3);
    for (const cover of covers) {
      expect(cover).not.toBe(TRANSPARENT_PIXEL);
      expect(cover).toMatch(/^data:image\/jpeg;base64,/);
    }
    // The token is part of what identifies a cover, so it has to survive into
    // the request — and into the cache key, or three cards share one picture.
    expect(seen.every((url) => url.includes("token="))).toBe(true);
    expect(new Set(seen).size).toBe(3);
  });
});
