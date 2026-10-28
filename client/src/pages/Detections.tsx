import WICSLayout from "@/components/WICSLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, Filter, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

type Detection = { id: number; robotId: number; robotName: string; missionId: number; className: string; confidence: string | number; imageUrl: string | null; xMin: string | number | null; yMin: string | number | null; xMax: string | number | null; yMax: string | number | null; latitude: string | number | null; longitude: string | number | null; detectedAt: Date | string };
type Robot = { id: number; name: string };
type Mission = { id: number; name: string; robotId: number };
const classColors: Record<string, string> = { person: "#4ade80", fire: "#f87171", debris: "#facc15", vehicle: "#60a5fa", smoke: "#a78bfa", crack: "#fb923c" };
const emptyForm = { missionId: "", robotId: "", className: "", confidence: "", imageUrl: "", xMin: "", yMin: "", xMax: "", yMax: "", latitude: "", longitude: "", detectedAt: "" };
const numberOrUndefined = (value: string) => value.trim() === "" ? undefined : Number(value);

export default function Detections() {
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "operator";
  const utils = trpc.useUtils();
  const [searchTerm, setSearchTerm] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [robotFilter, setRobotFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const detectionsQuery = trpc.detections.list.useQuery({ limit: 200 }, { refetchInterval: 5000 });
  const robotsQuery = trpc.robots.list.useQuery(undefined, { refetchInterval: 5000 });
  const missionsQuery = trpc.missions.list.useQuery(undefined, { refetchInterval: 5000 });
  const detections = (detectionsQuery.data ?? []) as Detection[];
  const robots = (robotsQuery.data ?? []) as Robot[];
  const missions = (missionsQuery.data ?? []) as Mission[];
  const classes = useMemo(() => Array.from(new Set(detections.map(detection => detection.className))).sort(), [detections]);
  const filteredDetections = useMemo(() => detections.filter(detection => {
    if (classFilter !== "all" && detection.className !== classFilter) return false;
    if (robotFilter !== "all" && String(detection.robotId) !== robotFilter) return false;
    if (searchTerm && !`${detection.className} ${detection.robotName}`.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  }), [detections, classFilter, robotFilter, searchTerm]);
  const createDetection = trpc.detections.create.useMutation({ onSuccess: async result => { if (!result.success) { toast.error("탐지 결과 저장에 실패했습니다."); return; } await utils.detections.list.invalidate(); setForm(emptyForm); setIsFormOpen(false); toast.success("탐지 결과를 저장했습니다."); }, onError: error => toast.error(error.message) });
  const deleteDetection = trpc.detections.delete.useMutation({ onSuccess: async result => { if (!result.success) { toast.error("탐지 결과 삭제에 실패했습니다."); return; } await utils.detections.list.invalidate(); toast.success("탐지 결과를 삭제했습니다."); }, onError: error => toast.error(error.message) });
  const submitDetection = () => {
    const confidence = Number(form.confidence);
    const missionId = Number(form.missionId);
    const robotId = Number(form.robotId);
    if (!missionId || !robotId || !form.className.trim() || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) { toast.error("미션, 로봇, 클래스와 0~1 사이 신뢰도를 입력하세요."); return; }
    createDetection.mutate({ missionId, robotId, className: form.className.trim(), confidence, imageUrl: form.imageUrl.trim() || undefined, xMin: numberOrUndefined(form.xMin), yMin: numberOrUndefined(form.yMin), xMax: numberOrUndefined(form.xMax), yMax: numberOrUndefined(form.yMax), latitude: numberOrUndefined(form.latitude), longitude: numberOrUndefined(form.longitude), detectedAt: form.detectedAt ? new Date(form.detectedAt) : undefined });
  };
  const confidenceColor = (value: number) => value >= 0.9 ? "#4ade80" : value >= 0.7 ? "#facc15" : "#f87171";
  const formatDate = (value: Date | string) => new Date(value).toLocaleString("ko-KR");
  const number = (value: string | number | null) => value == null ? "—" : Number(value).toFixed(2);

  return <WICSLayout currentPage="detections"><div className="flex flex-col gap-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-bold">탐지 결과</h2><p className="text-muted-foreground mt-1 text-sm">실제 detections 테이블의 YOLO 객체 탐지 결과입니다.</p></div><div className="flex items-center gap-2"><Badge variant="outline" className="font-mono">총 {filteredDetections.length}건</Badge><Button size="sm" onClick={() => setIsFormOpen(true)} disabled={!canManage}><Plus className="h-4 w-4" />탐지 결과 등록</Button></div></div>
    {!canManage && <div className="border border-yellow-500/40 bg-yellow-500/5 p-3 text-sm text-yellow-300">탐지 결과 등록·삭제는 관리자(Admin) 또는 운영자만 가능합니다. 읽기 전용 계정은 실제 결과를 조회할 수 있습니다.</div>}
    {isFormOpen && <Card className="border-blue-500/40 bg-card"><CardHeader className="flex-row items-center justify-between border-b border-border p-3"><CardTitle className="text-sm">탐지 결과 등록</CardTitle><Button variant="ghost" size="sm" onClick={() => setIsFormOpen(false)}><X className="h-4 w-4" /></Button></CardHeader><CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3"><div><Label htmlFor="detection-mission">미션 *</Label><select id="detection-mission" value={form.missionId} onChange={event => setForm({ ...form, missionId: event.target.value })} className="border-input bg-background text-foreground mt-1 h-9 w-full rounded-md border px-2 text-sm"><option value="">미션 선택</option>{missions.map(mission => <option key={mission.id} value={mission.id}>#{mission.id} {mission.name}</option>)}</select></div><div><Label htmlFor="detection-robot">로봇 *</Label><select id="detection-robot" value={form.robotId} onChange={event => setForm({ ...form, robotId: event.target.value })} className="border-input bg-background text-foreground mt-1 h-9 w-full rounded-md border px-2 text-sm"><option value="">로봇 선택</option>{robots.map(robot => <option key={robot.id} value={robot.id}>{robot.name}</option>)}</select></div><div><Label htmlFor="detection-class">클래스 *</Label><Input id="detection-class" value={form.className} onChange={event => setForm({ ...form, className: event.target.value })} placeholder="person, fire..." /></div><div><Label htmlFor="detection-confidence">신뢰도 * (0~1)</Label><Input id="detection-confidence" type="number" min="0" max="1" step="0.01" value={form.confidence} onChange={event => setForm({ ...form, confidence: event.target.value })} placeholder="0.95" /></div><div className="md:col-span-2"><Label htmlFor="detection-image">이미지 URL</Label><Input id="detection-image" value={form.imageUrl} onChange={event => setForm({ ...form, imageUrl: event.target.value })} placeholder="https://..." /></div><div><Label htmlFor="detection-lat">위도</Label><Input id="detection-lat" type="number" step="any" value={form.latitude} onChange={event => setForm({ ...form, latitude: event.target.value })} /></div><div><Label htmlFor="detection-lon">경도</Label><Input id="detection-lon" type="number" step="any" value={form.longitude} onChange={event => setForm({ ...form, longitude: event.target.value })} /></div><div><Label htmlFor="detection-time">탐지 시각</Label><Input id="detection-time" type="datetime-local" value={form.detectedAt} onChange={event => setForm({ ...form, detectedAt: event.target.value })} /></div><div className="md:col-span-3 flex justify-end gap-2"><Button variant="outline" onClick={() => setIsFormOpen(false)}>취소</Button><Button onClick={submitDetection} disabled={createDetection.isPending}>{createDetection.isPending ? "저장 중..." : "저장"}</Button></div></CardContent></Card>}
    <Card className="border-border bg-card"><CardContent className="p-4"><div className="flex flex-wrap items-center gap-3"><Filter className="h-4 w-4 text-muted-foreground" /><div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="클래스·로봇 검색..." value={searchTerm} onChange={event => setSearchTerm(event.target.value)} className="pl-9" /></div><select value={classFilter} onChange={event => setClassFilter(event.target.value)} className="border-input bg-background text-foreground h-9 w-40 rounded-md border px-2 text-sm"><option value="all">전체 클래스</option>{classes.map(item => <option key={item} value={item}>{item}</option>)}</select><select value={robotFilter} onChange={event => setRobotFilter(event.target.value)} className="border-input bg-background text-foreground h-9 w-44 rounded-md border px-2 text-sm"><option value="all">전체 로봇</option>{robots.map(robot => <option key={robot.id} value={robot.id}>{robot.name}</option>)}</select></div></CardContent></Card>
    <Card className="border-border bg-card"><CardHeader className="border-b border-border p-3"><CardTitle className="text-sm">탐지 목록</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-muted-foreground"><th className="p-3 text-left font-medium">ID</th><th className="p-3 text-left font-medium">로봇</th><th className="p-3 text-left font-medium">클래스</th><th className="p-3 text-left font-medium">신뢰도</th><th className="p-3 text-left font-medium">위치</th><th className="p-3 text-left font-medium">바운딩 박스</th><th className="p-3 text-left font-medium">탐지 시각</th><th className="p-3 text-left font-medium">관리</th></tr></thead><tbody>{filteredDetections.length === 0 ? <tr><td colSpan={8} className="text-muted-foreground p-10 text-center">DB에 등록된 탐지 결과가 없습니다.</td></tr> : filteredDetections.map(detection => { const confidence = Number(detection.confidence); return <tr key={detection.id} className="border-b border-border transition-colors hover:bg-muted/50"><td className="p-3 font-mono">#{detection.id}</td><td className="p-3">{detection.robotName}<div className="text-muted-foreground text-[10px]">미션 #{detection.missionId}</div></td><td className="p-3"><Badge variant="outline" style={{ borderColor: classColors[detection.className] || "#6b7280", color: classColors[detection.className] || "#6b7280" }}>{detection.className}</Badge></td><td className="p-3 font-mono" style={{ color: confidenceColor(confidence) }}>{(confidence * 100).toFixed(1)}%</td><td className="p-3 font-mono text-xs">({number(detection.latitude)}, {number(detection.longitude)})</td><td className="p-3 font-mono text-xs text-muted-foreground">[{number(detection.xMin)},{number(detection.yMin)},{number(detection.xMax)},{number(detection.yMax)}]</td><td className="p-3 font-mono text-xs">{formatDate(detection.detectedAt)}</td><td className="p-3"><div className="flex items-center gap-1">{detection.imageUrl && <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => window.open(detection.imageUrl ?? "", "_blank", "noopener,noreferrer")}><Eye className="h-4 w-4" /></Button>}{canManage && <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={deleteDetection.isPending} onClick={() => { if (window.confirm(`탐지 #${detection.id}를 삭제하시겠습니까?`)) deleteDetection.mutate({ id: detection.id }); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</div></td></tr>; })}</tbody></table></div></CardContent></Card>
  </div></WICSLayout>;
}
