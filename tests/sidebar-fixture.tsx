import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from '../src/components/Sidebar';
import type { CaseItem, Topic } from '../src/types';
import '../src/styles.css';

const now = new Date().toISOString();
const topic: Topic = { id: 'topic-1', user_id: 'user-1', parent_id: null, name: '민법', sort_order: 0, created_at: now, updated_at: now, deleted_at: null };
const cases: CaseItem[] = Array.from({ length: 5 }, (_, index) => ({
  id: `case-${index + 1}`, user_id: 'user-1', topic_id: topic.id, title: '', case_no: `2020다${index + 1}`,
  important: false, api_status: 'manual', api_error: null, created_at: now, updated_at: now, deleted_at: null
}));

function Fixture() {
  const [selected, setSelected] = useState<string[]>([]);
  return <div style={{ width: 260, height: 700 }}><Sidebar userId="user-1" topics={[topic]} cases={cases} notes={[]} expandedIds={[topic.id]}
    selectedCaseId={null} selectedCaseIds={selected} configured={false} onSelectCase={() => {}} onSelectCases={setSelected}
    onMoveCases={() => {}} onMoveTopic={() => {}} onToggleTopic={() => {}} onAddTopic={() => {}} onRenameTopic={() => {}}
    onDeleteTopic={() => {}} onAddBlank={() => {}} onAddApiCase={async () => {}} onAddPdfCases={async () => {}}
    onImport={async () => {}} onDeleteCases={() => {}} onSignOut={() => {}} /></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
