import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Turning a failed write into something a person can act on.
 *
 * Collapsing every cause into one sentence is how "the board could not be
 * created" came to mean a table that was never created, an expired session and
 * a dropped connection all at once — the message named the symptom and hid
 * every difference that mattered. These are the causes worth telling apart,
 * because each one has a different next step, and only one of them is the
 * reader's to take.
 */

/** Relation missing: the schema this build expects is not on the database. */
const UNDEFINED_TABLE = ["PGRST205", "PGRST202", "42P01", "42883"];

/** Row-level security said no. */
const NOT_PERMITTED = ["42501", "PGRST301"];

export function describeWriteFailure(error: PostgrestError | null): string {
  if (!error) return "Something went wrong. Please try again.";

  if (UNDEFINED_TABLE.includes(error.code)) {
    // Nothing the reader can do, and pretending otherwise wastes their time.
    return "This feature is not finished setting up yet. Please try again later.";
  }

  if (NOT_PERMITTED.includes(error.code)) {
    return "You do not have permission to do that. Try signing in again.";
  }

  // Anything unrecognised keeps the database's own words. They are not pretty,
  // but a specific sentence can be searched for, and a generic one cannot.
  return error.message || "Something went wrong. Please try again.";
}
