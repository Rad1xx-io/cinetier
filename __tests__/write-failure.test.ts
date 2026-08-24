import { describe, expect, it } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { describeWriteFailure } from "@/lib/supabase/write-failure";

function pgError(code: string, message: string): PostgrestError {
  return { code, message, details: "", hint: "" } as PostgrestError;
}

describe("saying why a write failed", () => {
  it("tells a missing schema apart from a refusal, because the next step differs", () => {
    // What production actually returned: the migration had never been run.
    const missing = describeWriteFailure(
      pgError("PGRST205", "Could not find the table 'public.custom_tier_lists' in the schema cache")
    );
    const refused = describeWriteFailure(pgError("42501", "new row violates row-level security policy"));

    expect(missing).not.toBe(refused);
    expect(missing).toMatch(/setting up/i);
    expect(refused).toMatch(/permission/i);
  });

  it("keeps the database's own words for anything it does not recognise", () => {
    expect(describeWriteFailure(pgError("23505", "duplicate key value violates unique constraint"))).toBe(
      "duplicate key value violates unique constraint"
    );
  });

  it("never hands back an empty string to put in front of somebody", () => {
    for (const error of [null, pgError("XX000", ""), pgError("PGRST205", "")]) {
      expect(describeWriteFailure(error).trim().length).toBeGreaterThan(0);
    }
  });
});
