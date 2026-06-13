import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AuthView } from "./components/AuthView";
import { CaseSearchPanel } from "./components/CaseSearchPanel";
import { Editor } from "./components/Editor";
import { JsonImportView } from "./components/JsonImportView";
import { StatusPanel } from "./components/StatusPanel";
import { Toolbar } from "./components/Toolbar";
import { TopicTree } from "./components/TopicTree";
import { useAppStore } from "./hooks/useAppStore";
import { localUserId } from "./lib/id";
import { supabase, supabaseConfigured } from "./lib/supabase";

type Panel = "topics" | "search" | "import" | "status" | null;

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [online, setOnline] = useState(navigator.onLine);
  const userId = session?.user.id || localUserId();
  const store = useAppStore(userId);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    const closePanel = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanel(null);
    };
    window.addEventListener("keydown", closePanel);
    return () => window.removeEventListener("keydown", closePanel);
  }, []);

  if (!authReady) return <div className="loading-screen">앱을 여는 중입니다.</div>;

  if (supabaseConfigured && !session) {
    return <AuthView />;
  }

  const closePanel = () => setPanel(null);

  return (
    <div className="app-shell">
      <Toolbar
        activePanel={panel}
        onPanelChange={(next) => setPanel((current) => (current === next ? null : next))}
        onAddBlank={() => store.addBlankCase(null)}
        onSync={() => store.sync()}
        onSignOut={() => supabase?.auth.signOut()}
        configured={supabaseConfigured}
        signedIn={Boolean(session)}
        online={online}
        syncMessage={store.syncMessage}
      />

      {panel === "topics" && (
        <div className="panel-layer">
          <button className="panel-backdrop" aria-label="팝업 닫기" onClick={closePanel} />
          <aside className="floating-panel topic-panel" aria-label="목차 팝업">
            <button className="panel-close" onClick={closePanel} aria-label="팝업 닫기">×</button>
            <TopicTree
              topics={store.topics}
              cases={store.cases}
              expandedIds={store.uiState.expanded_topic_ids}
              selectedCaseId={store.selectedCaseId}
              onSelectCase={store.setSelectedCaseId}
              onToggleTopic={(id) => {
                const expanded = new Set(store.uiState.expanded_topic_ids);
                expanded.has(id) ? expanded.delete(id) : expanded.add(id);
                store.saveUiState({ expanded_topic_ids: Array.from(expanded) });
            }}
            onAddTopic={store.addTopic}
            onRenameTopic={(id, name) => store.updateTopic(id, { name })}
            onDeleteTopic={store.deleteTopic}
            onMoveCase={(caseId, topicId) => store.updateCase(caseId, { topic_id: topicId })}
          />
          </aside>
        </div>
      )}

      {panel === "search" && (
        <div className="panel-layer">
          <button className="panel-backdrop" aria-label="팝업 닫기" onClick={closePanel} />
          <aside className="floating-panel search-panel" aria-label="검색 팝업">
            <button className="panel-close" onClick={closePanel} aria-label="팝업 닫기">×</button>
            <CaseSearchPanel
              cases={store.cases}
              topics={store.topics}
              selectedCaseId={store.selectedCaseId}
              onSelectCase={store.setSelectedCaseId}
              onAddApiCase={store.addApiCase}
              onAddBlank={store.addBlankCase}
            />
          </aside>
        </div>
      )}

      {panel === "import" && (
        <div className="panel-layer">
          <button className="panel-backdrop" aria-label="팝업 닫기" onClick={closePanel} />
          <aside className="floating-panel import-panel" aria-label="JSON 가져오기 팝업">
            <button className="panel-close" onClick={closePanel} aria-label="팝업 닫기">×</button>
            <JsonImportView userId={userId} onImport={store.importSnapshot} />
          </aside>
        </div>
      )}

      {panel === "status" && (
        <div className="panel-layer">
          <button className="panel-backdrop" aria-label="팝업 닫기" onClick={closePanel} />
          <aside className="floating-panel status-panel" aria-label="상태 팝업">
            <button className="panel-close" onClick={closePanel} aria-label="팝업 닫기">×</button>
            <StatusPanel
              configured={supabaseConfigured}
              signedIn={Boolean(session)}
              online={online}
              syncMessage={store.syncMessage}
              userEmail={session?.user.email}
            />
          </aside>
        </div>
      )}

      <main className="workspace">
        <Editor
          cases={store.cases}
          topics={store.topics}
          selectedCase={store.selectedCase}
          selectedNotes={store.selectedNotes}
          collapsedFields={store.uiState.collapsed_fields}
          splitWidth={store.uiState.split_width}
          syncMessage={store.syncMessage}
          onSelectCase={store.setSelectedCaseId}
          onUpdateCase={store.updateCase}
          onUpdateField={store.updateNoteField}
          onSaveUi={store.saveUiState}
        />
      </main>
    </div>
  );
}
