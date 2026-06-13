import type { CaseItem, Topic } from "../types";

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

  function renderTopic(topic: Topic, depth = 0) {
    const children = props.topics.filter((item) => item.parent_id === topic.id).sort((a, b) => a.sort_order - b.sort_order);
    const cases = props.cases.filter((item) => item.topic_id === topic.id);
    const open = props.expandedIds.includes(topic.id);

    return (
      <li key={topic.id}>
        <div
          className="topic-row"
          style={{ paddingLeft: 8 + depth * 16 }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            const caseId = event.dataTransfer.getData("case-id");
            if (caseId) props.onMoveCase(caseId, topic.id);
          }}
        >
          <button className="twisty" onClick={() => props.onToggleTopic(topic.id)}>{open ? "▾" : "▸"}</button>
          <input
            value={topic.name}
            onMouseDown={(event) => {
              if (document.activeElement !== event.currentTarget) props.onToggleTopic(topic.id);
            }}
            onChange={(event) => props.onRenameTopic(topic.id, event.target.value)}
            aria-label="목차 이름"
          />
          <div className="topic-tools">
            <button title="하위 목차 추가" onClick={() => props.onAddTopic(topic.id)}>+</button>
            <button title="목차 삭제" onClick={() => props.onDeleteTopic(topic.id)}>×</button>
          </div>
        </div>
        {open && (
          <ul>
            {cases.map((caseItem) => (
              <li key={caseItem.id}>
                <button
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("case-id", caseItem.id)}
                  className={`case-row ${props.selectedCaseId === caseItem.id ? "selected" : ""}`}
                  style={{ paddingLeft: 34 + depth * 16 }}
                  onClick={() => props.onSelectCase(caseItem.id)}
                >
                  <span>{caseItem.important ? "★" : "☆"}</span>
                  <span>{caseItem.title}</span>
                </button>
              </li>
            ))}
            {children.map((child) => renderTopic(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <section className="panel-content">
      <header className="panel-header">
        <h2>목차</h2>
        <button onClick={() => props.onAddTopic(null)}>목차 추가</button>
      </header>
      <ul className="tree-list">
        {roots.map((topic) => renderTopic(topic))}
        {unclassified.length > 0 && (
          <li className="unclassified-group">
            <div
              className="unclassified-label"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                const caseId = event.dataTransfer.getData("case-id");
                if (caseId) props.onMoveCase(caseId, null);
              }}
            >
              미분류 판례
            </div>
            <ul>
              {unclassified.map((caseItem) => (
                <li key={caseItem.id}>
                  <button
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData("case-id", caseItem.id)}
                    className={`case-row ${props.selectedCaseId === caseItem.id ? "selected" : ""}`}
                    onClick={() => props.onSelectCase(caseItem.id)}
                  >
                    <span>{caseItem.important ? "★" : "☆"}</span>
                    <span>{caseItem.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        )}
      </ul>
    </section>
  );
}
