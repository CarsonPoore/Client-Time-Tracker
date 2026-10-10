/** Excel-safe CSV: UTF-8 BOM, CRLF, every field quoted, formula-leading cells neutralised with a leading '. */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
  let s = value == null ? "" : String(value);
  if (typeof value === "string" && FORMULA_START.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
