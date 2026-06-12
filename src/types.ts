export type ApiStatus = "manual" | "pending" | "loaded" | "failed";

export type Topic = {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CaseItem = {
  id: string;
  user_id: string;
  topic_id: string | null;
  title: string;
  case_no: string;
  important: boolean;
  api_status: ApiStatus;
  api_error: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CaseNotes = {
  case_id: string;
  user_id: string;
  holding_html: string;
  judgment_summary_html: string;
  source_html: string;
  key_phrases_html: string;
  summary_html: string;
  majority_html: string;
  dissent_html: string;
  concurring_html: string;
  tags_html: string;
  updated_at: string;
};

export type UiState = {
  user_id: string;
  expanded_topic_ids: string[];
  collapsed_fields: string[];
  split_width: number;
  pane_widths: Record<string, number>;
  updated_at: string;
};

export type SyncOperation =
  | "upsert_topic"
  | "upsert_case"
  | "upsert_notes"
  | "upsert_ui_state"
  | "delete_topic"
  | "delete_case";

export type SyncQueueItem = {
  id: string;
  user_id: string;
  op: SyncOperation;
  table_name: "topics" | "cases" | "case_notes" | "user_ui_state";
  record_id: string;
  payload: unknown;
  created_at: string;
};

export type AppSnapshot = {
  topics: Topic[];
  cases: CaseItem[];
  notes: CaseNotes[];
  uiState: UiState;
};

export type EditableFieldKey =
  | "holding_html"
  | "judgment_summary_html"
  | "source_html"
  | "key_phrases_html"
  | "summary_html"
  | "majority_html"
  | "dissent_html"
  | "concurring_html"
  | "tags_html";

export const FIELD_LABELS: Record<EditableFieldKey, string> = {
  source_html: "판례 원문",
  holding_html: "판시사항",
  judgment_summary_html: "판결요지",
  key_phrases_html: "주요 문구",
  summary_html: "결론 요약",
  majority_html: "다수의견",
  dissent_html: "반대의견",
  concurring_html: "보충/별개의견",
  tags_html: "태그와 참고"
};
