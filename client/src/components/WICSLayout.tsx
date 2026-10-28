import { useAuth } from "@/_core/hooks/useAuth";
import { redirectToLogin } from "@/lib/authRedirect";
import { canManageUsers } from "@/lib/userPermissions";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Activity,
  AlertTriangle,
  Battery,
  Camera,
  ChevronDown,
  Cpu,
  FileText,
  Home,
  LogOut,
  Map,
  Menu,
  Radar,
  Radio,
  Server,
  Settings,
  Shield,
  Users,
  Wifi,
  X,
} from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { useLocation } from "wouter";

interface WICSLayoutProps {
  children: ReactNode;
  currentPage?: string;
}

const navigationItems = [
  { id: "dashboard", label: "대시보드", icon: Home, href: "/" },
  { id: "robots", label: "로봇 관리", icon: Radio, href: "/robots" },
  { id: "monitoring", label: "실시간 모니터링", icon: Activity, href: "/monitoring" },
  { id: "control", label: "미션 관리", icon: Shield, href: "/control" },
  { id: "maps", label: "지도 관리", icon: Map, href: "/maps" },
  { id: "detections", label: "탐지 결과", icon: Radar, href: "/detections" },
  { id: "reports", label: "보고서", icon: FileText, href: "/reports" },
  { id: "users", label: "사용자 관리", icon: Users, href: "/users" },
];

function RealTimeClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const dateStr = now.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\. /g, "-").replace(".", "");
  const timeStr = now.toLocaleTimeString("ko-KR", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <div style={{ textAlign: "right", lineHeight: 1.2 }}>
      <div style={{ fontSize: "10px", color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace" }}>{dateStr}</div>
      <div style={{ fontSize: "13px", fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: "var(--foreground)" }}>{timeStr}</div>
    </div>
  );
}

function StatusDot({ active, label }: { active: boolean; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <span style={{
        width: "6px", height: "6px", borderRadius: "50%",
        backgroundColor: active ? "#22c55e" : "#ef4444",
        boxShadow: active ? "0 0 4px #22c55e" : "0 0 4px #ef4444",
      }} />
      <span style={{ fontSize: "10px", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}

export default function WICSLayout({ children, currentPage }: WICSLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [, setLocation] = useLocation();
  const { user, loading, logout } = useAuth({ redirectOnUnauthenticated: true });

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      // Replace the current history entry so the browser Back button cannot
      // return to the protected dashboard after logout.
      redirectToLogin("/auth");
    }
  };

  const handleNavigate = (href: string) => {
    setLocation(href);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground" style={{ display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <Radar className="w-8 h-8" style={{ color: "#3b82f6", margin: "0 auto 12px" }} />
          <p style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>인증 상태 확인 중...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background text-foreground" style={{ display: "grid", placeItems: "center", padding: "24px" }}>
        <div style={{ width: "min(360px, 100%)", border: "1px solid var(--border)", backgroundColor: "var(--card)", padding: "24px", textAlign: "center" }}>
          <Radar className="w-8 h-8" style={{ color: "#3b82f6", margin: "0 auto 12px" }} />
          <h1 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>로그인이 필요합니다</h1>
          <p style={{ fontSize: "12px", color: "var(--muted-foreground)", lineHeight: 1.6, marginBottom: "16px" }}>
            세션이 종료되었습니다. 로그인 화면으로 이동합니다.
          </p>
          <Button onClick={() => redirectToLogin("/auth")} style={{ width: "100%" }}>
            로그인 화면으로 이동
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }} className="bg-background text-foreground">
      {/* Sidebar */}
      <aside
        style={{
          width: sidebarOpen ? "220px" : "56px",
          transition: "width 0.2s cubic-bezier(0.23, 1, 0.32, 1)",
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid var(--border)",
          backgroundColor: "var(--card)",
          flexShrink: 0,
        }}
      >
        {/* Logo/Header */}
        <div
          style={{
            height: "48px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: sidebarOpen ? "space-between" : "center",
            padding: "0 12px",
          }}
        >
          {sidebarOpen && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Radar className="w-4 h-4" style={{ color: "#3b82f6" }} />
              <span style={{ fontWeight: 700, fontSize: "13px", letterSpacing: "0.05em" }}>WICS</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="h-6 w-6 p-0"
          >
            {sidebarOpen ? <X className="w-3.5 h-3.5" /> : <Menu className="w-3.5 h-3.5" />}
          </Button>
        </div>

        {/* Mission Info Panel - always visible */}
        <div style={{ borderBottom: "1px solid var(--border)", padding: sidebarOpen ? "10px 12px" : "8px 6px", backgroundColor: "rgba(59, 130, 246, 0.04)" }}>
          {sidebarOpen ? (
            <>
              <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted-foreground)", marginBottom: "6px" }}>
                Active Mission
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>상태</span>
                  <span style={{ fontSize: "10px", fontWeight: 600, color: "#22c55e" }}>● 진행 중</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>ID</span>
                  <span style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace" }}>MSN-2026-0705</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>경과</span>
                  <span style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace" }}>01:42:18</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>진행률</span>
                  <span style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace" }}>67%</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>모드</span>
                  <span style={{ fontSize: "10px" }}>자율 탐색</span>
                </div>
                {/* Progress bar */}
                <div style={{ width: "100%", height: "2px", backgroundColor: "var(--border)", marginTop: "4px" }}>
                  <div style={{ width: "67%", height: "100%", backgroundColor: "#3b82f6" }} />
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
              <Shield style={{ width: "14px", height: "14px", color: "#22c55e" }} />
              <span style={{ fontSize: "8px", fontFamily: "'JetBrains Mono', monospace", color: "var(--muted-foreground)" }}>67%</span>
              <div style={{ width: "100%", height: "2px", backgroundColor: "var(--border)" }}>
                <div style={{ width: "67%", height: "100%", backgroundColor: "#3b82f6" }} />
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {navigationItems.filter(item => item.id !== "users" || canManageUsers(user.role)).map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.href)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: sidebarOpen ? "9px 16px" : "9px 0",
                  justifyContent: sidebarOpen ? "flex-start" : "center",
                  fontSize: "12px",
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "#fff" : "var(--muted-foreground)",
                  backgroundColor: isActive ? "#3b82f6" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  borderLeft: isActive ? "3px solid #3b82f6" : "3px solid transparent",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = "var(--muted)";
                    e.currentTarget.style.color = "var(--foreground)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "var(--muted-foreground)";
                  }
                }}
                title={item.label}
              >
                <Icon style={{ width: "16px", height: "16px", flexShrink: 0 }} />
                {sidebarOpen && <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* User Section */}
        <div style={{ borderTop: "1px solid var(--border)", padding: "10px 12px" }}>
          {sidebarOpen && user && (
            <div style={{ marginBottom: "6px", fontSize: "10px" }}>
              <p style={{ color: "var(--muted-foreground)" }}>로그인 사용자</p>
              <p style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name || user.email}</p>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="w-full"
            style={{ gap: "6px", height: "28px", fontSize: "11px" }}
          >
            <LogOut className="w-3 h-3" />
            {sidebarOpen && "로그아웃"}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Top Status Bar */}
        <header
          style={{
            height: "48px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            backgroundColor: "var(--card)",
            flexShrink: 0,
          }}
        >
          {/* Left: Branding */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h1 style={{ fontSize: "12px", fontWeight: 600, letterSpacing: "0.02em", color: "var(--muted-foreground)" }}>
              WICS - Web-based Integrated Control System
            </h1>
          </div>

          {/* Center: Status Indicators */}
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <StatusDot active={true} label="서버" />
            <StatusDot active={true} label="로봇" />
            <StatusDot active={true} label="카메라" />
            <StatusDot active={true} label="AI" />
            <StatusDot active={true} label="네트워크" />
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <Battery style={{ width: "12px", height: "12px", color: "#22c55e" }} />
              <span style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace" }}>85%</span>
            </div>
          </div>

          {/* Right: Critical Alert + Clock + User */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            {/* Critical Alert */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 10px",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                cursor: "pointer",
              }}
            >
              <AlertTriangle style={{ width: "12px", height: "12px", color: "#ef4444" }} />
              <span style={{ fontSize: "10px", fontWeight: 600, color: "#ef4444" }}>Critical Alerts (2)</span>
            </div>

            <Separator orientation="vertical" className="h-5" />

            {/* Real-time Clock */}
            <RealTimeClock />

            <Separator orientation="vertical" className="h-5" />

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7" style={{ gap: "4px", padding: "0 8px" }}>
                  <Settings className="w-3 h-3" />
                  <span style={{ fontSize: "11px" }}>{user?.name || "사용자"}</span>
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem disabled>
                  <span className="text-xs text-muted-foreground">{user?.email}</span>
                </DropdownMenuItem>
                <Separator className="my-1" />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="w-4 h-4 mr-2" />
                  로그아웃
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content Area */}
        <main style={{ flex: 1, overflow: "auto", padding: "20px" }} className="bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
