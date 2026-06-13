type Panel = "topics" | "search" | "import" | "status";

type Props = {
  activePanel: Panel | null;
  configured: boolean;
  signedIn: boolean;
  online: boolean;
  onPanelChange: (panel: Panel) => void;
  onAddBlank: () => void;
  onSync: () => void;
  onSignOut: () => void;
};

export function Toolbar({ activePanel, configured, signedIn, online, onPanelChange, onAddBlank, onSync, onSignOut }: Props) {
  const accountLabel = configured ? (signedIn ? "계정" : "로그인 필요") : "로컬";
  const networkLabel = online ? "온라인" : "오프라인";

  return (
    <nav className="toolbar" aria-label="앱 도구">
      <div className="brand-mark">
        <div className="brand-icon">判</div>
        <div>
          <h1>판례 정리함</h1>
          <p className="subtitle">Case notes organizer</p>
        </div>
      </div>
      <button className={activePanel === "topics" ? "active" : ""} onClick={() => onPanelChange("topics")}>목차</button>
      <button className={activePanel === "search" ? "active" : ""} onClick={() => onPanelChange("search")}>검색</button>
      <button onClick={onAddBlank}>빈 판례</button>
      <button className={activePanel === "import" ? "active" : ""} onClick={() => onPanelChange("import")}>JSON</button>
      <button className={activePanel === "status" ? "active" : ""} onClick={() => onPanelChange("status")}>상태</button>
      <button onClick={onSync}>동기화</button>
      {configured && <button onClick={onSignOut}>로그아웃</button>}
      <div className={`toolbar-status ${online ? "online" : "offline"}`} aria-live="polite">
        <strong>{accountLabel}</strong>
        <span>{networkLabel}</span>
      </div>
    </nav>
  );
}
