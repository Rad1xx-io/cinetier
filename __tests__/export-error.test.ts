import { describe, expect, it } from "vitest";
import { describeExportFailure } from "@/lib/utils/export-error";

describe("describeExportFailure", () => {
  it("passes an Error through by its message", () => {
    expect(describeExportFailure(new Error("export-timeout"))).toBe("export-timeout");
  });

  it("names the cover behind an image error rather than the event", () => {
    // The bug this exists for: String(event) is "[object Event]", which told a
    // real user nothing at all.
    const img = document.createElement("img");
    img.src = "http://localhost/_next/image?url=https%3A%2F%2Fimage.tmdb.org%2Fp%2Fx.jpg&w=384";
    const event = new Event("error");
    Object.defineProperty(event, "target", { value: img });

    expect(describeExportFailure(event)).toBe("could not load https://image.tmdb.org/p/x.jpg");
  });

  it("reports the address itself when the image is not the optimiser's", () => {
    const img = document.createElement("img");
    img.src = "https://cdn.example.com/cover.jpg";
    const event = new Event("error");
    Object.defineProperty(event, "target", { value: img });

    expect(describeExportFailure(event)).toBe("could not load cdn.example.com/cover.jpg");
  });

  it("says so when the image had no source at all", () => {
    // What the library leaves behind when a fetch failed and it assigned "".
    const img = document.createElement("img");
    const event = new Event("error");
    Object.defineProperty(event, "target", { value: img });

    expect(describeExportFailure(event)).toBe("could not load an image with no source");
  });

  it("distinguishes an image that arrived but would not decode", () => {
    const img = document.createElement("img");
    img.src = "data:application/octet-stream;base64,SGVsbG8=";
    const event = new Event("error");
    Object.defineProperty(event, "target", { value: img });

    expect(describeExportFailure(event)).toBe("could not load an image that could not be decoded");
  });

  it("falls back to the event type when nothing carried it", () => {
    expect(describeExportFailure(new Event("abort"))).toBe(
      "the browser reported a abort event"
    );
  });

  it("does not print [object Object] for anything else", () => {
    expect(describeExportFailure({ nope: true })).toBe("an unexpected object was thrown");
    expect(describeExportFailure("plain string")).toBe("plain string");
  });
});
