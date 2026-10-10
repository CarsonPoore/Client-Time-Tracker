import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";

describe("csv", () => {
  it("neutralises formula-leading cells", () => {
    for (const s of ["=SUM(A1)", "+1", "-2+3", "@cmd", "\tx", "\rx"]) expect(csvCell(s)).toBe(`"'${s}"`);
  });
  it("leaves numbers alone, including negatives", () => {
    expect(csvCell(-1.5)).toBe('"-1.5"');
    expect(csvCell(2)).toBe('"2"');
  });
  it("doubles quotes and keeps newlines inside one cell", () => {
    expect(csvCell('say "hi"\nthere')).toBe('"say ""hi""\nthere"');
  });
  it("renders null as empty and adds BOM + CRLF", () => {
    expect(toCsv([["a", null], ["é", 1]])).toBe('﻿"a",""\r\n"é","1"\r\n');
  });
});
