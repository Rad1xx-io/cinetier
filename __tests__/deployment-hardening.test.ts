import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Two findings that live in files rather than in code paths, and are therefore
 * only ever caught by reading the files.
 *
 * Both were found in production rather than in review, which is the argument
 * for asserting them here: `/e2e/custom-board` answered 200 on the live site
 * for as long as it existed, and a mutable action tag is invisible until the
 * day it moves.
 */

const WORKFLOWS = join(process.cwd(), ".github", "workflows");

describe("GitHub Actions are pinned to immutable commits", () => {
  const files = readdirSync(WORKFLOWS).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

  it("finds the workflows to check", () => {
    // A glob that matches nothing would make every assertion below vacuous.
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s pins every third-party action to a 40-character sha", (file) => {
    const content = readFileSync(join(WORKFLOWS, file), "utf8");
    const uses = [...content.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1]);

    for (const ref of uses) {
      // A local action (`./path`) or a docker image is out of scope — this is
      // about third-party repositories, whose tags the author can move.
      if (ref.startsWith("./") || ref.startsWith("docker://")) continue;

      const [, version] = ref.split("@");
      expect(
        version,
        `${file}: "${ref}" has no @ref at all, so it resolves to the default branch`
      ).toBeDefined();
      expect(
        version,
        `${file}: "${ref}" is pinned to a mutable tag or branch. A tag can be moved to a different commit by whoever owns the action, so this is a supply-chain decision made by somebody else.`
      ).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it.each(files)("%s records the human-readable version next to each sha", (file) => {
    const content = readFileSync(join(WORKFLOWS, file), "utf8");
    const lines = content.split(/\r?\n/).filter((l) => /^\s*-?\s*uses:/.test(l));

    for (const line of lines) {
      if (/uses:\s*\.\//.test(line)) continue;
      // A bare sha is unreadable and unmaintainable; the trailing comment is
      // how the next person knows what they are looking at and what to bump.
      expect(line, `${file}: "${line.trim()}" is a sha with no version comment`).toMatch(
        /#\s*v?\d+\.\d+\.\d+|#\s*v\d+/
      );
    }
  });
});

describe("the e2e fixture route is gated", () => {
  const PAGE = join(process.cwd(), "app", "e2e", "custom-board", "page.tsx");
  const source = readFileSync(PAGE, "utf8");

  /*
   * Asserted against the source rather than by rendering, deliberately. The
   * gate is a module-scope constant read at build time — that is the whole
   * point of it, since `notFound()` on a prerendered page removes the route
   * from the bundle rather than answering per request — so there is no render
   * to exercise that would prove anything about a production build. The build
   * itself was verified by hand: production returns 404, the Playwright build
   * returns the fixture, and the suite still passes 15/15.
   */
  it("calls notFound() rather than rendering unconditionally", () => {
    expect(source).toContain("notFound()");
    expect(source).toMatch(/import\s*\{\s*notFound\s*\}\s*from\s*["']next\/navigation["']/);
  });

  it("gates on an explicit environment flag, not on a guess", () => {
    expect(source).toContain("E2E_FIXTURES");
  });

  it("does not treat production as an enabled environment", () => {
    // The gate must not be satisfied by anything a production build sets.
    const gate = source.match(/const FIXTURES_AVAILABLE\s*=([\s\S]*?);/)?.[1] ?? "";
    expect(gate).not.toBe("");
    expect(gate).not.toContain('"production"');
    expect(gate).toMatch(/E2E_FIXTURES\s*===\s*"true"/);
  });

  it("is enabled for the Playwright build, or the e2e suite would break", () => {
    const config = readFileSync(join(process.cwd(), "playwright.config.ts"), "utf8");
    expect(config).toContain("E2E_FIXTURES");
  });
});

describe("the security headers keep their shape", () => {
  const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");

  /*
   * A configuration-level assertion, not a runtime one. The values themselves
   * were verified by curl against a production build — this exists so that
   * removing one is a failing test rather than a silent change nobody sees
   * until the next audit.
   */
  it("enforces the three directives that need no runtime evidence", () => {
    for (const directive of ["object-src 'none'", "base-uri 'self'", "form-action 'self'"]) {
      expect(config).toContain(directive);
    }
  });

  it("still keeps normal pages out of frames", () => {
    expect(config).toContain("frame-ancestors 'none'");
    expect(config).toContain('key: "X-Frame-Options", value: "DENY"');
  });

  it("still exempts the widget routes from framing protection", () => {
    // The negative lookahead is what keeps embeds working; losing it would
    // break the feature silently for everyone who has embedded a board.
    expect(config).toContain("(?!widgets/)");
  });

  it("keeps the unproven half of the policy report-only", () => {
    expect(config).toContain("Content-Security-Policy-Report-Only");
    // script-src and friends must not have quietly moved into the enforced
    // list without the runtime evidence that decision needs.
    const enforced = config.match(/const ENFORCED_CSP_DIRECTIVES\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? "";
    expect(enforced).not.toBe("");
    for (const risky of ["script-src", "style-src", "img-src", "connect-src", "default-src"]) {
      expect(enforced).not.toContain(risky);
    }
  });

  it("never allows unsafe-eval, in either policy", () => {
    // Comments stripped first: the file explains at length why `unsafe-eval`
    // is absent, and a naive substring search matches the explanation and
    // fails on a file that is doing the right thing.
    const withoutComments = config
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    expect(withoutComments).not.toContain("unsafe-eval");
  });

  it("keeps the transport and sniffing headers", () => {
    expect(config).toContain("Strict-Transport-Security");
    expect(config).toContain("nosniff");
    expect(config).toContain("Referrer-Policy");
    expect(config).toContain("Permissions-Policy");
  });

  it("still gives the image optimizer no remote host to fetch", () => {
    // Pass 1's TLO-06 surface reduction. A repopulated list would reopen it.
    expect(config).toMatch(/remotePatterns:\s*\[\s*\]/);
  });
});
