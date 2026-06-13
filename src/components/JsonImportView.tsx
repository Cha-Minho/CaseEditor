import { ChangeEvent, useState } from "react";
import type { AppSnapshot } from "../types";
import { convertOldJson } from "../lib/oldJson";

type Props = {
  userId: string;
  onImport: (snapshot: AppSnapshot) => Promise<void>;
};

export function JsonImportView({ userId, onImport }: Props) {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState("");

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const converted = convertOldJson(parsed, userId);
      setSnapshot(converted);
      setMessage(
        converted.cases.length || converted.topics.length
          ? "미리보기를 확인한 뒤 가져오기를 누르세요."
          : "JSON은 읽었지만 가져올 판례나 목차를 찾지 못했습니다."
      );
    } catch (error) {
      setSnapshot(null);
      setMessage(error instanceof Error ? error.message : "JSON 파일을 읽지 못했습니다.");
    }
  }

  async function runImport() {
    if (!snapshot) return;
    await onImport(snapshot);
    setMessage("가져오기가 끝났습니다. 온라인 상태라면 계정 DB 업로드까지 시도했습니다.");
  }

  return (
    <section className="panel-content">
      <header className="panel-header">
        <h2>기존 JSON 가져오기</h2>
      </header>
      <label className="file-import-box">
        <span>JSON 파일 선택</span>
        <input type="file" accept="application/json,.json" onChange={chooseFile} />
      </label>
      {snapshot && (
        <div className="import-preview">
          <strong>{fileName || "선택한 파일"}</strong>
          <dl>
            <div>
              <dt>목차</dt>
              <dd>{snapshot.topics.length}개</dd>
            </div>
            <div>
              <dt>판례</dt>
              <dd>{snapshot.cases.length}개</dd>
            </div>
            <div>
              <dt>메모</dt>
              <dd>{snapshot.notes.length}개</dd>
            </div>
          </dl>
          <button disabled={!snapshot.cases.length && !snapshot.topics.length} onClick={runImport}>현재 계정에 추가</button>
        </div>
      )}
      <p className="import-message">{message}</p>
    </section>
  );
}
