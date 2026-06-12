import { ChangeEvent, useState } from "react";
import type { AppSnapshot } from "../types";
import { convertOldJson } from "../lib/oldJson";

type Props = {
  userId: string;
  onImport: (snapshot: AppSnapshot) => Promise<void>;
};

export function JsonImportView({ userId, onImport }: Props) {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [message, setMessage] = useState("");

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      setSnapshot(convertOldJson(parsed, userId));
      setMessage("미리보기를 확인한 뒤 가져오기를 누르세요.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "JSON 파일을 읽지 못했습니다.");
    }
  }

  async function runImport() {
    if (!snapshot) return;
    await onImport(snapshot);
    setMessage("가져오기가 끝났습니다. 온라인이면 곧 계정 저장소로 동기화됩니다.");
  }

  return (
    <section className="panel-content">
      <header className="panel-header">
        <h2>기존 JSON 가져오기</h2>
      </header>
      <input type="file" accept="application/json,.json" onChange={chooseFile} />
      {snapshot && (
        <div className="import-preview">
          <p>목차 {snapshot.topics.length}개</p>
          <p>판례 {snapshot.cases.length}개</p>
          <p>메모 {snapshot.notes.length}개</p>
          <button onClick={runImport}>현재 계정에 추가</button>
        </div>
      )}
      <p>{message}</p>
    </section>
  );
}
