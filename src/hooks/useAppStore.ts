import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppSnapshot, CaseItem, CaseNotes, EditableFieldKey, Topic, UiState } from "../types";
import { FIELD_LABELS } from "../types";
import { fetchLawCase } from "../lib/lawApi";
import { localUserId, makeId, nowIso } from "../lib/id";
import { put, readSnapshot } from "../lib/localDb";
import { mergeLocalSnapshot, recordChange, syncNow } from "../lib/sync";
import { sanitizeHtml } from "../lib/html";

function emptyUiState(userId: string): UiState {
  return {
    user_id: userId,
    expanded_topic_ids: [],
    collapsed_fields: [],
    split_width: 52,
    pane_widths: {},
    updated_at: nowIso()
  };
}

function emptyNotes(caseId: string, userId: string): CaseNotes {
  return {
    case_id: caseId,
    user_id: userId,
    holding_html: "",
    judgment_summary_html: "",
    source_html: "",
    key_phrases_html: "",
    summary_html: "",
    majority_html: "",
    dissent_html: "",
    concurring_html: "",
    tags_html: "",
    updated_at: nowIso()
  };
}

function nextBlankTitle(cases: CaseItem[]) {
  const base = "빈 판례";
  const titles = new Set(cases.filter((item) => !item.deleted_at).map((item) => item.title));
  if (!titles.has(base)) return base;
  for (let i = 2; i < 10000; i += 1) {
    const title = `${base} (${i})`;
    if (!titles.has(title)) return title;
  }
  return `${base} (${Date.now()})`;
}

function hasUserData(snapshot: AppSnapshot) {
  return snapshot.topics.some((item) => !item.deleted_at) || snapshot.cases.some((item) => !item.deleted_at);
}

function reassignSnapshotUser(snapshot: AppSnapshot, userId: string): AppSnapshot {
  const timestamp = nowIso();
  return {
    topics: snapshot.topics.map((item) => ({ ...item, user_id: userId, updated_at: timestamp })),
    cases: snapshot.cases.map((item) => ({ ...item, user_id: userId, updated_at: timestamp })),
    notes: snapshot.notes.map((item) => ({ ...item, user_id: userId, updated_at: timestamp })),
    uiState: { ...snapshot.uiState, user_id: userId, updated_at: timestamp }
  };
}

