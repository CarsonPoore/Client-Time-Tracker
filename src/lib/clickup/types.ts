export interface CUSpace { id: string; name: string }
export interface CUList { id: string; name: string; due_date?: string | null; status?: { status: string } | null; space?: { id: string } }
export interface CUCustomField { name: string; type: string; value?: unknown }
export interface CUTask {
  id: string; name: string; status: { status: string; color?: string }; due_date: string | null;
  url: string; date_updated: string; list: { id: string }; space?: { id: string }; custom_fields?: CUCustomField[];
}
export interface CUComment { id: string; comment_text: string; user?: { username?: string | null } | null; date: string }
export interface CUWebhookPayload {
  event: string; webhook_id: string; task_id?: string; list_id?: string;
  history_items?: { id?: string; date?: string }[];
}
