import { FormEvent, useState } from "react";
import { supabase } from "../lib/supabase";

export function AuthView() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("처리 중입니다.");
    const result =
      mode === "login"
        ? await supabase!.auth.signInWithPassword({ email, password })
        : await supabase!.auth.signUp({ email, password });
    setMessage(result.error ? result.error.message : mode === "login" ? "로그인되었습니다." : "가입 메일을 확인해주세요.");
  }

  return (
    <main className="auth-screen">
      <form className="auth-box" onSubmit={submit}>
        <h1>판례 정리함</h1>
        <label>
          이메일
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" />
        </label>
        <label>
          비밀번호
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" />
        </label>
        <button type="submit">{mode === "login" ? "로그인" : "회원가입"}</button>
        <button className="text-button" type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "계정 만들기" : "로그인으로 돌아가기"}
        </button>
        <p>{message}</p>
      </form>
    </main>
  );
}