export function useAppStore(userId: string | null) {
  const activeUserId = userId || localUserId();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [notes, setNotes] = useState<CaseNotes[]>([]);
  const [uiState, setUiState] = useState<UiState>(() => emptyUiState(activeUserId));
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState("로컬 저장 준비 중");

  const load = useCallback(async () => {
    const snapshot = await readSnapshot(activeUserId);
    setTopics(snapshot.topics);
    setCases(snapshot.cases);
    setNotes(snapshot.notes);
    setUiState(snapshot.uiState);
    setSelectedCaseId((current) => current || snapshot.cases.find((item) => !item.deleted_at)?.id || null);
    setSyncMessage("로컬 저장됨");
  }, [activeUserId]);

  const promoteLocalDataToAccount = useCallback(async () => {
    if (!userId) return false;

    const [accountSnapshot, localSnapshot] = await Promise.all([
      readSnapshot(activeUserId),
      readSnapshot(localUserId())
    ]);

    if (hasUserData(accountSnapshot) || !hasUserData(localSnapshot)) return false;

    const promoted = reassignSnapshotUser(localSnapshot, activeUserId);
    await mergeLocalSnapshot(promoted);
    await put("user_ui_state", { ...promoted.uiState, id: activeUserId });
    await Promise.all([
      ...promoted.topics.map((item) => recordChange(activeUserId, "topics", item)),
      ...promoted.cases.map((item) => recordChange(activeUserId, "cases", item)),
      ...promoted.notes.map((item) => recordChange(activeUserId, "case_notes", item)),
      recordChange(activeUserId, "user_ui_state", promoted.uiState)
    ]);
    setSyncMessage("로컬 데이터를 계정으로 옮김");
    return true;
  }, [activeUserId, userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    syncNow(activeUserId)
      .then(promoteLocalDataToAccount)
      .then(() => syncNow(activeUserId))
      .then(load)
      .catch((error) => setSyncMessage(`동기화 보류: ${error.message}`));
  }, [activeUserId, load, promoteLocalDataToAccount, userId]);

  useEffect(() => {
    const handler = () => {
      if (!userId) return;
      syncNow(activeUserId)
        .then(load)
        .catch((error) => setSyncMessage(`동기화 보류: ${error.message}`));
    };
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  }, [activeUserId, load, userId]);

  const persistTopic = useCallback(async (topic: Topic) => {
    await put("topics", topic);
    await recordChange(activeUserId, "topics", topic);
  }, [activeUserId]);

  const persistCase = useCallback(async (caseItem: CaseItem) => {
    await put("cases", caseItem);
    await recordChange(activeUserId, "cases", caseItem);
  }, [activeUserId]);

  const persistNotes = useCallback(async (caseNotes: CaseNotes) => {
    await put("case_notes", caseNotes);
    await recordChange(activeUserId, "case_notes", caseNotes);
  }, [activeUserId]);

  const persistUi = useCallback(async (next: UiState) => {
    const stored = { ...next, id: activeUserId };
    await put("user_ui_state", stored);
    await recordChange(activeUserId, "user_ui_state", next);
  }, [activeUserId]);

  const saveUiState = useCallback((patch: Partial<UiState>) => {
    setUiState((current) => {
      const next = { ...current, ...patch, updated_at: nowIso() };
      persistUi(next).catch((error) => setSyncMessage(error.message));
      return next;
    });
  }, [persistUi]);

  const addTopic = useCallback((parentId: string | null = null) => {
    const timestamp = nowIso();
    const siblingCount = topics.filter((topic) => topic.parent_id === parentId && !topic.deleted_at).length;
    const topic: Topic = {
      id: makeId("topic"),
      user_id: activeUserId,
      parent_id: parentId,
      name: "새 목차",
      sort_order: siblingCount,
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null
    };
    setTopics((current) => [...current, topic]);
    persistTopic(topic).catch((error) => setSyncMessage(error.message));
    saveUiState({ expanded_topic_ids: Array.from(new Set([...uiState.expanded_topic_ids, parentId].filter(Boolean) as string[])) });
  }, [activeUserId, persistTopic, saveUiState, topics, uiState.expanded_topic_ids]);

  const updateTopic = useCallback((id: string, patch: Partial<Topic>) => {
    setTopics((current) =>
      current.map((topic) => {
        if (topic.id !== id) return topic;
        const next = { ...topic, ...patch, updated_at: nowIso() };
        persistTopic(next).catch((error) => setSyncMessage(error.message));
        return next;
      })
    );
  }, [persistTopic]);

  const addBlankCase = useCallback((topicId: string | null = null) => {
    const timestamp = nowIso();
    const caseItem: CaseItem = {
      id: makeId("case"),
      user_id: activeUserId,
      topic_id: topicId,
      title: nextBlankTitle(cases),
      case_no: "",
      important: false,
      api_status: "manual",
      api_error: null,
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null
    };
    const caseNotes = emptyNotes(caseItem.id, activeUserId);
    setCases((current) => [...current, caseItem]);
    setNotes((current) => [...current, caseNotes]);
    setSelectedCaseId(caseItem.id);
    Promise.all([persistCase(caseItem), persistNotes(caseNotes)]).catch((error) => setSyncMessage(error.message));
  }, [activeUserId, cases, persistCase, persistNotes]);

  const addApiCase = useCallback(async (caseNo: string, topicId: string | null = null) => {
    const timestamp = nowIso();
    const caseItem: CaseItem = {
      id: makeId("case"),
      user_id: activeUserId,
      topic_id: topicId,
      title: caseNo,
      case_no: caseNo,
      important: false,
      api_status: "pending",
      api_error: null,
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null
    };
    const caseNotes = emptyNotes(caseItem.id, activeUserId);
    setCases((current) => [...current, caseItem]);
    setNotes((current) => [...current, caseNotes]);
    setSelectedCaseId(caseItem.id);
    await Promise.all([persistCase(caseItem), persistNotes(caseNotes)]);

    try {
      const result = await fetchLawCase(caseNo);
      const loadedCase = {
        ...caseItem,
        title: result.title || caseNo,
        case_no: result.case_no || caseNo,
        api_status: "loaded" as const,
        updated_at: nowIso()
      };
      const loadedNotes = {
        ...caseNotes,
        holding_html: result.holding_html || "",
        judgment_summary_html: result.judgment_summary_html || "",
        source_html: result.source_html || "",
        updated_at: nowIso()
      };
      setCases((current) => current.map((item) => (item.id === loadedCase.id ? loadedCase : item)));
      setNotes((current) => current.map((item) => (item.case_id === loadedNotes.case_id ? loadedNotes : item)));
      await Promise.all([persistCase(loadedCase), persistNotes(loadedNotes)]);
    } catch (error) {
      const failedCase = {
        ...caseItem,
        api_status: "failed" as const,
        api_error: error instanceof Error ? error.message : "API 호출 실패",
        updated_at: nowIso()
      };
      setCases((current) => current.map((item) => (item.id === failedCase.id ? failedCase : item)));
      await persistCase(failedCase);
    }
  }, [activeUserId, persistCase, persistNotes]);

  const updateCase = useCallback((id: string, patch: Partial<CaseItem>) => {
    setCases((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch, updated_at: nowIso() };
        persistCase(next).catch((error) => setSyncMessage(error.message));
        return next;
      })
    );
  }, [persistCase]);

  const updateNoteField = useCallback((caseId: string, field: EditableFieldKey, value: string) => {
    setNotes((current) =>
      current.map((item) => {
        if (item.case_id !== caseId) return item;
        const next = { ...item, [field]: sanitizeHtml(value), updated_at: nowIso() };
        persistNotes(next).catch((error) => setSyncMessage(error.message));
        return next;
      })
    );
  }, [persistNotes]);

  const importSnapshot = useCallback(async (snapshot: AppSnapshot) => {
    const mergedUiState = {
      ...uiState,
      expanded_topic_ids: Array.from(new Set([...uiState.expanded_topic_ids, ...snapshot.uiState.expanded_topic_ids])),
      collapsed_fields: Array.from(new Set([...uiState.collapsed_fields, ...snapshot.uiState.collapsed_fields])),
      updated_at: nowIso()
    };

    await mergeLocalSnapshot(snapshot);
    await put("user_ui_state", { ...mergedUiState, id: activeUserId });
    setTopics((current) => [...current, ...snapshot.topics]);
    setCases((current) => [...current, ...snapshot.cases]);
    setNotes((current) => [...current, ...snapshot.notes]);
    setUiState(mergedUiState);
    setSelectedCaseId(snapshot.cases[0]?.id || selectedCaseId);
    await Promise.all([
      ...snapshot.topics.map((item) => recordChange(activeUserId, "topics", item)),
      ...snapshot.cases.map((item) => recordChange(activeUserId, "cases", item)),
      ...snapshot.notes.map((item) => recordChange(activeUserId, "case_notes", item)),
      recordChange(activeUserId, "user_ui_state", mergedUiState)
    ]);
  }, [activeUserId, selectedCaseId, uiState]);

  const visibleTopics = useMemo(() => topics.filter((topic) => !topic.deleted_at), [topics]);
  const visibleCases = useMemo(() => cases.filter((item) => !item.deleted_at), [cases]);
  const selectedCase = visibleCases.find((item) => item.id === selectedCaseId) || null;
  const selectedNotes = selectedCase ? notes.find((item) => item.case_id === selectedCase.id) || emptyNotes(selectedCase.id, activeUserId) : null;

  return {
    FIELD_LABELS,
    topics: visibleTopics,
    cases: visibleCases,
    notes,
    uiState,
    selectedCase,
    selectedNotes,
    selectedCaseId,
    syncMessage,
    setSelectedCaseId,
    addTopic,
    updateTopic,
    addBlankCase,
    addApiCase,
    updateCase,
    updateNoteField,
    saveUiState,
    importSnapshot,
    reload: load,
    sync: () => syncNow(activeUserId).then(load)
  };
}
