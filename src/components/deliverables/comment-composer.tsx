"use client";
import { useActionState, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { Button, FormMessage, Textarea } from "@/components/ui";
import type { WorkspaceActions } from "./deliverable-workspace";

export function CommentComposer({ versionId, deliverableId, actions, pin, clearPin }: {
  versionId: string; deliverableId: string; actions: NonNullable<WorkspaceActions>;
  pin: { x: number; y: number } | null; clearPin: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [state, submit, pending] = useActionState(async (prev: { error: string | null }, form: FormData) => {
    setUploadError(null);
    const r = await actions.addComment(versionId, deliverableId, prev, form);
    if (r.error || !r.commentId) return { error: r.error ?? "Something went wrong. Please try again." };
    for (const file of Array.from(fileRef.current?.files ?? [])) {
      const meta = { name: file.name, size: file.size, type: file.type };
      const signed = await actions.createUpload(r.commentId, meta);
      if ("error" in signed) { setUploadError(signed.error); continue; }
      const { error } = await createBrowserSupabase().storage
        .from("project-files").uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
      if (error) { setUploadError("Upload failed. Your comment was posted without the file."); continue; }
      const a = await actions.attach(r.commentId, { path: signed.path, ...meta });
      if (a.error) setUploadError(a.error);
    }
    if (fileRef.current) fileRef.current.value = "";
    clearPin();
    return { error: null };
  }, { error: null });

  const bodyId = `body-${versionId}`;
  return (
    <form action={submit} className="space-y-2">
      {pin && <>
        <input type="hidden" name="pin_x" value={pin.x} /><input type="hidden" name="pin_y" value={pin.y} />
        <p className="text-sm">Commenting on a spot in the image.{" "}
          <button type="button" className="text-link underline" onClick={clearPin}>Remove pin</button></p>
      </>}
      <label className="block text-sm font-semibold" htmlFor={bodyId}>Comment</label>
      <Textarea id={bodyId} name="body" required maxLength={5000} rows={3} />
      <input ref={fileRef} type="file" multiple aria-label="Attach files" className="block text-sm"
        accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" />
      <FormMessage error={state.error ?? uploadError} />
      <Button type="submit" disabled={pending}>{pending ? "Posting…" : "Post comment"}</Button>
    </form>
  );
}
