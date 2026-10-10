import { describe, expect, it, vi } from "vitest";
import { QuickBooksClient, QuickBooksError, suggestCustomer, type QBCustomer } from "@/lib/quickbooks/client";
import { sameState } from "@/lib/quickbooks/oauth-state";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const config = { clientId: "cid", clientSecret: "sec", redirectUri: "https://app/api/quickbooks/callback", environment: "production" as const };
const make = (fetchImpl: ReturnType<typeof vi.fn>) => new QuickBooksClient(config, fetchImpl as unknown as typeof fetch, () => 1_000_000);

describe("QuickBooksClient", () => {
  it("builds an authorize URL with accounting scope and state", () => {
    const url = new URL(make(vi.fn()).authorizeUrl("st8"));
    expect(url.origin + url.pathname).toBe("https://appcenter.intuit.com/connect/oauth2");
    expect(url.searchParams.get("scope")).toBe("com.intuit.quickbooks.accounting");
    expect(url.searchParams.get("state")).toBe("st8");
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
  });

  it("exchanges a code with basic auth and computes expiries", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ access_token: "a", refresh_token: "r", expires_in: 3600, x_refresh_token_expires_in: 8_640_000 }));
    const t = await make(fetchImpl).exchangeCode("c0de");
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("cid:sec").toString("base64")}`);
    expect(new URLSearchParams(init.body).get("grant_type")).toBe("authorization_code");
    expect(t.accessExpiresAt.getTime()).toBe(1_000_000 + 3_600_000);
    expect(t.refreshToken).toBe("r");
  });

  it("pages through active customers and sorts them", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ Id: String(i + 2), DisplayName: `Z${i}` }));
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ QueryResponse: { Customer: page1 } }))
      .mockResolvedValueOnce(json({ QueryResponse: { Customer: [{ Id: "1", DisplayName: "Acme", PrimaryEmailAddr: { Address: "a@acme.com" } }] } }));
    const list = await make(fetchImpl).listCustomers("tok", "R1");
    expect(list).toHaveLength(1001);
    expect(list[0]).toEqual({ id: "1", displayName: "Acme", companyName: null, email: "a@acme.com" });
    const url = new URL(fetchImpl.mock.calls[1][0]);
    expect(url.pathname).toBe("/v3/company/R1/query");
    expect(url.searchParams.get("query")).toContain("startposition 1001");
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });

  it("returns null for a missing or malformed customer id, throws on other errors", async () => {
    const qb = make(vi.fn().mockResolvedValueOnce(json({}, 400)).mockResolvedValueOnce(json({}, 500)));
    expect(await qb.getCustomer("tok", "R1", "abc")).toBeNull();
    expect(await qb.getCustomer("tok", "R1", "9")).toBeNull();
    await expect(qb.getCustomer("tok", "R1", "9")).rejects.toBeInstanceOf(QuickBooksError);
  });
});

describe("suggestCustomer", () => {
  const c = (id: string, displayName: string, email: string | null = null, companyName: string | null = null): QBCustomer => ({ id, displayName, email, companyName });
  const customers = [c("1", "Blue Duck, LLC"), c("2", "Jane Smith", "jane@acme.com", "Acme Co"), c("3", "Other")];

  it("prefers a unique email match", () => {
    expect(suggestCustomer({ name: "Something else", contact_email: "JANE@acme.com" }, customers)?.id).toBe("2");
  });
  it("matches names ignoring punctuation and suffixes", () => {
    expect(suggestCustomer({ name: "Blue Duck", contact_email: null }, customers)?.id).toBe("1");
    expect(suggestCustomer({ name: "Acme", contact_email: null }, customers)?.id).toBe("2");
  });
  it("returns null when ambiguous or absent", () => {
    expect(suggestCustomer({ name: "Nope", contact_email: null }, customers)).toBeNull();
    expect(suggestCustomer({ name: "Other", contact_email: null }, [...customers, c("4", "Other Inc")])).toBeNull();
  });
});

describe("sameState", () => {
  it("compares OAuth state safely", () => {
    expect(sameState("abc", "abc")).toBe(true);
    expect(sameState("abc", "abd")).toBe(false);
    expect(sameState("abc", undefined)).toBe(false);
    expect(sameState("", "")).toBe(false);
  });
});
