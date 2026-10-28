import WICSLayout from "@/components/WICSLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Battery, CheckCircle2, Cpu, Edit3, MapPin, Plus, Radio, RefreshCw, Save, Server, Trash2, Wifi, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type RobotStatus = "online" | "offline" | "idle" | "active" | "error";

type Robot = {
  id: number;
  name: string;
  serialNumber: string | null;
  status: RobotStatus;
  battery: string | number | null;
  latitude: string | number | null;
  longitude: string | number | null;
  heading: string | number | null;
  speed: string | number | null;
  angularVelocity: string | number | null;
  currentMissionId: number | null;
  lastConnectedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type RobotForm = {
  name: string;
  serialNumber: string;
  status: RobotStatus;
  battery: string;
  latitude: string;
  longitude: string;
  heading: string;
  speed: string;
};

const emptyForm: RobotForm = {
  name: "",
  serialNumber: "",
  status: "offline",
  battery: "",
  latitude: "",
  longitude: "",
  heading: "",
  speed: "",
};

const statusLabels: Record<RobotStatus, string> = {
  online: "온라인",
  offline: "오프라인",
  idle: "대기",
  active: "활성",
  error: "오류",
};

const statusColors: Record<RobotStatus, string> = {
  online: "#4ade80",
  offline: "#6b7280",
  idle: "#facc15",
  active: "#60a5fa",
  error: "#f87171",
};

function numberValue(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function displayNumber(value: string | number | null | undefined, digits = 1) {
  const parsed = numberValue(value);
  return parsed === undefined ? "—" : parsed.toFixed(digits);
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "medium" });
}

function formFromRobot(robot: Robot): RobotForm {
  return {
    name: robot.name,
    serialNumber: robot.serialNumber ?? "",
    status: robot.status,
    battery: robot.battery === null ? "" : String(robot.battery),
    latitude: robot.latitude === null ? "" : String(robot.latitude),
    longitude: robot.longitude === null ? "" : String(robot.longitude),
    heading: robot.heading === null ? "" : String(robot.heading),
    speed: robot.speed === null ? "" : String(robot.speed),
  };
}

function formToInput(form: RobotForm) {
  return {
    name: form.name.trim(),
    serialNumber: form.serialNumber.trim() || undefined,
    status: form.status,
    battery: numberValue(form.battery),
    latitude: numberValue(form.latitude),
    longitude: numberValue(form.longitude),
    heading: numberValue(form.heading),
    speed: numberValue(form.speed),
  };
}

