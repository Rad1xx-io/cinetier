import { jsonLdScript, type JsonLd as JsonLdData } from "@/lib/seo/json-ld";

/**
 * Renders a Schema.org payload into the page.
 *
 * A `<script type="application/ld+json">` rather than a meta tag: Next can put
 * arbitrary entries in `metadata.other`, but those come out as
 * `<meta name="…">` and no search engine reads structured data from one. The
 * script tag is what crawlers parse, and rendering it from the page body costs
 * nothing extra — the data is already loaded by the time this runs.
 *
 * `dangerouslySetInnerHTML` because React escapes text children, and an
 * escaped quote inside a script tag is no longer JSON. See `jsonLdScript` for
 * what is escaped instead.
 */
export function JsonLd({ data }: { data: JsonLdData | JsonLdData[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />;
}
