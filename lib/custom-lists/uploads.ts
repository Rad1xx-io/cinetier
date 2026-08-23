/**
 * What the server will accept as a card.
 *
 * Every rule here is checked on the server, on the bytes that actually arrived.
 * A filename, an extension and a `Content-Type` header are all written by
 * whoever is uploading, so none of them is evidence of anything — the format is
 * read out of the file itself.
 */

/** Two megabytes. Generous for a phone photo, small enough to be cheap to hold. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/** How many cards one board may hold. Past this a board stops being a ranking. */
export const MAX_ITEMS_PER_LIST = 100;

/** Per person, per day, across every board they own. */
export const MAX_UPLOADS_PER_DAY = 50;

export type AllowedImageType = "image/jpeg" | "image/png" | "image/webp";

const EXTENSIONS: Record<AllowedImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function extensionFor(type: AllowedImageType): string {
  return EXTENSIONS[type];
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

/**
 * The format, read from the leading bytes rather than taken on trust.
 *
 * Returns null for anything that is not one of the three formats this accepts —
 * including a file that merely claims to be one of them.
 */
export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  // JPEG: SOI marker.
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // PNG: signature, deliberately including the CR/LF pair that catches a file
  // mangled by a text-mode transfer.
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // WebP: "RIFF" .... "WEBP" — the size sits between the two, so both halves
  // have to be checked, at their own offsets.
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  return null;
}

export interface UploadAttempt {
  bytes: Uint8Array;
  /** Whether the box on the upload form was ticked. */
  rightsConfirmed: boolean;
  /** Cards already on the board this one is destined for. */
  itemsInList: number;
  /** Files this person has had accepted in the last twenty-four hours. */
  uploadsToday: number;
}

export type UploadVerdict =
  | { ok: true; contentType: AllowedImageType; extension: string }
  | { ok: false; status: number; message: string };

/**
 * Everything that can refuse an upload, in one place.
 *
 * Ordered so the answer names the most useful reason: an unticked box before a
 * size limit, because one is a decision the person can revisit and the other
 * needs a different file.
 */
export function reviewUpload(attempt: UploadAttempt): UploadVerdict {
  if (!attempt.rightsConfirmed) {
    return {
      ok: false,
      status: 400,
      message: "Confirm you have the right to use this image before uploading it.",
    };
  }

  if (attempt.bytes.byteLength === 0) {
    return { ok: false, status: 400, message: "That file is empty." };
  }

  if (attempt.bytes.byteLength > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      status: 413,
      message: `Images must be under ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`,
    };
  }

  const contentType = sniffImageType(attempt.bytes);
  if (!contentType) {
    return { ok: false, status: 415, message: "Images must be JPEG, PNG or WebP." };
  }

  if (attempt.itemsInList >= MAX_ITEMS_PER_LIST) {
    return {
      ok: false,
      status: 409,
      message: `A board holds up to ${MAX_ITEMS_PER_LIST} cards.`,
    };
  }

  if (attempt.uploadsToday >= MAX_UPLOADS_PER_DAY) {
    return {
      ok: false,
      status: 429,
      message: `That is ${MAX_UPLOADS_PER_DAY} uploads today — the limit resets tomorrow.`,
    };
  }

  return { ok: true, contentType, extension: extensionFor(contentType) };
}

/**
 * Where a file lives in the bucket.
 *
 * The owner's id leads, because the storage policy reads ownership off the
 * first path segment; the name itself is random, so a path cannot be guessed
 * from anything a visitor can see.
 */
export function uploadPath(userId: string, listId: string, id: string, extension: string): string {
  return `${userId}/${listId}/${id}.${extension}`;
}
