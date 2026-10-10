import { describe, expect, it } from "vitest";
import { isImagePath, parseComment, pinFromClick, revisionLabel, validateAttachment, versionErrorMessage } from "@/lib/revisions";

describe("revisionLabel", () => {
  it.each([
    [1, null, "Revision 1", false],
    [2, 3, "Revision 2 of 3", false],
    [3, 3, "Revision 3 of 3", false],
    [4, 3, "Over limit (4 of 3)", true],
  ])("%i of %s", (n, limit, text, over) => expect(revisionLabel(n, limit)).toEqual({ text, over }));
});

describe("pinFromClick", () => {
  const rect = { left: 100, top: 50, width: 200, height: 400 };
  it("maps to percent", () => expect(pinFromClick(150, 150, rect)).toEqual({ x: 25, y: 25 }));
  it("clamps outside clicks", () => expect(pinFromClick(0, 1000, rect)).toEqual({ x: 0, y: 100 }));
  it("rounds to 2 decimals", () => expect(pinFromClick(101, 51, { ...rect, width: 3, height: 3 })).toEqual({ x: 33.33, y: 33.33 }));
});

describe("validateAttachment", () => {
  it("accepts a png", () => expect(validateAttachment({ name: "a.png", size: 1000, type: "image/png" })).toBeNull());
  it("rejects over 25 MB", () => expect(validateAttachment({ name: "a.png", size: 26214401, type: "image/png" })).toMatch(/25 MB/));
  it("rejects exe", () => expect(validateAttachment({ name: "a.exe", size: 10, type: "application/x-msdownload" })).toMatch(/type/));
  it("rejects empty", () => expect(validateAttachment({ name: "a.png", size: 0, type: "image/png" })).toMatch(/empty/));
});

describe("parseComment", () => {
  const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  it("trims body", () => expect(parseComment(fd({ body: "  hi  " }))).toEqual({ ok: true, body: "hi", pin: null }));
  it("requires body", () => expect(parseComment(fd({ body: "   " }))).toEqual({ ok: false, error: "Write a comment first." }));
  it("caps length", () => expect(parseComment(fd({ body: "x".repeat(5001) })).ok).toBe(false));
  it("reads pin pair", () => expect(parseComment(fd({ body: "a", pin_x: "10.5", pin_y: "20" }))).toEqual({ ok: true, body: "a", pin: { x: 10.5, y: 20 } }));
  it("rejects bad pin", () => expect(parseComment(fd({ body: "a", pin_x: "200", pin_y: "20" })).ok).toBe(false));
  it("rejects half pin", () => expect(parseComment(fd({ body: "a", pin_x: "10" })).ok).toBe(false));
});

describe("versionErrorMessage", () => {
  it.each([
    ["not_current_version", "A newer version was posted. Refresh to see it."],
    ["not_awaiting_approval", "This version has already been decided."],
    ["feedback_required", "Tell us what to change."],
    ["not_found", "We couldn't find that version."],
    ["boom", "Something went wrong. Please try again."],
  ])("%s", (code, msg) => expect(versionErrorMessage(`ERROR: ${code}`)).toBe(msg));
});

describe("isImagePath", () => {
  it.each([["a/b.PNG", true], ["a/b.jpg", true], ["a/b.pdf", false], [null, false]])("%s", (p, r) => expect(isImagePath(p)).toBe(r));
});
