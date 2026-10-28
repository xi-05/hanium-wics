import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { redirectToLogin } from "@/lib/authRedirect";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Robots from "./pages/Robots";
import Monitoring from "./pages/Monitoring";
import Maps from "./pages/Maps";
import Detections from "./pages/Detections";
import Reports from "./pages/Reports";
import Users from "./pages/Users";
import RobotControl from "@/pages/RobotControl";
import Auth from "@/pages/Auth";
import { Radar } from "lucide-react";
import { ReactNode } from "react";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/robots"} component={Robots} />
      <Route path={"/monitoring"} component={Monitoring} />
      <Route path={"/maps"} component={Maps} />
      <Route path={"/detections"} component={Detections} />
      <Route path={"/reports"} component={Reports} />
      <Route path={"/users"} component={Users} />
      <Route path={"/control"} component={RobotControl} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground" style={{ display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <Radar className="w-8 h-8" style={{ color: "#3b82f6", margin: "0 auto 12px" }} />
          <p style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>로그인 상태 확인 중...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background text-foreground" style={{ display: "grid", placeItems: "center", padding: "24px" }}>
        <div style={{ width: "min(360px, 100%)", border: "1px solid var(--border)", backgroundColor: "var(--card)", padding: "24px", textAlign: "center" }}>
          <Radar className="w-8 h-8" style={{ color: "#3b82f6", margin: "0 auto 12px" }} />
          <h1 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>WICS 로그인</h1>
          <p style={{ fontSize: "12px", color: "var(--muted-foreground)", lineHeight: 1.6, marginBottom: "16px" }}>
            인증되지 않은 상태입니다. 로그인 화면으로 이동합니다.
          </p>
          <Button onClick={() => redirectToLogin("/auth")} style={{ width: "100%" }}>
            로그인 화면으로 이동
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Switch>
            <Route path="/auth" component={Auth} />
            <Route>
              <AuthGate>
                <Router />
              </AuthGate>
            </Route>
          </Switch>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
