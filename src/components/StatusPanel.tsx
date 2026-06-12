type Props = {
  configured: boolean;
  signedIn: boolean;
  online: boolean;
  syncMessage: string;
  userEmail?: string;
};

export function StatusPanel({ configured, signedIn, online, syncMessage, userEmail }: Props) {
  const readyForDevices = configured && signedIn && online;

  return (
    <section className="panel-content status-panel-content">
      <header className="panel-header">
        <h2>상태</h2>
      </header>

      <div className={`status-summary ${readyForDevices ? "ready" : "pending"}`}>
        <strong>{readyForDevices ? "계정 동기화 준비됨" : configured ? "계정 연결 확인 필요" : "로컬 전용 모드"}</strong>
        <span>{syncMessage}</span>
      </div>

      <dl className="status-list">
        <div>
          <dt>저장 방식</dt>
          <dd>{configured ? "Supabase 계정 저장소" : "이 브라우저의 로컬 저장소"}</dd>
        </div>
        <div>
          <dt>로그인</dt>
          <dd>{signedIn ? userEmail || "로그인됨" : configured ? "필요" : "사용 안 함"}</dd>
        </div>
        <div>
          <dt>네트워크</dt>
          <dd>{online ? "온라인" : "오프라인"}</dd>
        </div>
      </dl>

      {!configured && (
        <div className="status-note">
          <h3>폰에서도 보려면</h3>
          <p>Supabase와 Vercel 또는 Netlify를 연결한 뒤 배포 주소로 접속하세요. 지금 작성한 로컬 데이터는 계정에 처음 로그인할 때 자동으로 복사됩니다.</p>
        </div>
      )}

      {configured && !signedIn && (
        <div className="status-note">
          <h3>로그인 필요</h3>
          <p>같은 이메일 계정으로 PC와 폰에서 로그인하면 판례와 목차가 같은 저장소를 사용합니다.</p>
        </div>
      )}

      {readyForDevices && (
        <div className="status-note">
          <h3>동기화 확인</h3>
          <p>PC에서 수정한 내용은 계정 저장소로 올라가고, 폰 화면은 앱이 열려 있거나 다시 켜질 때 최신 내용을 내려받습니다.</p>
        </div>
      )}
    </section>
  );
}
