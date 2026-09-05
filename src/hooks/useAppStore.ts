import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppSnapshot, CaseItem, CaseNotes, EditableFieldKey, Topic, UiState } from "../types";
import { FIELD_LABELS } from "../types";
import { fetchLawCase } from "../lib/lawApi";
import type { PdfCaseImport } from "../lib/pdfCase";
import { localUserId, makeId, nowIso } from "../lib/id";
import { put, readSnapshot } from "../lib/localDb";
import { mergeLocalSnapshot, recordChange, syncNow } from "../lib/sync";
import { supabase } from "../lib/supabase";
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

function lastSelectedCaseKey(userId: string) {
  return `case-editor:last-selected-case:${userId}`;
}

function readLastSelectedCase(userId: string) {
  try {
    return window.localStorage.getItem(lastSelectedCaseKey(userId));
  } catch {
    return null;
  }
}

function storeLastSelectedCase(userId: string, caseId: string | null) {
  try {
    const key = lastSelectedCaseKey(userId);
    if (caseId) window.localStorage.setItem(key, caseId);
    else window.localStorage.removeItem(key);
  } catch {
    // Private browsing can deny localStorage. The app still works without restoration.
  }
}

function isNewer<T extends { updated_at: string }>(candidate: T, current: T) {
  return new Date(candidate.updated_at).getTime() >= new Date(current.updated_at).getTime();
}

