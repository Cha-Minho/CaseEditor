import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AuthView } from "./components/AuthView";
import { Editor } from "./components/Editor";
import { Sidebar } from "./components/Sidebar";
import { useAppStore } from "./hooks/useAppStore";
import { localUserId } from "./lib/id";
import { supabase, supabaseConfigured } from "./lib/supabase";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [mobileView, setMobileView] = useState<"list" | "editor">("list");
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
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

  if (!authReady) return <div className="loading-screen">앱을 여는 중입니다.</div>;

  if (supabaseConfigured && !session) {
    return <AuthView />;
  }

  const selectCase = (id: string) => {
    store.setSelectedCaseId(id);
    setSelectedCaseIds([id]);
    setMobileView("editor");
  };

  const selectCases = (ids: string[]) => {
    const nextIds = Array.from(new Set(ids));
    setSelectedCaseIds(nextIds);
    if (nextIds[0]) store.setSelectedCaseId(nextIds[0]);
  };

  const moveEditorSelection = (topicId: string | null) => {
    const ids = selectedCaseIds.length > 1 ? selectedCaseIds : store.selectedCaseId ? [store.selectedCaseId] : [];
    store.updateCases(ids, { topic_id: topicId });
  };

  const moveCases = (ids: string[], topicId: string | null) => {
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) return;
    store.updateCases(uniqueIds, { topic_id: topicId });
    setSelectedCaseIds(uniqueIds);
    store.setSelectedCaseId(uniqueIds[0]);
  };

  return (
    <div className={`app ${mobileView === "editor" ? "show-editor" : ""}`}>
      <Sidebar
        userId={userId}
        topics={store.topics}
        cases={store.cases}
        notes={store.notes}
        expandedIds={store.uiState.expanded_topic_ids}
        selectedCaseId={store.selectedCaseId}
        selectedCaseIds={selectedCaseIds}
        configured={supabaseConfigured}
        userEmail={session?.user.email}
        onSelectCase={selectCase}
        onSelectCases={selectCases}
        onMoveCases={moveCases}
        onToggleTopic={store.toggleExpandedTopic}
        onAddTopic={store.addTopic}
        onRenameTopic={(id, name) => store.updateTopic(id, { name })}
        onDeleteTopic={store.deleteTopic}
        onAddBlank={() => {
          store.addBlankCase(null);
          setMobileView("editor");
        }}
        onAddApiCase={async (caseNo) => {
          setMobileView("editor");
          await store.addApiCase(caseNo, null);
        }}
        onAddPdfCases={async (pdfCases) => {
          setMobileView("editor");
          await store.addPdfCases(pdfCases, null);
        }}
        onImport={store.importSnapshot}
        onDeleteCases={(ids) => {
          const deletedAt = new Date().toISOString();
          ids.forEach((id) => store.updateCase(id, { deleted_at: deletedAt }));
          setSelectedCaseIds([]);
        }}
        onSignOut={() => supabase?.auth.signOut()}
      />
      <Editor
        topics={store.topics}
        selectedCase={store.selectedCase}
        selectedNotes={store.selectedNotes}
        selectedCaseIds={selectedCaseIds}
        collapsedFields={store.uiState.collapsed_fields}
        splitWidth={store.uiState.split_width}
        onSaveSplit={(width) => store.saveUiState({ split_width: width })}
        onBack={() => setMobileView("list")}
        onUpdateCase={store.updateCase}
        onMoveSelectedCases={moveEditorSelection}
        onUpdateField={store.updateNoteField}
        onToggleField={(field) => {
          const set = new Set(store.uiState.collapsed_fields);
          set.has(field) ? set.delete(field) : set.add(field);
          store.saveUiState({ collapsed_fields: Array.from(set) });
        }}
        onDelete={(id) => {
          store.updateCase(id, { deleted_at: new Date().toISOString() });
          setSelectedCaseIds([]);
          setMobileView("list");
        }}
        onAddBlank={() => store.addBlankCase(null)}
      />
    </div>
  );
}
