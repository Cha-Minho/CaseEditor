import type { CaseItem, Topic } from "../types";

const UNCLASSIFIED_TOPIC_ID = "__unclassified__";

type Props = {
  topics: Topic[];
  cases: CaseItem[];
  expandedIds: string[];
  selectedCaseId: string | null;
  onSelectCase: (id: string) => void;
  onToggleTopic: (id: string) => void;
  onAddTopic: (parentId?: string | null) => void;
  onRenameTopic: (id: string, name: string) => void;
  onDeleteTopic: (id: string) => void;
  onMoveCase: (caseId: string, topicId: string | null) => void;
};

export function TopicTree(props: Props) {
  const roots = props.topics.filter((topic) => !topic.parent_id).sort((a, b) => a.sort_order - b.sort_order);
  const unclassified = props.cases.filter((item) => !item.topic_id);
  const unclassifiedOpen = props.expandedIds.includes(UNCLASSIFIED_TOPIC_ID);

  function renameTopic(topic: Topic) {
    const nextName = window.prompt("목차 이름", topic.name)?.trim();
    if (nextName && nextName !== topic.name) props.onRenameTopic(topic.id, nextName);
  }

  function renderCase(caseItem: CaseItem) {
    return (
      <button
        key={caseItem.id}
        draggable
        onDragStart={(event) => event.dataTransfer.setData("case-id", caseItem.id)}
        className={`tree-case-line ${props.selectedCaseId === caseItem.id ? "active" : ""}`}
        onClick={() => props.onSelectCase(caseItem.id)}
      >
        <span className={caseItem.important ? "tree-case-star" : "tree-case-dot"}>
          {caseItem.important ? "★" : "•"}
        </span>
        <span className="tree-case-copy">
          <span className="tree-case-title">{caseItem.title}</span>
          {caseItem.case_no && <span className="tree-case-no">{caseItem.case_no}</span>}
        </span>
      </button>
    );
  }

  function renderTopic(topic: Topic, depth = 0) {
    const children = props.topics.filter((item) => item.parent_id === topic.id).sort((a, b) => a.sort_order - b.sort_order);
    const cases = props.cases.filter((item) => item.topic_id === topic.id);
    const open = props.expandedIds.includes(topic.id);
    const itemCount = children.length + cases.length;

    return (
      <div className="topic-node" key={topic.id}>
        <div
          className={`topic-line ${open ? "active" : ""}`}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            const caseId = event.dataTransfer.getData("case-id");
            if (caseId) props.onMoveCase(caseId, topic.id);
          }}
        >
          <button className="twisty" onClick={() => props.onToggleTopic(topic.id)}>
            {open ? "▾" : "▸"}
          </button>
          <button className="topic-name" onClick={() => props.onToggleTopic(topic.id)}>
            <span>{topic.name}</span>
          </button>
          <span className="count">{itemCount}</span>
          <span className="node-buttons">
            <button title="하위 목차 추가" onClick={() => props.onAddTopic(topic.id)}>+</button>
            <button title="목차 이름 변경" onClick={() => renameTopic(topic)}>이름</button>
            <button title="목차 삭제" onClick={() => props.onDeleteTopic(topic.id)}>×</button>
          </span>
        </div>
        {open && (
          <div className="children">
            {cases.map((caseItem) => renderCase(caseItem))}
            {children.map((child) => renderTopic(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="panel-content topic-panel-content">
      <header className="panel-header">
        <h2>목차</h2>
        <button onClick={() => props.onAddTopic(null)}>목차 추가</button>
      </header>
      <div className="tree">
        {roots.map((topic) => renderTopic(topic))}
        {unclassified.length > 0 && (
          <div className="topic-node unclassified-node">
            <div
              className={`topic-line muted ${unclassifiedOpen ? "active" : ""}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                const caseId = event.dataTransfer.getData("case-id");
                if (caseId) props.onMoveCase(caseId, null);
              }}
            >
              <button className="twisty" onClick={() => props.onToggleTopic(UNCLASSIFIED_TOPIC_ID)}>
                {unclassifiedOpen ? "▾" : "▸"}
              </button>
              <button className="topic-name" onClick={() => props.onToggleTopic(UNCLASSIFIED_TOPIC_ID)}>
                <span>미분류</span>
              </button>
              <span className="count">{unclassified.length}</span>
            </div>
            {unclassifiedOpen && <div className="children">{unclassified.map((caseItem) => renderCase(caseItem))}</div>}
          </div>
        )}
      </div>
    </section>
  );
}
