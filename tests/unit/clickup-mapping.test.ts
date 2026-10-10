import { describe, expect, it } from "vitest";
import {
  isClientVisible, isDefaultClientSpace, mapList, mapTask, msToDate, parseClientComment, webhookEventId,
} from "@/lib/clickup/mapping";
import type { CUTask } from "@/lib/clickup/types";

const task = (fields?: CUTask["custom_fields"]): CUTask => ({
  id: "abc", name: " Homepage ", status: { status: "in progress", color: "#ff0" },
  due_date: "1767268800000", url: "https://app.clickup.com/t/abc", date_updated: "1767268800000",
  list: { id: "L1" }, custom_fields: fields,
});

describe("isClientVisible", () => {
  it("treats string and boolean checkbox values", () => {
    expect(isClientVisible(task([{ name: "Client visible", type: "checkbox", value: true }]))).toBe(true);
    expect(isClientVisible(task([{ name: "client visible ", type: "checkbox", value: "true" }]))).toBe(true);
    expect(isClientVisible(task([{ name: "Client visible", type: "checkbox", value: false }]))).toBe(false);
    expect(isClientVisible(task([{ name: "Client visible", type: "checkbox" }]))).toBe(false);
    expect(isClientVisible(task([{ name: "Client visible", type: "short_text", value: "true" }]))).toBe(false);
    expect(isClientVisible(task(undefined))).toBe(false);
  });
});

describe("msToDate", () => {
  it("converts ms timestamps to Eastern calendar dates", () => {
    expect(msToDate("1767268800000")).toBe("2026-01-01");
    expect(msToDate(null)).toBeNull();
    expect(msToDate("not-a-number")).toBeNull();
  });
});

describe("mapTask", () => {
  it("maps fields for upsert", () => {
    expect(mapTask(task([{ name: "Client visible", type: "checkbox", value: true }]), "P1")).toEqual({
      project_id: "P1", clickup_task_id: "abc", name: "Homepage", status: "in progress", status_color: "#ff0",
      due_date: "2026-01-01", client_visible: true, clickup_url: "https://app.clickup.com/t/abc",
      clickup_updated_at: "2026-01-01T12:00:00.000Z", deleted: false,
    });
  });
});

describe("mapList", () => {
  it("maps a list to a project", () => {
    expect(mapList({ id: "L1", name: "Website", due_date: null, status: { status: "active" } }, "C1"))
      .toEqual({ client_id: "C1", clickup_list_id: "L1", name: "Website", status: "active", due_date: null, archived: false });
  });
});

describe("parseClientComment", () => {
  it("extracts text after the #client marker", () => {
    expect(parseClientComment("#client Homepage draft is ready")).toBe("Homepage draft is ready");
    expect(parseClientComment("  #CLIENT: Launch moved to Friday")).toBe("Launch moved to Friday");
    expect(parseClientComment("#client")).toBeNull();
    expect(parseClientComment("internal note #client")).toBeNull();
    expect(parseClientComment("#clientele meeting")).toBeNull();
    expect(parseClientComment("#client-internal: do not share")).toBeNull();
    expect(parseClientComment("#client's budget is too low, push back")).toBeNull();
    expect(parseClientComment("#client/agency only")).toBeNull();
    expect(parseClientComment("#client.")).toBeNull();
    expect(parseClientComment("#client: ...")).toBeNull();
  });
});

describe("isDefaultClientSpace", () => {
  it("excludes the CPC space", () => {
    expect(isDefaultClientSpace("Carson Poore Consulting")).toBe(false);
    expect(isDefaultClientSpace("Blue Duck")).toBe(true);
  });
});

describe("webhookEventId", () => {
  it("is stable for the same delivery and differs per history item", () => {
    const base = { event: "taskUpdated", webhook_id: "W", task_id: "T", history_items: [{ id: "H1" }] };
    expect(webhookEventId(base)).toBe(webhookEventId({ ...base }));
    expect(webhookEventId(base)).not.toBe(webhookEventId({ ...base, history_items: [{ id: "H2" }] }));
  });
});
