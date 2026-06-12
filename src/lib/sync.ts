import type { AppSnapshot, CaseItem, CaseNotes, Topic, UiState } from "../types";
import { makeId, nowIso } from "./id";
import { enqueue, getAll, put, queueItems, remove } from "./localDb";
import { supabase } from "./supabase";

type Syncable = Topic | CaseItem | CaseNotes | UiState;
type RemoteRow = { updated_at?: string };

function newer<T extends { updated_at: string }>(local: T | undefined, remote: T) {
  if (!local) return remote;
  return new Date(remote.updated_at).getTime() > new Date(local.updated_at).getTime() ? remote : local;
}

export async function recordChange(userId: string, table: "topics" | "cases" | "case_notes" | "user_ui_state", payload: Syncable, op?: string) {
  const recordId =
    "case_id" in payload ? payload.case_id : "id" in payload ? payload.id : payload.user_id;
  const defaultOps = {
    topics: "upsert_topic",
    cases: "upsert_case",
    case_notes: "upsert_notes",
    user_ui_state: "upsert_ui_state"
  } as const;
  await enqueue({
    id: makeId("queue"),
    user_id: userId,
    op: (op || defaultOps[table]) as never,
    table_name: table,
    record_id: recordId,
    payload,
    created_at: nowIso()
  });
}

export async function pushQueue(userId: string) {
  if (!supabase) return;
  const queue = await queueItems(userId);
  for (const item of queue) {
    const remoteKey = item.table_name === "case_notes" ? "case_id" : item.table_name === "user_ui_state" ? "user_id" : "id";
    const payload = item.payload as Syncable;
    const { data: remote, error: readError } = await supabase
      .from(item.table_name)
      .select("updated_at")
      .eq(remoteKey, item.record_id)
      .maybeSingle<RemoteRow>();

    if (readError) throw readError;
    if (remote?.updated_at && "updated_at" in payload && new Date(remote.updated_at).getTime() > new Date(payload.updated_at).getTime()) {
      await remove("sync_queue", item.id);
      continue;
    }

    const { error } = await supabase.from(item.table_name).upsert(item.payload as never);
    if (error) throw error;
    await remove("sync_queue", item.id);
  }
}

export async function pullRemote(userId: string) {
  if (!supabase) return;
  const [topics, cases, notes, uiState] = await Promise.all([
    supabase.from("topics").select("*").eq("user_id", userId),
    supabase.from("cases").select("*").eq("user_id", userId),
    supabase.from("case_notes").select("*").eq("user_id", userId),
    supabase.from("user_ui_state").select("*").eq("user_id", userId).maybeSingle()
  ]);

  if (topics.error) throw topics.error;
  if (cases.error) throw cases.error;
  if (notes.error) throw notes.error;
  if (uiState.error) throw uiState.error;

  const localTopics = await getAll<Topic>("topics");
  const localCases = await getAll<CaseItem>("cases");
  const localNotes = await getAll<CaseNotes>("case_notes");
  const localStates = await getAll<UiState>("user_ui_state");

  for (const remote of topics.data || []) await put("topics", newer(localTopics.find((x) => x.id === remote.id), remote));
  for (const remote of cases.data || []) await put("cases", newer(localCases.find((x) => x.id === remote.id), remote));
  for (const remote of notes.data || []) await put("case_notes", newer(localNotes.find((x) => x.case_id === remote.case_id), remote));
  if (uiState.data) {
    const nextUiState = newer(localStates.find((x) => x.user_id === userId), uiState.data);
    await put("user_ui_state", { ...nextUiState, id: userId });
  }
}

export async function syncNow(userId: string) {
  if (!navigator.onLine || !supabase) return;
  await pushQueue(userId);
  await pullRemote(userId);
}

export async function mergeLocalSnapshot(snapshot: AppSnapshot) {
  await Promise.all(snapshot.topics.map((item) => put("topics", item)));
  await Promise.all(snapshot.cases.map((item) => put("cases", item)));
  await Promise.all(snapshot.notes.map((item) => put("case_notes", item)));
  await put("user_ui_state", { ...snapshot.uiState, id: snapshot.uiState.user_id });
}
