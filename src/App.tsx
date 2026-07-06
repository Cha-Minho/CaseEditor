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

  return (
    <div className={`app ${mobileView === "editor" ? "show-editor" : ""}`}>
      <Sidebar
        userId={userId}
        topics={store.topics}
        cases={store.cases}
        expandedIds={store.uiState.expanded_topic_ids}
        selectedCaseId={store.selectedCaseId}
        configured={supabaseConfigured}
        userEmail={session?.user.email}
        onSelectCase={(id) => {
          store.setSelectedCaseId(id);
          setMobileView("editor");
        }}
        onToggleTopic={(id) => {
          const expanded = new Set(store.uiState.expanded_topic_ids);
          expanded.has(id) ? expanded.delete(id) : expanded.add(id);
          store.saveUiState({ expanded_topic_ids: Array.from(expanded) });
        }}
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
        onImport={store.importSnapshot}
        onDeleteCases={(ids) => {
          const deletedAt = new Date().toISOString();
          ids.forEach((id) => store.updateCase(id, { deleted_at: deletedAt }));
        }}
        onSignOut={() => supabase?.auth.signOut()}
      />
      <Editor
        topics={store.topics}
        selectedCase={store.selectedCase}
        selectedNotes={store.selectedNotes}
        collapsedFields={store.uiState.collapsed_fields}
        splitWidth={store.uiState.split_width}
        onSaveSplit={(width) => store.saveUiState({ split_width: width })}
        onBack={() => setMobileView("list")}
        onUpdateCase={store.updateCase}
        onUpdateField={store.updateNoteField}
        onToggleField={(field) => {
          const set = new Set(store.uiState.collapsed_fields);
          set.has(field) ? set.delete(field) : set.add(field);
          store.saveUiState({ collapsed_fields: Array.from(set) });
        }}
        onDelete={(id) => {
          store.updateCase(id, { deleted_at: new Date().toISOString() });
          setMobileView("list");
        }}
        onAddBlank={() => store.addBlankCase(null)}
      />
    </div>
  );
}
