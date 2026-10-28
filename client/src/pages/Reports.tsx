import WICSLayout from "@/components/WICSLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";

interface MissionReport {
  id: number;
  missionName: string;
  robotName: string;
  startTime: string;
  endTime: string;
  duration: string;
  status: "completed" | "aborted" | "in_progress";
  detectionCount: number;
  distanceTraveled: number;
  mapCoverage: number;
  summary: string;
}

const mockReports: MissionReport[] = [
  {
    id: 1, missionName: "Building A 1F Exploration", robotName: "Explorer-01",
    startTime: "2024-01-15 13:00:00", endTime: "2024-01-15 14:30:00", duration: "1h 30m",
    status: "completed", detectionCount: 12, distanceTraveled: 245.8, mapCoverage: 87,
    summary: "건물 A 1층 전체 탐색 완료. 인원 3명 탐지, 구조적 손상 2건 발견."
  },
  {
    id: 2, missionName: "Building B Mapping", robotName: "Explorer-02",
    startTime: "2024-01-15 12:00:00", endTime: "", duration: "2h 30m+",
    status: "in_progress", detectionCount: 8, distanceTraveled: 180.3, mapCoverage: 62,
    summary: "건물 B 1층 매핑 진행 중. 현재 62% 완료."
  },
  {
    id: 3, missionName: "Outdoor Patrol", robotName: "Explorer-04",
    startTime: "2024-01-15 10:00:00", endTime: "2024-01-15 11:45:00", duration: "1h 45m",
    status: "completed", detectionCount: 27, distanceTraveled: 520.1, mapCoverage: 95,
    summary: "외부 구역 순찰 완료. 차량 5대, 인원 15명 탐지."
  },
  {
    id: 4, missionName: "Emergency Response A-2F", robotName: "Explorer-05",
    startTime: "2024-01-14 16:00:00", endTime: "2024-01-14 16:20:00", duration: "20m",
    status: "aborted", detectionCount: 2, distanceTraveled: 45.2, mapCoverage: 15,
    summary: "센서 오류로 인한 미션 중단. LiDAR 센서 연결 실패."
  },
  {
    id: 5, missionName: "Night Patrol Building A", robotName: "Explorer-01",
    startTime: "2024-01-14 22:00:00", endTime: "2024-01-15 00:30:00", duration: "2h 30m",
    status: "completed", detectionCount: 5, distanceTraveled: 380.0, mapCoverage: 92,
    summary: "야간 순찰 완료. 이상 징후 없음."
  },
];

