import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SidebarLayout } from '../src/components/SidebarLayout';
import '../src/styles.css';

function Fixture() {
  const [selected, setSelected] = useState(false);
  return <SidebarLayout className="show-editor">
    <aside className="sidebar">
      <header className="sidebar-head"><button>판례 추가</button></header>
      <input aria-label="검색" placeholder="사건번호, 태그 검색" />
      <div className="case-list">
        <div className="folder-row">제314조 · 진술불능과 특신상태</div>
        <div className="case-item" onClick={() => setSelected(true)}>서울남부지방법원 2021고합504</div>
      </div>
    </aside>
    <main className="editor-pane"><header className="editor-header"><h2>{selected ? '2021고합504' : '2023도13406'}</h2></header><div className="field-box" contentEditable suppressContentEditableWarning>기존 판례 메모</div></main>
  </SidebarLayout>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
