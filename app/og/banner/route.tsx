import { ImageResponse } from "next/og";
import { OG_IMAGE_SIZE } from "@/lib/seo/og-image";

/*
 * Rendered once at build time rather than on every scrape.
 *
 * Route handlers are dynamic by default, and this one has no request to read —
 * every visitor gets the same picture, and a crawler should not be paying for
 * a render to find that out.
 */
export const dynamic = "force-static";

/** The board's own palette, so a shared link looks like the site it leads to. */
const BACKGROUND = "#09090b";
const FOREGROUND = "#f4f4f5";
const MUTED = "#8f8f98";
const ACCENT = "#e8b34c";

const TIERS = [
  { label: "S", color: "#e2545a" },
  { label: "A", color: "#e8894c" },
  { label: "B", color: "#e8c34c" },
  { label: "C", color: "#7cc26a" },
  { label: "D", color: "#5aa7d6" },
  { label: "F", color: "#8f8f98" },
];

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 44,
          background: BACKGROUND,
          // A wash of accent behind the wordmark, so the card is not a flat
          // rectangle in a timeline full of flat rectangles.
          backgroundImage: `radial-gradient(circle at 50% 32%, ${ACCENT}22 0%, ${BACKGROUND} 62%)`,
        }}
      >
        <div style={{ display: "flex", fontSize: 92, fontWeight: 700, letterSpacing: -3 }}>
          <span style={{ color: FOREGROUND }}>TierList</span>
          <span style={{ color: ACCENT }}>Online</span>
        </div>

        <div style={{ display: "flex", gap: 18 }}>
          {TIERS.map((tier) => (
            <div
              key={tier.label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 104,
                height: 104,
                borderRadius: 20,
                background: tier.color,
                color: "#100c02",
                fontSize: 56,
                fontWeight: 700,
              }}
            >
              {tier.label}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", fontSize: 34, color: MUTED }}>
          Rank films, TV, anime, games and YouTube channels
        </div>
      </div>
    ),
    OG_IMAGE_SIZE
  );
}
