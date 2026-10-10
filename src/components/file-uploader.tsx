"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { Button, FormMessage } from "@/components/ui";

const MAX_BYTES = 50 * 1024 * 1024;

export interface UploadedFile { path: string; name: string; size: number; type: string }

export function FileUploader({
  projectId, kind, label = "Upload file", createUpload, record,
}: {
  projectId: string;
  kind: "files" | "deliverables";
  label?: string;
  createUpload: (projectId: string, fileName: string, kind: "files" | "deliverables") => Promise<{ path: string; token: string } | { error: string }>;
  record: (projectId: string, file: UploadedFile) => Promise<{ error: string | null }>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) { setError("Files must be 50 MB or smaller."); return; }
    setBusy(true); setError(null);
    try {
      const signed = await createUpload(projectId, file.name, kind);
      if ("error" in signed) throw new Error(signed.error);
      const { error: upErr } = await createBrowserSupabase().storage
        .from("project-files").uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
      if (upErr) throw upErr;
      const res = await record(projectId, { path: signed.path, name: file.name, size: file.size, type: file.type });
      if (res.error) throw new Error(res.error);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <input ref={input} type="file" className="sr-only" onChange={onChange} aria-label={label} />
      <Button type="button" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Uploading…" : label}
      </Button>
      <FormMessage error={error} />
    </div>
  );
}
