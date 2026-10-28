import WICSLayout from "@/components/WICSLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Camera, Cpu, Radio, Thermometer } from "lucide-react";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

interface MonitoringData {
  robotId: number;
  timestamp: string;
  velocity: { linear: number; angular: number };
  sensors: {
    camera: { status: boolean; fps: number; resolution: string };
    lidar: { status: boolean; pointsPerSec: number; range: number };
    imu: { status: boolean; roll: number; pitch: number; yaw: number };
    ai: { status: boolean; inferenceTime: number; detections: number };
  };
  system: {
    cpuUsage: number;
    memUsage: number;
    temperature: number;
    networkLatency: number;
  };
}

export default function Monitoring() {
  const [selectedRobot, setSelectedRobot] = useState("");
  const [isPolling, setIsPolling] = useState(true);
  const robotsQuery = trpc.robots.list.useQuery(undefined, { refetchInterval: 5000 });
  const robots = robotsQuery.data ?? [];

  useEffect(() => {
    if (!selectedRobot && robots[0]) setSelectedRobot(String(robots[0].id));
    if (selectedRobot && !robots.some(robot => String(robot.id) === selectedRobot)) setSelectedRobot(robots[0] ? String(robots[0].id) : "");
  }, [robots, selectedRobot]);

  // Use tRPC query with refetch interval for polling
  const { data: liveData } = trpc.robots.liveData.useQuery(
    { robotId: parseInt(selectedRobot || "0") },
    {
      refetchInterval: isPolling ? 2000 : false,
      refetchIntervalInBackground: false,
    }
  );

  const data: MonitoringData = liveData || {
    robotId: parseInt(selectedRobot || "0"),
    timestamp: new Date().toISOString(),
    velocity: { linear: 0, angular: 0 },
    sensors: {
      camera: { status: false, fps: 0, resolution: "N/A" },
      lidar: { status: false, pointsPerSec: 0, range: 0 },
      imu: { status: false, roll: 0, pitch: 0, yaw: 0 },
      ai: { status: false, inferenceTime: 0, detections: 0 },
    },
    system: { cpuUsage: 0, memUsage: 0, temperature: 0, networkLatency: 0 },
  };

  const getStatusIndicator = (status: boolean) => (
    <span style={{ color: status ? "#4ade80" : "#f87171", fontWeight: "bold", fontFamily: "monospace", fontSize: "0.75rem" }}>
      {status ? "● ACTIVE" : "● INACTIVE"}
    </span>
  );

  const getTemperatureColor = (temp: number) => {
    if (temp < 55) return "#4ade80";
    if (temp < 65) return "#facc15";
    return "#f87171";
  };

  return (
    <WICSLayout currentPage="monitoring">
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">실시간 모니터링</h2>
            <p className="text-muted-foreground text-sm mt-1">로봇 센서 및 시스템 상태 실시간 모니터링</p>
          </div>
          <div className="flex items-center" style={{ gap: "1rem" }}>
              <Select value={selectedRobot} onValueChange={setSelectedRobot}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="로봇 선택" />
              </SelectTrigger>
              <SelectContent>
                {robots.map(r => (
                  <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge
              variant={isPolling ? "default" : "outline"}
              className="cursor-pointer select-none"
              onClick={() => setIsPolling(!isPolling)}
              style={{ backgroundColor: isPolling ? "#4ade80" : undefined, color: isPolling ? "#000" : undefined }}
            >
              {isPolling ? "● LIVE" : "○ PAUSED"}
            </Badge>
          </div>
        </div>

        {/* Velocity Panel */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <Card className="bg-card border-border">
            <CardHeader className="border-b border-border" style={{ padding: "0.75rem 1rem" }}>
              <CardTitle className="text-sm flex items-center" style={{ gap: "0.5rem" }}>
                <Activity className="w-4 h-4 text-accent" />속도 정보
              </CardTitle>
            </CardHeader>
            <CardContent style={{ padding: "1rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div className="text-center border border-border rounded-[2px]" style={{ padding: "1rem" }}>
                  <div className="text-xs text-muted-foreground">선속도 (m/s)</div>
                  <div className="font-mono text-2xl" style={{ color: "#4ade80", marginTop: "0.5rem" }}>
                    {data.velocity.linear.toFixed(3)}
                  </div>
                </div>
                <div className="text-center border border-border rounded-[2px]" style={{ padding: "1rem" }}>
                  <div className="text-xs text-muted-foreground">각속도 (rad/s)</div>
                  <div className="font-mono text-2xl" style={{ color: "#60a5fa", marginTop: "0.5rem" }}>
                    {data.velocity.angular.toFixed(3)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* System Resources */}
          <Card className="bg-card border-border">
            <CardHeader className="border-b border-border" style={{ padding: "0.75rem 1rem" }}>
              <CardTitle className="text-sm flex items-center" style={{ gap: "0.5rem" }}>
                <Cpu className="w-4 h-4 text-accent" />시스템 리소스
              </CardTitle>
            </CardHeader>
            <CardContent style={{ padding: "1rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div className="border border-border rounded-[2px]" style={{ padding: "0.75rem" }}>
                  <div className="text-xs text-muted-foreground">CPU 사용률</div>
                  <div className="font-mono text-lg" style={{ marginTop: "0.25rem" }}>{data.system.cpuUsage.toFixed(1)}%</div>
                  <div className="w-full h-1 bg-muted rounded-full" style={{ marginTop: "0.25rem" }}>
                    <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${data.system.cpuUsage}%` }} />
                  </div>
                </div>
                <div className="border border-border rounded-[2px]" style={{ padding: "0.75rem" }}>
                  <div className="text-xs text-muted-foreground">메모리 사용률</div>
                  <div className="font-mono text-lg" style={{ marginTop: "0.25rem" }}>{data.system.memUsage.toFixed(1)}%</div>
                  <div className="w-full h-1 bg-muted rounded-full" style={{ marginTop: "0.25rem" }}>
                    <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${data.system.memUsage}%` }} />
                  </div>
                </div>
                <div className="border border-border rounded-[2px]" style={{ padding: "0.75rem" }}>
                  <div className="text-xs text-muted-foreground flex items-center" style={{ gap: "0.25rem" }}>
                    <Thermometer className="w-3 h-3" />온도
                  </div>
                  <div className="font-mono text-lg" style={{ marginTop: "0.25rem", color: getTemperatureColor(data.system.temperature) }}>
                    {data.system.temperature.toFixed(1)}°C
                  </div>
                </div>
                <div className="border border-border rounded-[2px]" style={{ padding: "0.75rem" }}>
                  <div className="text-xs text-muted-foreground">네트워크 지연</div>
                  <div className="font-mono text-lg" style={{ marginTop: "0.25rem" }}>{data.system.networkLatency.toFixed(1)}ms</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sensor Status */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "1rem" }}>
          {/* Camera */}
          <Card className="bg-card border-border">
            <CardHeader className="border-b border-border" style={{ padding: "0.75rem 1rem" }}>
              <CardTitle className="text-sm flex items-center" style={{ gap: "0.5rem" }}>
                <Camera className="w-4 h-4" />카메라
              </CardTitle>
            </CardHeader>
            <CardContent style={{ padding: "1rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">상태</span>
                  {getStatusIndicator(data.sensors.camera.status)}
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">FPS</span>
                  <span className="font-mono">{data.sensors.camera.fps}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">해상도</span>
                  <span className="font-mono">{data.sensors.camera.resolution}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* LiDAR */}
          <Card className="bg-card border-border">
            <CardHeader className="border-b border-border" style={{ padding: "0.75rem 1rem" }}>
              <CardTitle className="text-sm flex items-center" style={{ gap: "0.5rem" }}>
                <Radio className="w-4 h-4" />LiDAR
              </CardTitle>
            </CardHeader>
            <CardContent style={{ padding: "1rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">상태</span>
                  {getStatusIndicator(data.sensors.lidar.status)}
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">포인트/초</span>
                  <span className="font-mono">{(data.sensors.lidar.pointsPerSec / 1000).toFixed(0)}K</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">범위</span>
                  <span className="font-mono">{data.sensors.lidar.range}m</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* IMU */}
          <Card className="bg-card border-border">
            <CardHeader className="border-b border-border" style={{ padding: "0.75rem 1rem" }}>
              <CardTitle className="text-sm flex items-center" style={{ gap: "0.5rem" }}>
                <Activity className="w-4 h-4" />IMU
              </CardTitle>
            </CardHeader>
            <CardContent style={{ padding: "1rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">상태</span>
                  {getStatusIndicator(data.sensors.imu.status)}
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Roll</span>
                  <span className="font-mono">{data.sensors.imu.roll.toFixed(2)}°</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Pitch</span>
                  <span className="font-mono">{data.sensors.imu.pitch.toFixed(2)}°</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Yaw</span>
                  <span className="font-mono">{data.sensors.imu.yaw.toFixed(1)}°</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Module */}
          <Card className="bg-card border-border">
            <CardHeader className="border-b border-border" style={{ padding: "0.75rem 1rem" }}>
              <CardTitle className="text-sm flex items-center" style={{ gap: "0.5rem" }}>
                <Cpu className="w-4 h-4" />AI 모듈
              </CardTitle>
            </CardHeader>
            <CardContent style={{ padding: "1rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">상태</span>
                  {getStatusIndicator(data.sensors.ai.status)}
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">추론 시간</span>
                  <span className="font-mono">{data.sensors.ai.inferenceTime.toFixed(1)}ms</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">탐지 수</span>
                  <span className="font-mono">{data.sensors.ai.detections}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Timestamp */}
        <div className="text-xs text-muted-foreground font-mono text-right">
          마지막 업데이트: {new Date(data.timestamp).toLocaleString("ko-KR")} | 폴링 간격: 2초
        </div>
      </div>
    </WICSLayout>
  );
}
