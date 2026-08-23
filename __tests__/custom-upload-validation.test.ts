import { describe, expect, it } from "vitest";
import {
  MAX_ITEMS_PER_LIST,
  MAX_UPLOAD_BYTES,
  MAX_UPLOADS_PER_DAY,
  reviewUpload,
  sniffImageType,
  uploadPath,
} from "@/lib/custom-lists/uploads";

/**
 * The upload rules are the only thing standing between the bucket and whatever
 * somebody feels like sending it, so they are tested on bytes rather than on
 * the labels attached to them.
 */

function withHeader(signature: number[], length = 64): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set(signature, 0);
  return bytes;
}

const JPEG = withHeader([0xff, 0xd8, 0xff, 0xe0]);
const PNG = withHeader([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = (() => {
  const bytes = withHeader([0x52, 0x49, 0x46, 0x46]);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  return bytes;
})();

const accepted = {
  rightsConfirmed: true,
  itemsInList: 0,
  uploadsToday: 0,
};

describe("reading the format out of the file", () => {
  it("recognises the three formats the bucket accepts", () => {
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(WEBP)).toBe("image/webp");
  });

  it("refuses a file that only claims to be an image", () => {
    // What a renamed script, an HTML page or a PDF actually starts with. None
    // of them stop being what they are by arriving as "holiday.png".
    expect(sniffImageType(new TextEncoder().encode("<?php echo 1; ?>"))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("<!doctype html>"))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(sniffImageType(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
  });

  it("refuses a RIFF container that is not WebP", () => {
    // A .wav is RIFF too, and stopping at the first four bytes would take it.
    const wav = withHeader([0x52, 0x49, 0x46, 0x46]);
    wav.set([0x57, 0x41, 0x56, 0x45], 8);
    expect(sniffImageType(wav)).toBeNull();
  });

  it("refuses a file too short to have a signature", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});

describe("what the server will accept", () => {
  it("takes an ordinary picture", () => {
    const verdict = reviewUpload({ bytes: JPEG, ...accepted });
    expect(verdict).toEqual({ ok: true, contentType: "image/jpeg", extension: "jpg" });
  });

  it("refuses an upload whose rights box was not ticked", () => {
    const verdict = reviewUpload({ bytes: JPEG, ...accepted, rightsConfirmed: false });
    expect(verdict).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses anything that is not one of the three formats", () => {
    const verdict = reviewUpload({ bytes: new TextEncoder().encode("not an image"), ...accepted });
    expect(verdict).toMatchObject({ ok: false, status: 415 });
  });

  it("refuses a file over the size limit", () => {
    const tooBig = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    tooBig.set([0xff, 0xd8, 0xff], 0);
    expect(reviewUpload({ bytes: tooBig, ...accepted })).toMatchObject({ ok: false, status: 413 });
  });

  it("refuses an empty file", () => {
    expect(reviewUpload({ bytes: new Uint8Array(0), ...accepted })).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it("stops a board growing past its limit", () => {
    const verdict = reviewUpload({ bytes: PNG, ...accepted, itemsInList: MAX_ITEMS_PER_LIST });
    expect(verdict).toMatchObject({ ok: false, status: 409 });
  });

  it("stops one person uploading all day", () => {
    const verdict = reviewUpload({ bytes: PNG, ...accepted, uploadsToday: MAX_UPLOADS_PER_DAY });
    expect(verdict).toMatchObject({ ok: false, status: 429 });
  });

  it("names the rights box before the file's own problems", () => {
    // Somebody who forgot to tick it should be told that, not sent away to
    // find a smaller file and then told it anyway.
    const verdict = reviewUpload({
      bytes: new TextEncoder().encode("junk"),
      rightsConfirmed: false,
      itemsInList: MAX_ITEMS_PER_LIST,
      uploadsToday: MAX_UPLOADS_PER_DAY,
    });
    expect(verdict).toMatchObject({ ok: false, status: 400 });
    expect(verdict.ok === false && verdict.message).toMatch(/right to use this image/i);
  });
});

describe("where the file goes", () => {
  it("leads with the owner, which is what the storage policy checks", () => {
    const path = uploadPath("user-a", "list-1", "abc", "jpg");
    expect(path).toBe("user-a/list-1/abc.jpg");
    expect(path.split("/")[0]).toBe("user-a");
  });
});