function mergeLatest<T extends { user_id: string; updated_at: string }>(
  current: T[],
  incoming: T[],
  userId: string,
  getId: (item: T) => string
) {
  const merged = new Map(current.filter((item) => item.user_id === userId).map((item) => [getId(item), item]));
  incoming.forEach((item) => {
    const existing = merged.get(getId(item));
    if (!existing || isNewer(item, existing)) merged.set(getId(item), item);
  });
  return Array.from(merged.values());
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
  const [selectedCaseId, setSelectedCaseIdState] = useState<string | null>(() => readLastSelectedCase(activeUserId));
  const [syncMessage, setSyncMessage] = useState("로컬 저장 준비 중");
  const syncTimer = useRef<number | null>(null);
  const remotePullTimer = useRef<number | null>(null);
  const selectedCaseIdRef = useRef(selectedCaseId);

  const setSelectedCaseId = useCallback((caseId: string | null) => {
    selectedCaseIdRef.current = caseId;
    setSelectedCaseIdState(caseId);
    storeLastSelectedCase(activeUserId, caseId);
  }, [activeUserId]);

  const load = useCallback(async () => {
    const snapshot = await readSnapshot(activeUserId);
    setTopics((current) => mergeLatest(current, snapshot.topics, activeUserId, (item) => item.id));
    setCases((current) => mergeLatest(current, snapshot.cases, activeUserId, (item) => item.id));
    setNotes((current) => mergeLatest(current, snapshot.notes, activeUserId, (item) => item.case_id));
    setUiState((current) =>
      current.user_id === activeUserId && !isNewer(snapshot.uiState, current) ? current : snapshot.uiState
    );
    const availableCases = snapshot.cases.filter((item) => !item.deleted_at);
    const candidates = [selectedCaseIdRef.current, readLastSelectedCase(activeUserId), availableCases[0]?.id];
    const nextSelectedId = candidates.find((id): id is string => Boolean(id) && availableCases.some((item) => item.id === id)) || null;
    setSelectedCaseId(nextSelectedId);
    setSyncMessage("로컬 저장됨");
  }, [activeUserId, setSelectedCaseId]);

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

  const scheduleSync = useCallback(() => {
    if (!userId || !navigator.onLine) return;
    if (syncTimer.current) window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => {
      syncTimer.current = null;
      setSyncMessage("동기화 중");
      syncNow(activeUserId)
        .then(() => setSyncMessage("계정에 저장됨"))
        .catch((error) => setSyncMessage(`동기화 보류: ${error.message}`));
    }, 900);
  }, [activeUserId, userId]);

  const scheduleRemotePull = useCallback(() => {
    if (!userId || !navigator.onLine) return;
    if (remotePullTimer.current) window.clearTimeout(remotePullTimer.current);
    remotePullTimer.current = window.setTimeout(() => {
      remotePullTimer.current = null;
      // 원격 내용은 IndexedDB에만 반영한다. 열린 편집 화면은 사용자의 로컬 편집본을
      // 계속 유지하고, 다음 앱 진입 때 로컬 DB에서 최신 상태를 읽는다.
      syncNow(activeUserId)
        .then(() => setSyncMessage("계정과 동기화됨"))
        .catch((error) => setSyncMessage(`동기화 보류: ${error.message}`));
    }, 500);
  }, [activeUserId, userId]);

  useEffect(() => {
    return () => {
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
      if (remotePullTimer.current) window.clearTimeout(remotePullTimer.current);
    };
  }, []);

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
        .catch((error) => setSyncMessage(`동기화 보류: ${error.message}`));
    };
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  }, [activeUserId, userId]);

  useEffect(() => {
    if (!userId || !supabase) return;
    const client = supabase;

    const channel = client
      .channel(`case-editor-${activeUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "topics", filter: `user_id=eq.${activeUserId}` }, scheduleRemotePull)
      .on("postgres_changes", { event: "*", schema: "public", table: "cases", filter: `user_id=eq.${activeUserId}` }, scheduleRemotePull)
      .on("postgres_changes", { event: "*", schema: "public", table: "case_notes", filter: `user_id=eq.${activeUserId}` }, scheduleRemotePull)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_ui_state", filter: `user_id=eq.${activeUserId}` }, scheduleRemotePull)
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRemotePull();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", scheduleRemotePull);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", scheduleRemotePull);
      client.removeChannel(channel);
    };
  }, [activeUserId, scheduleRemotePull, userId]);

  const persistTopic = useCallback(async (topic: Topic) => {
    await put("topics", topic);
    await recordChange(activeUserId, "topics", topic);
    scheduleSync();
  }, [activeUserId, scheduleSync]);

  const persistCase = useCallback(async (caseItem: CaseItem) => {
    await put("cases", caseItem);
    await recordChange(activeUserId, "cases", caseItem);
    scheduleSync();
  }, [activeUserId, scheduleSync]);

  const persistNotes = useCallback(async (caseNotes: CaseNotes) => {
    await put("case_notes", caseNotes);
    await recordChange(activeUserId, "case_notes", caseNotes);
    scheduleSync();
  }, [activeUserId, scheduleSync]);

  const persistUi = useCallback(async (next: UiState) => {
    const stored = { ...next, id: activeUserId };
    await put("user_ui_state", stored);
    await recordChange(activeUserId, "user_ui_state", next);
    scheduleSync();
  }, [activeUserId, scheduleSync]);

  const saveUiState = useCallback((patch: Partial<UiState>) => {
    setUiState((current) => {
      const next = { ...current, ...patch, updated_at: nowIso() };
      persistUi(next).catch((error) => setSyncMessage(error.message));
      return next;
    });
  }, [persistUi]);

  const toggleExpandedTopic = useCallback((topicId: string) => {
    setUiState((current) => {
      const expanded = new Set(current.expanded_topic_ids);
      expanded.has(topicId) ? expanded.delete(topicId) : expanded.add(topicId);
      const next = { ...current, expanded_topic_ids: Array.from(expanded), updated_at: nowIso() };
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

  const deleteTopic = useCallback((id: string) => {
    const deletedAt = nowIso();
    const childMap = new Map<string | null, Topic[]>();
    topics.forEach((topic) => {
      const key = topic.parent_id || null;
      childMap.set(key, [...(childMap.get(key) || []), topic]);
    });

    const collect = (topicId: string, out = new Set<string>()) => {
      out.add(topicId);
      (childMap.get(topicId) || []).forEach((child) => collect(child.id, out));
      return out;
    };

    const ids = collect(id);
    setTopics((current) =>
      current.map((topic) => {
        if (!ids.has(topic.id)) return topic;
        const next = { ...topic, deleted_at: deletedAt, updated_at: deletedAt };
        persistTopic(next).catch((error) => setSyncMessage(error.message));
        return next;
      })
    );
    setCases((current) =>
      current.map((item) => {
        if (!item.topic_id || !ids.has(item.topic_id)) return item;
        const next = { ...item, topic_id: null, updated_at: deletedAt };
        persistCase(next).catch((error) => setSyncMessage(error.message));
        return next;
      })
    );
    saveUiState({ expanded_topic_ids: uiState.expanded_topic_ids.filter((topicId) => !ids.has(topicId)) });
  }, [persistCase, persistTopic, saveUiState, topics, uiState.expanded_topic_ids]);

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
        api_status: result.found === false ? "failed" as const : "loaded" as const,
        api_error: result.api_error || null,
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

  const addPdfCases = useCallback(async (pdfCases: PdfCaseImport[], topicId: string | null = null) => {
    if (!pdfCases.length) return;
    const timestamp = nowIso();
    const entries = pdfCases.map((pdfCase) => {
      const caseItem: CaseItem = {
        id: makeId("case"),
        user_id: activeUserId,
        topic_id: topicId,
        title: pdfCase.title,
        case_no: [pdfCase.courtName, pdfCase.caseNo].filter(Boolean).join(" "),
        important: false,
        api_status: "manual",
        api_error: null,
        created_at: timestamp,
        updated_at: timestamp,
        deleted_at: null
      };
      return {
        caseItem,
        caseNotes: { ...emptyNotes(caseItem.id, activeUserId), source_html: sanitizeHtml(pdfCase.sourceHtml), updated_at: timestamp }
      };
    });
    setCases((current) => [...current, ...entries.map((entry) => entry.caseItem)]);
    setNotes((current) => [...current, ...entries.map((entry) => entry.caseNotes)]);
    setSelectedCaseId(entries[entries.length - 1].caseItem.id);
    await Promise.all(entries.flatMap((entry) => [persistCase(entry.caseItem), persistNotes(entry.caseNotes)]));
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

  const updateCases = useCallback((ids: string[], patch: Partial<CaseItem>) => {
    const idSet = new Set(ids);
    if (!idSet.size) return;
    const timestamp = nowIso();
    setCases((current) =>
      current.map((item) => {
        if (!idSet.has(item.id)) return item;
        const next = { ...item, ...patch, updated_at: timestamp };
        persistCase(next).catch((error) => setSyncMessage(error.message));
        return next;
      })
    );
  }, [persistCase]);

  const updateDiagram = useCallback((caseId: string, diagram: CaseNotes['diagram']) => {
    setNotes((current) => current.map((item) => {
      if (item.case_id !== caseId) return item;
      const next = { ...item, diagram, updated_at: nowIso() };
      persistNotes(next).catch((error) => setSyncMessage(error.message));
      return next;
    }));
  }, [persistNotes]);

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
    if (userId && navigator.onLine) {
      setSyncMessage("가져온 JSON 업로드 중");
      await syncNow(activeUserId);
      setSyncMessage("가져온 JSON을 계정에 저장함");
      return;
    }
    scheduleSync();
  }, [activeUserId, scheduleSync, selectedCaseId, uiState, userId]);

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
    deleteTopic,
    addBlankCase,
    addApiCase,
    addPdfCases,
    updateCase,
    updateCases,
    updateNoteField,
    updateDiagram,
    saveUiState,
    toggleExpandedTopic,
    importSnapshot,
    reload: load,
    sync: () => syncNow(activeUserId)
  };
}
