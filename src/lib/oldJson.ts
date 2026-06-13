import type { AppSnapshot, CaseItem, CaseNotes, Topic, UiState } from "../types";
import { makeId, nowIso } from "./id";

type OldTopic = {
  id?: string;
  name?: string;
  title?: string;
  children?: OldTopic[];
  topics?: OldTopic[];
  cases?: string[];
};

type OldCase = Record<string, unknown> & {
  id?: string;
  title?: string;
  caseNo?: string;
  case_no?: string;
  topicId?: string | null;
  topic_id?: string | null;
  important?: boolean;
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function html(value: unknown) {
  return typeof value === "string" ? value : "";
}

function unwrapState(input: unknown): Record<string, unknown> {
  const root = input as Record<string, unknown>;
  const candidates = [root, root.state, root.data, root.payload, root.backup]
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  return candidates.find((item) => Array.isArray(item.topics) || Array.isArray(item.cases)) || root;
}

function flattenTopics(items: OldTopic[], userId: string, parentId: string | null, out: Topic[], map: Map<string, string>) {
  items.forEach((item, index) => {
    const id = makeId("topic");
    if (item.id) map.set(item.id, id);
    const timestamp = nowIso();
    out.push({
      id,
      user_id: userId,
      parent_id: parentId,
      name: item.name || item.title || "새 목차",
      sort_order: index,
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null
    });
    flattenTopics([...(item.children || []), ...(item.topics || [])], userId, id, out, map);
  });
}

export function convertOldJson(input: unknown, userId: string): AppSnapshot {
  const oldState = unwrapState(input);
  const timestamp = nowIso();
  const topicMap = new Map<string, string>();
  const topics: Topic[] = [];
  const rawTopics = asArray<OldTopic>(oldState.topics || oldState.topicTree || oldState.folders);
  flattenTopics(rawTopics, userId, null, topics, topicMap);

  const oldCases = asArray<OldCase>(oldState.cases);
  const cases: CaseItem[] = oldCases.map((item, index) => {
    const topicId = html(item.topicId || item.topic_id);
    return {
      id: item.id || makeId("case"),
      user_id: userId,
      topic_id: topicId ? topicMap.get(topicId) || null : null,
      title: item.title || item.caseNo || item.case_no || `빈 판례 ${index + 1}`,
      case_no: item.caseNo || item.case_no || "",
      important: Boolean(item.important),
      api_status: item.caseNo || item.case_no ? "loaded" : "manual",
      api_error: null,
      created_at: html(item.createdAt) || timestamp,
      updated_at: html(item.updatedAt) || timestamp,
      deleted_at: null
    };
  });

  const notes: CaseNotes[] = oldCases.map((item, index) => ({
    case_id: cases[index].id,
    user_id: userId,
    source_html: html(item.sourceHtml || item.source_html || item.originalHtml),
    holding_html: html(item.holdingHtml || item.holding_html),
    judgment_summary_html: html(item.judgmentSummaryHtml || item.judgment_summary_html || item.judgmentHtml),
    key_phrases_html: html(item.keyPhrasesHtml || item.key_phrases_html),
    summary_html: html(item.summaryHtml || item.summary_html),
    majority_html: html(item.majorityHtml || item.majority_html),
    dissent_html: html(item.dissentHtml || item.dissent_html),
    concurring_html: html(item.concurringHtml || item.concurring_html),
    tags_html: html(item.tagsHtml || item.tags_html),
    updated_at: cases[index].updated_at
  }));

  const uiState: UiState = {
    user_id: userId,
    expanded_topic_ids: asArray<string>(oldState.expandedTopicIds).map((id) => topicMap.get(id) || id),
    collapsed_fields: asArray<string>(oldState.collapsedFields),
    split_width: typeof oldState.splitWidth === "number" ? oldState.splitWidth : 52,
    pane_widths: {},
    updated_at: timestamp
  };

  return { topics, cases, notes, uiState };
}