export default function Reports() {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="outline" style={{ borderColor: "#4ade80", color: "#4ade80" }}>완료</Badge>;
      case "in_progress":
        return <Badge variant="outline" style={{ borderColor: "#60a5fa", color: "#60a5fa" }}>진행 중</Badge>;
      case "aborted":
        return <Badge variant="outline" style={{ borderColor: "#f87171", color: "#f87171" }}>중단</Badge>;
      default:
        return <Badge variant="outline">미정</Badge>;
    }
  };

  const handleDownload = (report: MissionReport) => {
    toast.success(`${report.missionName} 보고서 다운로드를 시작합니다.`);
  };

  return (
    <WICSLayout currentPage="reports">
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">미션 보고서</h2>
            <p className="text-muted-foreground text-sm mt-1">미션별 요약 및 보고서 다운로드</p>
          </div>
          <Button variant="outline" size="sm" style={{ gap: "0.5rem" }}>
            <Download className="w-4 h-4" />
            전체 내보내기
          </Button>
        </div>

        {/* Stats Summary */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "1rem" }}>
          <Card className="bg-card border-border">
            <CardContent style={{ padding: "1rem" }}>
              <div className="text-xs text-muted-foreground">총 미션</div>
              <div className="text-2xl font-bold font-mono" style={{ marginTop: "0.25rem" }}>{mockReports.length}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent style={{ padding: "1rem" }}>
              <div className="text-xs text-muted-foreground">완료</div>
              <div className="text-2xl font-bold font-mono" style={{ marginTop: "0.25rem", color: "#4ade80" }}>
                {mockReports.filter(r => r.status === "completed").length}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent style={{ padding: "1rem" }}>
              <div className="text-xs text-muted-foreground">총 탐지</div>
              <div className="text-2xl font-bold font-mono" style={{ marginTop: "0.25rem" }}>
                {mockReports.reduce((sum, r) => sum + r.detectionCount, 0)}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent style={{ padding: "1rem" }}>
              <div className="text-xs text-muted-foreground">총 이동거리</div>
              <div className="text-2xl font-bold font-mono" style={{ marginTop: "0.25rem" }}>
                {mockReports.reduce((sum, r) => sum + r.distanceTraveled, 0).toFixed(0)}m
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Reports Table */}
        <Card className="bg-card border-border">
          <CardHeader className="border-b border-border" style={{ padding: "0.75rem 1rem" }}>
            <CardTitle className="text-sm flex items-center" style={{ gap: "0.5rem" }}>
              <FileText className="w-4 h-4" />미션 보고서 목록
            </CardTitle>
          </CardHeader>
          <CardContent style={{ padding: "0" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left font-medium" style={{ padding: "0.75rem 1rem" }}>미션명</th>
                    <th className="text-left font-medium" style={{ padding: "0.75rem 1rem" }}>로봇</th>
                    <th className="text-left font-medium" style={{ padding: "0.75rem 1rem" }}>시작 시간</th>
                    <th className="text-left font-medium" style={{ padding: "0.75rem 1rem" }}>종료 시간</th>
                    <th className="text-left font-medium" style={{ padding: "0.75rem 1rem" }}>소요 시간</th>
                    <th className="text-left font-medium" style={{ padding: "0.75rem 1rem" }}>상태</th>
                    <th className="text-left font-medium" style={{ padding: "0.75rem 1rem" }}>탐지</th>
                    <th className="text-left font-medium" style={{ padding: "0.75rem 1rem" }}>이동거리</th>
                    <th className="text-left font-medium" style={{ padding: "0.75rem 1rem" }}>커버리지</th>
                    <th className="text-left font-medium" style={{ padding: "0.75rem 1rem" }}>다운로드</th>
                  </tr>
                </thead>
                <tbody>
                  {mockReports.map((report) => (
                    <tr key={report.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                      <td className="font-medium" style={{ padding: "0.75rem 1rem" }}>{report.missionName}</td>
                      <td style={{ padding: "0.75rem 1rem" }}>{report.robotName}</td>
                      <td className="font-mono text-xs" style={{ padding: "0.75rem 1rem" }}>{report.startTime}</td>
                      <td className="font-mono text-xs" style={{ padding: "0.75rem 1rem" }}>{report.endTime || "-"}</td>
                      <td className="font-mono" style={{ padding: "0.75rem 1rem" }}>{report.duration}</td>
                      <td style={{ padding: "0.75rem 1rem" }}>{getStatusBadge(report.status)}</td>
                      <td className="font-mono" style={{ padding: "0.75rem 1rem" }}>{report.detectionCount}</td>
                      <td className="font-mono" style={{ padding: "0.75rem 1rem" }}>{report.distanceTraveled.toFixed(1)}m</td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <div className="flex items-center" style={{ gap: "0.5rem" }}>
                          <div className="w-16 h-1 bg-muted rounded-full">
                            <div className="h-full bg-accent rounded-full" style={{ width: `${report.mapCoverage}%` }} />
                          </div>
                          <span className="font-mono text-xs">{report.mapCoverage}%</span>
                        </div>
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <Button variant="ghost" size="sm" className="h-7" style={{ gap: "0.25rem" }} onClick={() => handleDownload(report)}>
                          <Download className="w-3 h-3" />
                          PDF
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Report Detail */}
        <Card className="bg-card border-border">
          <CardHeader className="border-b border-border" style={{ padding: "0.75rem 1rem" }}>
            <CardTitle className="text-sm">최근 미션 요약</CardTitle>
          </CardHeader>
          <CardContent style={{ padding: "1rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {mockReports.slice(0, 3).map((report) => (
                <div key={report.id} className="border border-border rounded-[2px]" style={{ padding: "0.75rem 1rem" }}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{report.missionName}</span>
                    {getStatusBadge(report.status)}
                  </div>
                  <p className="text-xs text-muted-foreground" style={{ marginTop: "0.5rem" }}>{report.summary}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </WICSLayout>
  );
}
