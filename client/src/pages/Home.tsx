import WICSLayout from "@/components/WICSLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Battery, Camera, Crosshair, Map, Radio, Shield, Wifi } from "lucide-react";

function numberValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function statusColor(status: string) {
  if (status === "online" || status === "active") return "#22c55e";
  if (status === "error") return "#ef4444";
  if (status === "idle") return "#eab308";
  return "#6b7280";
}

function detectionColor(className: string) {
  if (className === "Person") return "#ef4444";
  if (className === "Fire") return "#f97316";
  if (className === "Debris") return "#eab308";
  if (className === "Crack") return "#a855f7";
  return "#6b7280";
}

export default function Home() {
  const overviewQuery = trpc.dashboard.overview.useQuery(undefined, { refetchInterval: 5000 });
  const overview = overviewQuery.data;
  const robots = overview?.robots ?? [];
  const selectedRobot = robots.find(robot => robot.status === "online" || robot.status === "active") ?? robots[0];
  const onlineCount = robots.filter(robot => robot.status === "online" || robot.status === "active").length;
  const sensorTotal = overview?.sensorHealth.total ?? 0;
  const sensorHealthy = overview?.sensorHealth.healthy ?? 0;

  return (
    <WICSLayout currentPage="dashboard">
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-2xl font-bold">통합 관제 대시보드</h2><p className="text-muted-foreground mt-1 text-sm">로봇 텔레메트리·센서·미션 데이터를 실시간 DB 기준으로 표시합니다.</p></div>
          <div className="text-muted-foreground flex items-center gap-2 font-mono text-[10px]"><span className={overviewQuery.isFetching ? "animate-pulse text-yellow-400" : "text-green-400"}>●</span>{overviewQuery.isFetching ? "SYNCING" : "DB SYNCED"} · 5s POLL</div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="border-border bg-card"><CardHeader className="border-border flex-row items-center justify-between border-b p-3"><CardTitle className="flex items-center gap-2 text-xs"><Camera className="h-4 w-4 text-blue-400" />LIVE CAMERA — {selectedRobot?.name ?? "NO ROBOT"}</CardTitle><span style={{ color: selectedRobot ? statusColor(selectedRobot.status) : "#6b7280" }}>●</span></CardHeader><CardContent className="p-0"><div className="relative flex h-[200px] items-center justify-center overflow-hidden bg-[#0a0f1a]"><div className="absolute inset-0 opacity-10" style={{ backgroundImage: "linear-gradient(rgba(59,130,246,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,.4) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />{selectedRobot ? <div className="z-10 text-center"><Camera className="mx-auto mb-2 h-8 w-8 text-blue-400 opacity-60" /><p className="text-[11px] text-slate-400">카메라 텔레메트리 연결 대기</p><p className="mt-1 font-mono text-[10px] text-slate-600">센서 상태는 robotsSensors 테이블 기준</p></div> : <div className="z-10 text-center"><Camera className="mx-auto mb-2 h-8 w-8 text-slate-600" /><p className="text-[11px] text-slate-500">등록된 로봇이 없습니다.</p></div>}<span className="absolute top-2 left-2 font-mono text-[9px] text-blue-400">DB TELEMETRY</span><span className="absolute right-2 bottom-2 font-mono text-[9px] text-slate-500">LATENCY —</span></div></CardContent></Card>

          <Card className="border-border bg-card"><CardHeader className="border-border border-b p-3"><CardTitle className="flex items-center gap-2 text-xs"><Map className="h-4 w-4 text-blue-400" />SLAM MAP — LIVE POSITIONS</CardTitle></CardHeader><CardContent className="p-0"><div className="relative h-[200px] overflow-hidden bg-[#0a0f1a]"><div className="absolute inset-0 opacity-15" style={{ backgroundImage: "linear-gradient(rgba(59,130,246,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,.5) 1px, transparent 1px)", backgroundSize: "20px 20px" }} />{robots.filter(robot => (robot.status === "online" || robot.status === "active") && robot.latitude !== null && robot.longitude !== null).map(robot => { const lat = numberValue(robot.latitude) ?? 0; const lon = numberValue(robot.longitude) ?? 0; return <div key={robot.id} className="absolute" style={{ left: `${Math.min(94, Math.max(6, ((lon + 180) / 360) * 100))}%`, top: `${Math.min(90, Math.max(10, ((90 - lat) / 180) * 100))}%`, transform: "translate(-50%, -50%)" }}><div className="h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_8px_#3b82f6]" /><span className="absolute top-3 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[8px] text-blue-300">{robot.name}</span></div>})}<div className="absolute bottom-2 left-2 font-mono text-[9px] text-slate-500">{robots.filter(robot => robot.latitude !== null && robot.longitude !== null).length} POSITIONS FROM DB</div></div></CardContent></Card>

          <Card className="border-border bg-card"><CardHeader className="border-border flex-row items-center justify-between border-b p-3"><CardTitle className="flex items-center gap-2 text-xs"><Crosshair className="h-4 w-4 text-blue-400" />YOLO DETECTION — DB</CardTitle><span className="font-mono text-[9px] text-green-400">{overview?.missions.detections ?? 0} detections</span></CardHeader><CardContent className="flex h-[200px] items-center justify-center"><div className="text-center"><Crosshair className="mx-auto mb-2 h-9 w-9 text-slate-600" /><p className="text-[11px] text-slate-400">최근 탐지 {overview?.detections.length ?? 0}건</p><p className="mt-1 font-mono text-[10px] text-slate-600">실제 detections 테이블 집계</p></div></CardContent></Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="border-border bg-card"><CardHeader className="border-border border-b p-3"><CardTitle className="flex items-center gap-2 text-xs"><Radio className="h-4 w-4 text-blue-400" />ROBOT STATUS <span className="text-muted-foreground ml-auto font-normal">{onlineCount}/{robots.length} online</span></CardTitle></CardHeader><CardContent className="p-3">{robots.length === 0 ? <EmptyState text="등록된 로봇이 없습니다." /> : <div className="flex flex-col gap-2">{robots.map(robot => { const battery = numberValue(robot.battery); return <div key={robot.id} className="border-border flex items-center justify-between border-b py-1.5"><div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor(robot.status) }} /><span className="text-[11px] font-medium">{robot.name}</span></div><div className="flex items-center gap-3"><span className="flex items-center gap-1 font-mono text-[10px]" style={{ color: battery === null ? "#6b7280" : battery >= 70 ? "#22c55e" : battery >= 40 ? "#eab308" : "#ef4444" }}><Battery className="h-3 w-3" />{battery === null ? "—" : `${battery.toFixed(0)}%`}</span><span className="text-muted-foreground max-w-[90px] truncate text-[10px]">{robot.status}</span></div></div>})}</div>}</CardContent></Card>

          <Card className="border-border bg-card"><CardHeader className="border-border border-b p-3"><CardTitle className="flex items-center gap-2 text-xs"><Shield className="h-4 w-4 text-blue-400" />MISSION STATUS</CardTitle></CardHeader><CardContent className="p-3"><div className="grid grid-cols-2 gap-3"><Metric label="활성 미션" value={overview?.missions.active ?? 0} color="#22c55e" /><Metric label="완료" value={overview?.missions.completed ?? 0} /><Metric label="이동 거리" value={`${((overview?.missions.distance ?? 0) / 1000).toFixed(2)} km`} /><Metric label="탐지 건수" value={overview?.missions.detections ?? 0} /></div><div className="border-border mt-3 border p-2"><div className="mb-1 flex items-center justify-between text-[9px] text-slate-400"><span>SENSOR HEALTH</span><span className="font-mono">{sensorHealthy}/{sensorTotal || 0}</span></div><div className="h-1 bg-slate-800"><div className="h-full bg-green-500" style={{ width: `${sensorTotal ? (sensorHealthy / sensorTotal) * 100 : 0}%` }} /></div></div></CardContent></Card>

          <Card className="border-border bg-card" style={{ borderColor: overview?.alerts.length ? "rgba(239,68,68,.3)" : undefined }}><CardHeader className="border-border border-b p-3"><CardTitle className="flex items-center gap-2 text-xs" style={{ color: overview?.alerts.length ? "#ef4444" : undefined }}><AlertTriangle className="h-4 w-4" />CRITICAL ALERTS ({overview?.alerts.length ?? 0})</CardTitle></CardHeader><CardContent className="p-3">{overview?.alerts.length ? <div className="flex flex-col gap-2">{overview.alerts.slice(0, 4).map(alert => <div key={alert.id} className="border border-red-500/20 bg-red-500/[.03] p-2"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-red-500" /><div><p className="text-[11px]">{alert.message}</p><p className="text-muted-foreground mt-0.5 font-mono text-[9px]">{alert.time}</p></div></div></div>)}</div> : <EmptyState text="현재 활성 경보가 없습니다." />}</CardContent></Card>
        </div>

        <Card className="border-border bg-card"><CardHeader className="border-border border-b p-3"><CardTitle className="flex items-center gap-2 text-xs"><Crosshair className="h-4 w-4 text-blue-400" />DETECTION HISTORY <span className="text-muted-foreground ml-auto font-normal">최근 DB 5건</span></CardTitle></CardHeader><CardContent className="p-0">{overview?.detections.length ? <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-border text-muted-foreground border-b bg-blue-500/[.03]"><th className="p-2 px-4 text-left text-[10px] font-medium">클래스</th><th className="p-2 px-4 text-left text-[10px] font-medium">신뢰도</th><th className="p-2 px-4 text-left text-[10px] font-medium">로봇</th><th className="p-2 px-4 text-left text-[10px] font-medium">시각</th><th className="p-2 px-4 text-left text-[10px] font-medium">위치</th></tr></thead><tbody>{overview.detections.map(det => <tr key={det.id} className="border-border hover:bg-muted/30 border-b"><td className="p-2 px-4"><span className="flex items-center gap-2"><span className="h-1 w-1 rounded-full" style={{ backgroundColor: detectionColor(det.className) }} />{det.className}</span></td><td className="p-2 px-4 font-mono">{(Number(det.confidence) * 100).toFixed(0)}%</td><td className="p-2 px-4">{det.robotName}</td><td className="text-muted-foreground p-2 px-4 font-mono">{new Date(det.detectedAt).toLocaleTimeString("ko-KR")}</td><td className="text-muted-foreground p-2 px-4 font-mono">{det.latitude ?? "—"}, {det.longitude ?? "—"}</td></tr>)}</tbody></table></div> : <EmptyState text="탐지 이력이 없습니다." />}</CardContent></Card>
      </div>
    </WICSLayout>
  );
}

function Metric({ label, value, color }: { label: string; value: string | number; color?: string }) { return <div className="border-border border p-2"><p className="text-muted-foreground text-[9px] uppercase">{label}</p><p className="mt-1 font-mono text-lg font-bold" style={{ color }}>{value}</p></div>; }
function EmptyState({ text }: { text: string }) { return <div className="text-muted-foreground flex min-h-[70px] items-center justify-center text-[11px]">{text}</div>; }
