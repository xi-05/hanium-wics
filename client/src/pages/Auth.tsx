import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getLoginUrl } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { isValidEmail, PASSWORD_RULE_MESSAGE, validatePassword } from "@shared/emailAuth";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ArrowRight, CheckCircle2, KeyRound, LockKeyhole, Mail, Radar, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type AuthMode = "login" | "signup";

export default function Auth() {
  const [, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!authLoading && user) setLocation("/");
  }, [authLoading, setLocation, user]);

  const finishAuthentication = async (message: string) => {
    await utils.auth.me.invalidate();
    toast.success(message);
    setLocation("/");
  };

  const login = trpc.auth.login.useMutation({
    onSuccess: () => void finishAuthentication("로그인되었습니다."),
    onError: error => setFormError(error.message),
  });

  const signup = trpc.auth.signup.useMutation({
    onSuccess: () => void finishAuthentication("회원가입이 완료되었습니다."),
    onError: error => setFormError(error.message),
  });

  const isPending = login.isPending || signup.isPending;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    const normalizedEmail = email.trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      setFormError("올바른 이메일 주소를 입력해 주세요.");
      return;
    }
    if (mode === "signup") {
      if (!name.trim()) {
        setFormError("이름을 입력해 주세요.");
        return;
      }
      const passwordError = validatePassword(password);
      if (passwordError) {
        setFormError(passwordError);
        return;
      }
      signup.mutate({ name: name.trim(), email: normalizedEmail, password });
      return;
    }
    if (!password) {
      setFormError("비밀번호를 입력해 주세요.");
      return;
    }
    login.mutate({ email: normalizedEmail, password });
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setFormError("");
    setPassword("");
  };

  const handleOAuthLogin = () => {
    try {
      window.location.href = getLoginUrl();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "OAuth 설정을 확인해 주세요.");
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground" style={{ position: "relative", overflow: "hidden" }}>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, opacity: 0.3, backgroundImage: "linear-gradient(rgba(59,130,246,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,.08) 1px, transparent 1px)", backgroundSize: "48px 48px", maskImage: "linear-gradient(to bottom, black, transparent 72%)" }} />
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(360px,520px)]" style={{ position: "relative", minHeight: "100vh", alignItems: "center", gap: "clamp(2rem, 7vw, 8rem)", maxWidth: "1180px", margin: "0 auto", padding: "clamp(1.5rem, 5vw, 4rem)" }}>
        <section className="hidden md:block" style={{ maxWidth: "540px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "2rem" }}>
            <div style={{ display: "grid", placeItems: "center", width: "42px", height: "42px", border: "1px solid rgba(59,130,246,.6)", background: "rgba(59,130,246,.08)", color: "#60a5fa" }}>
              <Radar size={22} />
            </div>
            <div>
              <div style={{ fontSize: "18px", fontWeight: 800, letterSpacing: ".08em" }}>WICS</div>
              <div style={{ fontSize: "10px", color: "var(--muted-foreground)", letterSpacing: ".12em" }}>MISSION CONTROL / AUTHENTICATION</div>
            </div>
          </div>
          <p style={{ color: "#60a5fa", fontSize: "11px", letterSpacing: ".18em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace", marginBottom: "1rem" }}>Secure Operations Interface</p>
          <h1 style={{ fontSize: "clamp(2rem, 4vw, 3.6rem)", lineHeight: 1.06, letterSpacing: "-.04em", fontWeight: 800, margin: 0 }}>재난 대응 로봇을<br /><span style={{ color: "#60a5fa" }}>통합 제어</span>합니다.</h1>
          <p style={{ marginTop: "1.5rem", color: "var(--muted-foreground)", lineHeight: 1.8, fontSize: "14px", maxWidth: "460px" }}>실시간 로봇 상태, 미션 진행률, SLAM 지도와 AI 탐지 결과를 하나의 관제 화면에서 안전하게 관리하세요.</p>
          <div style={{ display: "flex", gap: "24px", marginTop: "2.5rem", color: "var(--muted-foreground)", fontSize: "11px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><ShieldCheck size={14} color="#4ade80" /> RBAC 보호</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><LockKeyhole size={14} color="#60a5fa" /> 암호화 세션</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><CheckCircle2 size={14} color="#4ade80" /> 실시간 관제</span>
          </div>
        </section>

        <Card className="border-border bg-card" style={{ borderRadius: 0, boxShadow: "0 24px 80px rgba(0,0,0,.35)" }}>
          <CardHeader style={{ paddingBottom: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#60a5fa", fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".12em" }}><KeyRound size={14} /> ACCESS CONTROL</div>
            <CardTitle style={{ fontSize: "1.45rem", marginTop: "1rem" }}>{mode === "login" ? "WICS에 로그인" : "계정 생성"}</CardTitle>
            <CardDescription>{mode === "login" ? "등록한 이메일로 관제 시스템에 접속하세요." : "이메일 계정은 기본 읽기전용으로 생성됩니다."}</CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", padding: "4px", background: "var(--muted)", marginBottom: "1.5rem" }}>
              <button type="button" onClick={() => switchMode("login")} style={{ border: 0, padding: "9px 8px", background: mode === "login" ? "var(--card)" : "transparent", color: mode === "login" ? "var(--foreground)" : "var(--muted-foreground)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>로그인</button>
              <button type="button" onClick={() => switchMode("signup")} style={{ border: 0, padding: "9px 8px", background: mode === "signup" ? "var(--card)" : "transparent", color: mode === "signup" ? "var(--foreground)" : "var(--muted-foreground)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>회원가입</button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem" }}>
              {mode === "signup" && <div><Label htmlFor="auth-name">이름</Label><div style={{ position: "relative", marginTop: "6px" }}><Input id="auth-name" value={name} onChange={event => setName(event.target.value)} placeholder="관제 담당자" autoComplete="name" /></div></div>}
              <div><Label htmlFor="auth-email">이메일</Label><div style={{ position: "relative", marginTop: "6px" }}><Mail size={15} style={{ position: "absolute", left: "11px", top: "11px", color: "var(--muted-foreground)", zIndex: 1 }} /><Input id="auth-email" value={email} onChange={event => setEmail(event.target.value)} placeholder="operator@example.com" type="email" autoComplete="email" style={{ paddingLeft: "34px" }} /></div></div>
              <div><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><Label htmlFor="auth-password">비밀번호</Label>{mode === "signup" && <span style={{ color: "var(--muted-foreground)", fontSize: "10px" }}>최소 8자</span>}</div><div style={{ position: "relative", marginTop: "6px" }}><LockKeyhole size={15} style={{ position: "absolute", left: "11px", top: "11px", color: "var(--muted-foreground)", zIndex: 1 }} /><Input id="auth-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="••••••••" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} style={{ paddingLeft: "34px" }} /></div></div>
              {mode === "signup" && <p style={{ margin: "-4px 0 0", color: "var(--muted-foreground)", fontSize: "10px", lineHeight: 1.6 }}>{PASSWORD_RULE_MESSAGE}</p>}
              {formError && <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: "8px", padding: "10px", border: "1px solid rgba(239,68,68,.35)", background: "rgba(239,68,68,.08)", color: "#fca5a5", fontSize: "11px", lineHeight: 1.5 }}><AlertTriangle size={14} style={{ flexShrink: 0, marginTop: "1px" }} />{formError}</div>}
              <Button type="submit" disabled={isPending} style={{ width: "100%", height: "40px", borderRadius: 0, marginTop: "2px" }}>{isPending ? "처리 중..." : mode === "login" ? "로그인" : "회원가입"}<ArrowRight size={15} /></Button>
            </form>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "1.35rem 0", color: "var(--muted-foreground)", fontSize: "10px" }}><span style={{ height: "1px", flex: 1, background: "var(--border)" }} />또는 Manus OAuth<span style={{ height: "1px", flex: 1, background: "var(--border)" }} /></div>
            <Button type="button" variant="outline" onClick={handleOAuthLogin} style={{ width: "100%", borderRadius: 0, fontSize: "12px" }}>Google · Microsoft · Apple로 계속하기</Button>
            <p style={{ marginTop: "1rem", color: "var(--muted-foreground)", fontSize: "10px", lineHeight: 1.6, textAlign: "center" }}>이메일로 가입한 계정은 관리자 승인 후 제어 권한이 부여됩니다.</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
