import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env";

const full = {
  NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  ADMIN_EMAILS: "Carson@Example.com, other@example.com",
  CLICKUP_API_TOKEN: "pk_1",
  CLICKUP_TEAM_ID: "123",
  RESEND_API_KEY: "re_1",
  EMAIL_FROM: "CPC <os@example.com>",
  CRON_SECRET: "s",
  APP_URL: "https://os.example.com/",
};

describe("parseServerEnv", () => {
  it("parses a complete env and normalizes values", () => {
    const env = parseServerEnv(full);
    expect(env.ADMIN_EMAILS).toEqual(["carson@example.com", "other@example.com"]);
    expect(env.APP_URL).toBe("https://os.example.com");
  });

  it("lists every missing key in the error", () => {
    expect(() => parseServerEnv({ ...full, CLICKUP_API_TOKEN: undefined, CRON_SECRET: "" }))
      .toThrow(/CLICKUP_API_TOKEN.*CRON_SECRET|CRON_SECRET.*CLICKUP_API_TOKEN/s);
  });
});
