export type Role = "admin" | "team" | "client";
export type DeliverableStatus = "draft" | "awaiting_approval" | "approved" | "changes_requested";

export interface ClientRow {
  id: string; name: string; clickup_space_id: string | null; is_active: boolean;
  contact_name: string | null; contact_email: string | null; quickbooks_invoices_url: string | null;
  quickbooks_customer_id: string | null; quickbooks_customer_name: string | null;
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
  file_path: string | null; link_url: string | null; clickup_task_id: string | null;
  status: DeliverableStatus; client_feedback: string | null; published_at: string | null;
  decided_at: string | null; created_at: string;
}
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
