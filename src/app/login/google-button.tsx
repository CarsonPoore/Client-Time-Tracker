"use client";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { Button } from "@/components/ui";

export function GoogleButton() {
  return (
    <Button
      type="button"
      variant="secondary"
      className="w-full"
      onClick={() =>
        createBrowserSupabase().auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/auth/callback` },
        })
      }
    >
      Continue with Google
    </Button>
  );
}
