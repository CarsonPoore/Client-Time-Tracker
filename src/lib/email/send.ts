import "server-only";
import { Resend } from "resend";
import { serverEnv } from "@/lib/env";

let resend: Resend | undefined;

export async function sendEmail(msg: { to: string | string[]; subject: string; html: string; text: string }): Promise<boolean> {
  const env = serverEnv();
  resend ??= new Resend(env.RESEND_API_KEY);
  try {
    const { error } = await resend.emails.send({ from: env.EMAIL_FROM, ...msg, subject: msg.subject.replace(/[\r\n]+/g, " ") });
    if (error) console.error("Email send failed", error);
    return !error;
  } catch (err) {
    console.error("Email send threw", err);
    return false;
  }
}
