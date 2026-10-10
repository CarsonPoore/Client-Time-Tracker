export type Role = "admin" | "team" | "client";
export type DeliverableStatus = "draft" | "awaiting_approval" | "approved" | "changes_requested";

export interface ClientRow {
  id: string; name: string; clickup_space_id: string | null; is_active: boolean;
  contact_name: string | null; contact_email: string | null; quickbooks_invoices_url: string | null;
  quickbooks_customer_id: string | null; quickbooks_customer_name: string | null; show_hours_in_portal: boolean;
  portal_user_id: string | null; created_at: string;
}
export interface ProjectRow {
  id: string; client_id: string; clickup_list_id: string | null; name: string;
  status: string | null; due_date: string | null; archived: boolean;
}
export interface TaskRow {
  id: string; project_id: string; clickup_task_id: string; name: string; status: string;
  status_color: string | null; due_date: string | null; client_visible: boolean;
  clickup_url: string | null; status_changed_at: string | null; deleted: boolean;
}
export interface DeliverableRow {
  id: string; project_id: string; title: string; description: string | null;
  clickup_task_id: string | null;
  status: DeliverableStatus; published_at: string | null; created_at: string;
  current_version_id: string | null; revision_limit: number | null;
}
export interface VersionRow {
  id: string; deliverable_id: string; number: number; file_path: string | null; link_url: string | null;
  notes: string | null; status: DeliverableStatus; published_at: string | null; decided_at: string | null;
  decided_by: string | null; created_at: string;
}
export interface AttachmentRow { id: string; comment_id: string; storage_path: string; name: string; size_bytes: number | null; mime_type: string | null }
export interface CommentRow {
  id: string; version_id: string; author_id: string | null; author_role: "client" | "admin";
  body: string; kind: "comment" | "decision"; pin_x: number | null; pin_y: number | null; created_at: string;
  attachments: AttachmentRow[];
}
export interface ActivityRow { id: string; type: string; ref_table: string; ref_id: string; summary: string; created_at: string }
export interface UpdateRow {
  id: string; project_id: string; body: string; source: "os" | "clickup";
  author_name: string | null; published_at: string | null;
}
export interface FileRow {
  id: string; project_id: string; storage_path: string; name: string;
  size_bytes: number | null; mime_type: string | null; created_at: string;
}
export interface RequestRow {
  id: string; client_id: string; project_id: string | null; deliverable_id: string | null;
  kind: "comment" | "request"; body: string; status: "open" | "done"; created_at: string;
}
export interface SyncRunRow {
  id: string; kind: "webhook" | "nightly" | "manual"; started_at: string;
  finished_at: string | null; ok: boolean | null; counts: Record<string, number>; error: string | null;
}