export default function Robots() {
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "operator";
  const utils = trpc.useUtils();
  const robotsQuery = trpc.robots.list.useQuery(undefined, { refetchInterval: 5000 });
  const robots = (robotsQuery.data ?? []) as Robot[];
  const [selectedRobot, setSelectedRobot] = useState<Robot | null>(null);
  const sensorsQuery = trpc.robots.getSensors.useQuery({ robotId: selectedRobot?.id ?? 0 }, { enabled: Boolean(selectedRobot), refetchInterval: 5000 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRobot, setEditingRobot] = useState<Robot | null>(null);
  const [form, setForm] = useState<RobotForm>(emptyForm);

  useEffect(() => {
    if (selectedRobot) {
      const fresh = robots.find(robot => robot.id === selectedRobot.id);
      setSelectedRobot(fresh ?? null);
    }
  }, [robots]);

  const createRobot = trpc.robots.create.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.robots.list.invalidate(), utils.robots.getStatus.invalidate()]);
      toast.success("로봇이 등록되었습니다.");
      setDialogOpen(false);
    },
    onError: error => toast.error(error.message),
  });

  const updateRobot = trpc.robots.update.useMutation({
    onSuccess: async result => {
      await Promise.all([utils.robots.list.invalidate(), utils.robots.getStatus.invalidate()]);
      if (result.robot) setSelectedRobot(result.robot as Robot);
      toast.success("로봇 정보가 수정되었습니다.");
      setDialogOpen(false);
    },
    onError: error => toast.error(error.message),
  });

  const deleteRobot = trpc.robots.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.robots.list.invalidate(), utils.robots.getStatus.invalidate()]);
      setSelectedRobot(null);
      toast.success("로봇이 삭제되었습니다.");
    },
    onError: error => toast.error(error.message),
  });

  const isSaving = createRobot.isPending || updateRobot.isPending;
  const onlineCount = useMemo(() => robots.filter(robot => robot.status === "online" || robot.status === "active").length, [robots]);

  const openCreate = () => {
    setEditingRobot(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (robot: Robot) => {
    setEditingRobot(robot);
    setForm(formFromRobot(robot));
    setDialogOpen(true);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = formToInput(form);
    if (!input.name) {
      toast.error("로봇명을 입력해 주세요.");
      return;
    }
    if (editingRobot) {
      updateRobot.mutate({ id: editingRobot.id, ...input, serialNumber: input.serialNumber ?? null, battery: input.battery ?? null, latitude: input.latitude ?? null, longitude: input.longitude ?? null, heading: input.heading ?? null, speed: input.speed ?? null });
    } else {
      createRobot.mutate(input);
    }
  };

  const handleDelete = (robot: Robot) => {
    if (!window.confirm(`'${robot.name}' 로봇을 삭제하시겠습니까?`)) return;
    deleteRobot.mutate({ id: robot.id });
  };

  return (
    <WICSLayout currentPage="robots">
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><Server className="h-5 w-5 text-blue-400" /><h2 className="text-2xl font-bold">로봇 관리</h2></div>
            <p className="text-muted-foreground mt-1 text-sm">실제 데이터베이스에 등록된 로봇을 관리합니다. 더미 데이터는 사용하지 않습니다.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void robotsQuery.refetch()} disabled={robotsQuery.isFetching}><RefreshCw className={`h-4 w-4 ${robotsQuery.isFetching ? "animate-spin" : ""}`} />새로고침</Button>
            {canManage && <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4" />로봇 등록</Button>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Card className="border-border bg-card"><CardContent className="p-4"><div className="text-muted-foreground text-xs uppercase tracking-wider">등록 로봇</div><div className="mt-2 text-2xl font-bold">{robots.length}</div></CardContent></Card>
          <Card className="border-border bg-card"><CardContent className="p-4"><div className="text-muted-foreground text-xs uppercase tracking-wider">연결 상태</div><div className="mt-2 text-2xl font-bold text-green-400">{onlineCount}<span className="text-muted-foreground ml-2 text-sm font-normal">online / active</span></div></CardContent></Card>
          <Card className="border-border bg-card"><CardContent className="p-4"><div className="text-muted-foreground text-xs uppercase tracking-wider">관리 권한</div><div className="mt-2 text-sm font-semibold">{canManage ? "등록·수정·삭제 가능" : "읽기 전용"}</div></CardContent></Card>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: selectedRobot ? "minmax(0, 1.2fr) minmax(320px, .8fr)" : "1fr", gap: "1.25rem" }}>
          <Card className="border-border bg-card">
            <CardHeader className="border-border border-b"><CardTitle className="text-lg">로봇 목록 <span className="text-muted-foreground text-sm font-normal">({robots.length})</span></CardTitle></CardHeader>
            <CardContent className="p-0">
              {robotsQuery.isLoading ? <div className="text-muted-foreground p-10 text-center text-sm">로봇 목록을 불러오는 중입니다...</div> : robots.length === 0 ? <div className="flex flex-col items-center gap-3 p-12 text-center"><Radio className="text-muted-foreground h-10 w-10" /><div><p className="font-semibold">등록된 로봇이 없습니다.</p><p className="text-muted-foreground mt-1 text-sm">실제 운영 로봇을 등록하면 이 목록에 표시됩니다.</p></div>{canManage && <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4" />첫 로봇 등록</Button>}</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-border text-muted-foreground border-b"><th className="p-3 text-left font-medium">로봇명</th><th className="p-3 text-left font-medium">상태</th><th className="p-3 text-left font-medium">배터리</th><th className="p-3 text-left font-medium">시리얼</th><th className="p-3 text-left font-medium">위치</th></tr></thead><tbody>{robots.map(robot => <tr key={robot.id} className={`border-border hover:bg-muted/40 cursor-pointer border-b transition-colors ${selectedRobot?.id === robot.id ? "bg-blue-500/10" : ""}`} onClick={() => setSelectedRobot(robot)}><td className="p-3 font-medium"><div className="flex items-center gap-2"><Radio className="h-4 w-4" style={{ color: statusColors[robot.status] }} />{robot.name}</div></td><td className="p-3"><Badge variant="outline" style={{ borderColor: statusColors[robot.status], color: statusColors[robot.status] }}>{statusLabels[robot.status]}</Badge></td><td className="p-3"><div className="flex items-center gap-1" style={{ color: statusColors[robot.status] === "#f87171" ? "#f87171" : "var(--foreground)" }}><Battery className="h-4 w-4" />{displayNumber(robot.battery, 0)}{robot.battery !== null && "%"}</div></td><td className="text-muted-foreground p-3 font-mono text-xs">{robot.serialNumber ?? "—"}</td><td className="text-muted-foreground p-3 font-mono text-xs">{displayNumber(robot.latitude)}, {displayNumber(robot.longitude)}</td></tr>)}</tbody></table></div>}
            </CardContent>
          </Card>

          {selectedRobot && <Card className="border-border bg-card"><CardHeader className="border-border flex-row items-center justify-between border-b"><div><CardTitle className="text-lg">{selectedRobot.name}</CardTitle><p className="text-muted-foreground mt-1 font-mono text-xs">ID #{selectedRobot.id}{selectedRobot.serialNumber ? ` · ${selectedRobot.serialNumber}` : ""}</p></div><Badge variant="outline" style={{ borderColor: statusColors[selectedRobot.status], color: statusColors[selectedRobot.status] }}>{statusLabels[selectedRobot.status]}</Badge></CardHeader><CardContent className="space-y-4 p-4"><div className="grid grid-cols-2 gap-2">{[["배터리", selectedRobot.battery === null ? "—" : `${displayNumber(selectedRobot.battery, 0)}%`], ["속도", `${displayNumber(selectedRobot.speed, 2)} m/s`], ["위도", displayNumber(selectedRobot.latitude, 5)], ["경도", displayNumber(selectedRobot.longitude, 5)], ["방향", `${displayNumber(selectedRobot.heading, 1)}°`], ["마지막 접속", formatDate(selectedRobot.lastConnectedAt)]].map(([label, value]) => <div key={label} className="border-border rounded-[2px] border p-3"><div className="text-muted-foreground text-[10px] uppercase">{label}</div><div className="mt-1 font-mono text-sm">{value}</div></div>)}</div><div className="border-border rounded-[2px] border p-3"><div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs"><Cpu className="h-4 w-4" />센서 상태 · DB telemetry</div>{sensorsQuery.isLoading ? <div className="text-muted-foreground text-xs">센서 상태를 불러오는 중입니다...</div> : sensorsQuery.data ? <div className="grid grid-cols-2 gap-2">{[["카메라", sensorsQuery.data.cameraStatus], ["라이다", sensorsQuery.data.lidarStatus], ["IMU", sensorsQuery.data.imuStatus], ["AI 모듈", sensorsQuery.data.aiModuleStatus], ["연결", sensorsQuery.data.connectionStatus]].map(([label, status]) => <div key={label} className="border-border flex items-center justify-between border p-2"><span className="text-xs">{label}</span><span className="flex items-center gap-1 font-mono text-[10px]" style={{ color: status === "ok" ? "#4ade80" : status === "warning" ? "#facc15" : status === "error" ? "#f87171" : "#6b7280" }}><span>●</span>{status ?? "offline"}</span></div>)}</div> : <div className="text-muted-foreground text-xs">수신된 센서 텔레메트리가 없습니다.</div>}</div>{canManage ? <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => openEdit(selectedRobot)}><Edit3 className="h-4 w-4" />수정</Button><Button variant="destructive" size="icon" onClick={() => handleDelete(selectedRobot)} disabled={deleteRobot.isPending}><Trash2 className="h-4 w-4" /></Button></div> : <div className="text-muted-foreground border-border rounded-[2px] border p-3 text-center text-xs">읽기 전용 계정입니다. 로봇 등록·수정·삭제는 관리자(Admin) 또는 운영자(Operator)에게 문의하세요.</div>}</CardContent></Card>}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{editingRobot ? "로봇 정보 수정" : "로봇 등록"}</DialogTitle><DialogDescription>실제 데이터베이스에 저장할 로봇 식별 정보와 초기 상태를 입력합니다.</DialogDescription></DialogHeader><form onSubmit={handleSubmit} className="grid gap-4"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><Label htmlFor="robot-name">로봇명 *</Label><Input id="robot-name" className="mt-1" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="예: Rescue-01" autoFocus /></div><div><Label htmlFor="robot-serial">시리얼 번호</Label><Input id="robot-serial" className="mt-1" value={form.serialNumber} onChange={event => setForm({ ...form, serialNumber: event.target.value })} placeholder="예: WICS-RBT-001" /></div><div><Label htmlFor="robot-status">초기 상태</Label><select id="robot-status" className="border-input bg-background mt-1 flex h-9 w-full rounded-md border px-3 text-sm" value={form.status} onChange={event => setForm({ ...form, status: event.target.value as RobotStatus })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>{[["battery", "배터리 (%)", "0~100"], ["latitude", "위도", "-90~90"], ["longitude", "경도", "-180~180"], ["heading", "방향 (°)", "0~360"], ["speed", "속도 (m/s)", "0 이상"]].map(([key, label, placeholder]) => <div key={key}><Label htmlFor={`robot-${key}`}>{label}</Label><Input id={`robot-${key}`} className="mt-1" type="number" step="any" min={key === "battery" ? "0" : key === "heading" ? "0" : undefined} max={key === "battery" ? "100" : key === "heading" ? "360" : undefined} value={form[key as keyof RobotForm]} onChange={event => setForm({ ...form, [key]: event.target.value })} placeholder={placeholder} /></div>)}</div><DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>취소</Button><Button type="submit" disabled={isSaving}><Save className="h-4 w-4" />{isSaving ? "저장 중..." : editingRobot ? "변경 저장" : "로봇 등록"}</Button></DialogFooter></form></DialogContent></Dialog>
    </WICSLayout>
  );
}
