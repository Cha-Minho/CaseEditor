type Panel = "topics" | "search" | "import";

type Props = {
  activePanel: Panel | null;
  configured: boolean;
  onPanelChange: (panel: Panel) => void;
  onAddBlank: () => void;
  onSync: () => void;
  onSignOut: () => void;
};

export function Toolbar({ activePanel, configured, onPanelChange, onAddBlank, onSync, onSignOut }: Props) {
  return (
    <nav className="toolbar" aria-label="앱 도구">
      <button className={activePanel === "topics" ? "active" : ""} onClick={() => onPanelChange("topics")}>목차</button>
      <button className={activePanel === "search" ? "active" : ""} onClick={() => onPanelChange("search")}>검색</button>
      <button onClick={onAddBlank}>빈 판례</button>
      <button className={activePanel === "import" ? "active" : ""} onClick={() => onPanelChange("import")}>JSON</button>
      <button onClick={onSync}>동기화</button>
      {configured && <button onClick={onSignOut}>로그아웃</button>}
    </nav>
  );
}
