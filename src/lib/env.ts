import { z } from "zod";

const nonEmpty = z.string().trim().min(1);

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty,
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty,
  ADMIN_EMAILS: nonEmpty.transform((v) =>
    v.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
  ),
  CLICKUP_API_TOKEN: nonEmpty,
  CLICKUP_TEAM_ID: nonEmpty,
  RESEND_API_KEY: nonEmpty,
  EMAIL_FROM: nonEmpty,
  CRON_SECRET: nonEmpty,
  APP_URL: z.url().transform((v) => v.replace(/\/+$/, "")),
});

export type ServerEnv = z.infer<typeof serverSchema>;

export function parseServerEnv(input: Record<string, string | undefined>): ServerEnv {
  const result = serverSchema.safeParse(input);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((i) => String(i.path[0])))];
    throw new Error(`Missing or invalid environment variables: ${keys.join(", ")}`);
  }
  return result.data;
}

let cached: ServerEnv | undefined;
export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

export const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};
