import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDb } from "./db";
import { emailCredentials, robots, missions, detections, maps, mapAuditLogs, users, roles, userRoles, robotSensors } from "../drizzle/schema";
import { eq, desc, and, like, sql, gte } from "drizzle-orm";
import { hashPassword, verifyPassword } from "./password";
import { isValidEmail, normalizeEmail, validatePassword } from "../shared/emailAuth";
import { sdk } from "./_core/sdk";
import { storagePut } from "./storage";

// Helper: check if user has control permission (admin or operator only)
function hasControlPermission(role: string | null | undefined): boolean {
  return role === "admin" || role === "operator";
}

function decimalValue(value: number | null | undefined): string | null | undefined {
  return value === undefined || value === null ? value : String(value);
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    signup: publicProcedure
      .input(z.object({
        name: z.string().trim().min(1, "이름을 입력해 주세요.").max(120),
        email: z.string().trim().toLowerCase(),
        password: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const email = normalizeEmail(input.email);
        if (!isValidEmail(email)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "올바른 이메일 주소를 입력해 주세요." });
        }
        const passwordError = validatePassword(input.password);
        if (passwordError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: passwordError });
        }

        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스에 연결할 수 없습니다." });
        }

        const existingCredential = await db.select().from(emailCredentials).where(eq(emailCredentials.normalizedEmail, email)).limit(1);
        const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (existingCredential.length > 0 || existingUser.length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "이미 가입된 이메일입니다. 로그인해 주세요." });
        }

        const openId = `email-${randomUUID()}`;
        const passwordHash = await hashPassword(input.password);
        await db.insert(users).values({
          openId,
          name: input.name.trim(),
          email,
          loginMethod: "email",
          role: "user",
        });
        const created = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
        const user = created[0];
        if (!user) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "사용자 생성에 실패했습니다." });
        }
        await db.insert(emailCredentials).values({ userId: user.id, normalizedEmail: email, passwordHash });

        const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name ?? input.name.trim() });
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: ONE_YEAR_MS,
        });
        return { success: true, user } as const;
      }),
    login: publicProcedure
      .input(z.object({
        email: z.string().trim().toLowerCase(),
        password: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const email = normalizeEmail(input.email);
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스에 연결할 수 없습니다." });
        }

        const credentials = await db.select().from(emailCredentials).where(eq(emailCredentials.normalizedEmail, email)).limit(1);
        const credential = credentials[0];
        if (!credential || !(await verifyPassword(input.password, credential.passwordHash))) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "이메일 또는 비밀번호가 올바르지 않습니다." });
        }

        const foundUsers = await db.select().from(users).where(eq(users.id, credential.userId)).limit(1);
        const user = foundUsers[0];
        if (!user) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "사용자 계정을 찾을 수 없습니다." });
        }
        await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));

        const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name ?? user.email ?? "WICS User" });
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: ONE_YEAR_MS,
        });
        return { success: true, user } as const;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  dashboard: router({
    overview: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { robots: [], missions: { active: 0, completed: 0, distance: 0, detections: 0 }, detections: [], alerts: [], sensorHealth: { total: 0, healthy: 0 } };
      const [robotRows, missionRows, detectionRows, sensorRows] = await Promise.all([
        db.select().from(robots).orderBy(desc(robots.updatedAt)),
        db.select().from(missions).orderBy(desc(missions.updatedAt)),
        db.select().from(detections).orderBy(desc(detections.detectedAt)).limit(5),
        db.select().from(robotSensors),
      ]);
      const robotNames = new Map(robotRows.map(robot => [robot.id, robot.name]));
      const alerts = robotRows.flatMap(robot => {
        const battery = robot.battery === null ? null : Number(robot.battery);
        const result: Array<{ id: string; severity: "danger" | "warning"; message: string; time: string }> = [];
        if (robot.status === "error") result.push({ id: `robot-error-${robot.id}`, severity: "danger", message: `${robot.name} 오류 상태`, time: "현재" });
        if (battery !== null && battery < 30) result.push({ id: `robot-battery-${robot.id}`, severity: "warning", message: `${robot.name} 배터리 부족 (${battery.toFixed(0)}%)`, time: "현재" });
        return result;
      });
      const distance = missionRows.reduce((sum, mission) => sum + Number(mission.distanceTraveled ?? 0), 0);
      return {
        robots: robotRows,
        missions: {
          active: missionRows.filter(mission => mission.status === "running").length,
          completed: missionRows.filter(mission => mission.status === "completed").length,
          distance,
          detections: missionRows.reduce((sum, mission) => sum + Number(mission.detectionCount ?? 0), 0),
        },
        detections: detectionRows.map(detection => ({ ...detection, robotName: robotNames.get(detection.robotId) ?? `Robot #${detection.robotId}` })),
        alerts,
        sensorHealth: { total: sensorRows.length * 5, healthy: sensorRows.reduce((sum, sensor) => sum + [sensor.cameraStatus, sensor.lidarStatus, sensor.imuStatus, sensor.aiModuleStatus, sensor.connectionStatus].filter(status => status === "ok").length, 0) },
      };
    }),
  }),

  // Robot management
  robots: router({
    list: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(robots).orderBy(desc(robots.updatedAt));
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().trim().min(1, "로봇명을 입력해 주세요.").max(255),
      serialNumber: z.string().trim().max(255).optional(),
      status: z.enum(["online", "offline", "idle", "active", "error"]).default("offline"),
      battery: z.number().min(0).max(100).optional(),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      heading: z.number().min(0).max(360).optional(),
      speed: z.number().min(0).optional(),
    })).mutation(async ({ ctx, input }) => {
      if (!hasControlPermission(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "로봇 관리 권한이 없습니다. 관리자(Admin)에게 문의하세요." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스에 연결할 수 없습니다." });
      await db.insert(robots).values({
        name: input.name.trim(),
        serialNumber: input.serialNumber || null,
        status: input.status,
        battery: decimalValue(input.battery),
        latitude: decimalValue(input.latitude),
        longitude: decimalValue(input.longitude),
        heading: decimalValue(input.heading),
        speed: decimalValue(input.speed),
        lastConnectedAt: input.status === "online" || input.status === "active" ? new Date() : null,
      });
      const created = await db.select().from(robots).where(eq(robots.name, input.name.trim())).orderBy(desc(robots.id)).limit(1);
      return { success: true, robot: created[0] ?? null } as const;
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().trim().min(1, "로봇명을 입력해 주세요.").max(255).optional(),
      serialNumber: z.string().trim().max(255).nullable().optional(),
      status: z.enum(["online", "offline", "idle", "active", "error"]).optional(),
      battery: z.number().min(0).max(100).nullable().optional(),
      latitude: z.number().min(-90).max(90).nullable().optional(),
      longitude: z.number().min(-180).max(180).nullable().optional(),
      heading: z.number().min(0).max(360).nullable().optional(),
      speed: z.number().min(0).nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      if (!hasControlPermission(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "로봇 관리 권한이 없습니다. 관리자(Admin)에게 문의하세요." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스에 연결할 수 없습니다." });
      const { id, ...rawUpdateData } = input;
      const updateData = {
        ...rawUpdateData,
        battery: decimalValue(rawUpdateData.battery),
        latitude: decimalValue(rawUpdateData.latitude),
        longitude: decimalValue(rawUpdateData.longitude),
        heading: decimalValue(rawUpdateData.heading),
        speed: decimalValue(rawUpdateData.speed),
      };
      await db.update(robots).set(updateData).where(eq(robots.id, id));
      const updated = await db.select().from(robots).where(eq(robots.id, id)).limit(1);
      return { success: updated.length > 0, robot: updated[0] ?? null } as const;
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      if (!hasControlPermission(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "로봇 관리 권한이 없습니다. 관리자(Admin)에게 문의하세요." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스에 연결할 수 없습니다." });
      await db.delete(robots).where(eq(robots.id, input.id));
      return { success: true } as const;
    }),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const result = await db.select().from(robots).where(eq(robots.id, input.id)).limit(1);
      return result[0] || null;
    }),
    getSensors: protectedProcedure.input(z.object({ robotId: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const result = await db.select().from(robotSensors).where(eq(robotSensors.robotId, input.robotId)).limit(1);
      return result[0] || null;
    }),
    getTelemetry: protectedProcedure.input(z.object({ robotId: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const robot = await db.select().from(robots).where(eq(robots.id, input.robotId)).limit(1);
      if (!robot[0]) return null;
      const sensor = await db.select().from(robotSensors).where(eq(robotSensors.robotId, input.robotId)).limit(1);
      return { robot: robot[0], sensors: sensor[0] ?? null, receivedAt: new Date() };
    }),
    ingestTelemetry: protectedProcedure.input(z.object({
      robotId: z.number(),
      status: z.enum(["online", "offline", "idle", "active", "error"]).optional(),
      battery: z.number().min(0).max(100).optional(),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      heading: z.number().min(0).max(360).optional(),
      speed: z.number().min(0).optional(),
      angularVelocity: z.number().optional(),
      sensors: z.object({
        cameraStatus: z.enum(["ok", "warning", "error", "offline"]).optional(),
        lidarStatus: z.enum(["ok", "warning", "error", "offline"]).optional(),
        imuStatus: z.enum(["ok", "warning", "error", "offline"]).optional(),
        aiModuleStatus: z.enum(["ok", "warning", "error", "offline"]).optional(),
        connectionStatus: z.enum(["ok", "warning", "error", "offline"]).optional(),
      }).optional(),
    })).mutation(async ({ ctx, input }) => {
      if (!hasControlPermission(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "텔레메트리 갱신 권한이 없습니다." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스에 연결할 수 없습니다." });
      const existing = await db.select().from(robots).where(eq(robots.id, input.robotId)).limit(1);
      if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND", message: "로봇을 찾을 수 없습니다." });

      const { robotId, sensors, ...telemetry } = input;
      await db.update(robots).set({
        ...telemetry,
        battery: decimalValue(telemetry.battery),
        latitude: decimalValue(telemetry.latitude),
        longitude: decimalValue(telemetry.longitude),
        heading: decimalValue(telemetry.heading),
        speed: decimalValue(telemetry.speed),
        angularVelocity: decimalValue(telemetry.angularVelocity),
        lastConnectedAt: new Date(),
      }).where(eq(robots.id, robotId));

      if (sensors) {
        const currentSensors = await db.select().from(robotSensors).where(eq(robotSensors.robotId, robotId)).limit(1);
        if (currentSensors[0]) {
          await db.update(robotSensors).set(sensors).where(eq(robotSensors.robotId, robotId));
        } else {
          await db.insert(robotSensors).values({ robotId, ...sensors });
        }
      }
      return { success: true, robotId, receivedAt: new Date() } as const;
    }),
    getStatus: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { total: 0, online: 0, offline: 0, active: 0 };
      const all = await db.select().from(robots);
      return {
        total: all.length,
        online: all.filter(r => r.status === "online" || r.status === "active").length,
        offline: all.filter(r => r.status === "offline").length,
        active: all.filter(r => r.status === "active").length,
      };
    }),
    // DB-backed telemetry endpoint for polling
    liveData: protectedProcedure.input(z.object({ robotId: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const robot = await db.select().from(robots).where(eq(robots.id, input.robotId)).limit(1);
      if (!robot[0]) return null;
      const sensor = await db.select().from(robotSensors).where(eq(robotSensors.robotId, input.robotId)).limit(1);
      const sensorOk = (status: string | null | undefined) => status === "ok";
      return {
        robotId: input.robotId,
        timestamp: new Date().toISOString(),
        velocity: { linear: Number(robot[0].speed ?? 0), angular: Number(robot[0].angularVelocity ?? 0) },
        sensors: {
          camera: { status: sensorOk(sensor[0]?.cameraStatus), fps: 0, resolution: "DB telemetry" },
          lidar: { status: sensorOk(sensor[0]?.lidarStatus), pointsPerSec: 0, range: 0 },
          imu: { status: sensorOk(sensor[0]?.imuStatus), roll: 0, pitch: 0, yaw: Number(robot[0].heading ?? 0) },
          ai: { status: sensorOk(sensor[0]?.aiModuleStatus), inferenceTime: 0, detections: 0 },
        },
        system: { cpuUsage: 0, memUsage: 0, temperature: 0, networkLatency: 0 },
      };
    }),
    // Control commands - only admin or operator can execute
    startMission: protectedProcedure.input(z.object({ robotId: z.number(), missionName: z.string().trim().min(1).optional() })).mutation(async ({ ctx, input }) => {
      if (!hasControlPermission(ctx.user.role)) {
        return { success: false, error: "제어 권한이 없습니다." };
      }
      const db = await getDb();
      if (!db) return { success: false, error: "데이터베이스에 연결할 수 없습니다." };
      const robotRows = await db.select().from(robots).where(eq(robots.id, input.robotId)).limit(1);
      const robot = robotRows[0];
      if (!robot) return { success: false, error: "로봇을 찾을 수 없습니다." };
      if (robot.status === "offline" || robot.status === "error") return { success: false, error: "오프라인 또는 오류 상태의 로봇은 미션을 시작할 수 없습니다." };
      const missionName = input.missionName || `미션 - ${robot.name}`;
      await db.insert(missions).values({ robotId: robot.id, name: missionName, status: "running", startTime: new Date() });
      const created = await db.select().from(missions).where(eq(missions.robotId, robot.id)).orderBy(desc(missions.id)).limit(1);
      const mission = created[0];
      await db.update(robots).set({ currentMissionId: mission?.id ?? null, status: "active" }).where(eq(robots.id, robot.id));
      return { success: true, message: `${robot.name} 미션을 시작했습니다.`, missionId: mission?.id ?? null };
    }),
    stopMission: protectedProcedure.input(z.object({ robotId: z.number() })).mutation(async ({ ctx, input }) => {
      if (!hasControlPermission(ctx.user.role)) {
        return { success: false, error: "제어 권한이 없습니다." };
      }
      const db = await getDb();
      if (!db) return { success: false, error: "데이터베이스에 연결할 수 없습니다." };
      const robotRows = await db.select().from(robots).where(eq(robots.id, input.robotId)).limit(1);
      const robot = robotRows[0];
      if (!robot) return { success: false, error: "로봇을 찾을 수 없습니다." };
      if (robot.currentMissionId) {
        await db.update(missions).set({ status: "completed", endTime: new Date() }).where(eq(missions.id, robot.currentMissionId));
      }
      await db.update(robots).set({ currentMissionId: null, status: robot.status === "error" ? "error" : "idle" }).where(eq(robots.id, robot.id));
      return { success: true, message: `${robot.name} 미션을 정지했습니다.` };
    }),
    emergencyStop: protectedProcedure.input(z.object({ robotId: z.number() })).mutation(async ({ ctx, input }) => {
      if (!hasControlPermission(ctx.user.role)) {
        return { success: false, error: "제어 권한이 없습니다." };
      }
      return { success: true, message: `로봇 ${input.robotId} 긴급 정지 실행` };
    }),
  }),

  // Mission management
  missions: router({
    list: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(missions).orderBy(desc(missions.createdAt));
    }),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const result = await db.select().from(missions).where(eq(missions.id, input.id)).limit(1);
      return result[0] || null;
    }),
    getStats: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { total: 0, completed: 0, running: 0, failed: 0 };
      const all = await db.select().from(missions);
      return {
        total: all.length,
        completed: all.filter(m => m.status === "completed").length,
        running: all.filter(m => m.status === "running").length,
        failed: all.filter(m => m.status === "failed").length,
      };
    }),
  }),

  // Detection results with actual filtering
  detections: router({
    list: protectedProcedure.input(z.object({
      className: z.string().optional(),
      robotId: z.number().optional(),
      limit: z.number().int().min(1).max(200).optional().default(50),
    }).optional()).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input?.className) {
        conditions.push(eq(detections.className, input.className));
      }
      if (input?.robotId) {
        conditions.push(eq(detections.robotId, input.robotId));
      }
      const result = conditions.length > 0 ? await db.select().from(detections)
          .where(and(...conditions))
          .orderBy(desc(detections.detectedAt))
          .limit(input?.limit || 50) : await db.select().from(detections)
        .orderBy(desc(detections.detectedAt)).limit(input?.limit || 50);
      const robotRows = await db.select().from(robots);
      const robotNames = new Map(robotRows.map(robot => [robot.id, robot.name]));
      return result.map(detection => ({ ...detection, robotName: robotNames.get(detection.robotId) ?? `Robot #${detection.robotId}` }));
    }),
    create: protectedProcedure.input(z.object({
      missionId: z.number().int().positive(),
      robotId: z.number().int().positive(),
      className: z.string().trim().min(1).max(255),
      confidence: z.number().min(0).max(1),
      imageUrl: z.string().trim().max(1024).optional(),
      xMin: z.number().optional(), yMin: z.number().optional(), xMax: z.number().optional(), yMax: z.number().optional(),
      latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(),
      detectedAt: z.date().optional(),
    })).mutation(async ({ ctx, input }) => {
      if (!hasControlPermission(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "탐지 결과 등록 권한이 없습니다. 관리자(Admin) 또는 운영자에게 문의하세요." });
      const db = await getDb();
      if (!db) return { success: false };
      await db.insert(detections).values({ ...input, confidence: String(input.confidence), xMin: decimalValue(input.xMin), yMin: decimalValue(input.yMin), xMax: decimalValue(input.xMax), yMax: decimalValue(input.yMax), latitude: decimalValue(input.latitude), longitude: decimalValue(input.longitude), detectedAt: input.detectedAt ?? new Date() });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (!hasControlPermission(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "탐지 결과 삭제 권한이 없습니다. 관리자(Admin) 또는 운영자에게 문의하세요." });
      const db = await getDb();
      if (!db) return { success: false };
      await db.delete(detections).where(eq(detections.id, input.id));
      return { success: true };
    }),
    getStats: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { total: 0, today: 0 };
      const all = await db.select().from(detections);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayCount = all.filter(d => d.detectedAt && new Date(d.detectedAt) >= today).length;
      return { total: all.length, today: todayCount };
    }),
  }),

  // Map management with update support
  maps: router({
    list: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(maps).orderBy(desc(maps.updatedAt));
    }),
    auditLogs: adminProcedure.input(z.object({ mapId: z.number().int().positive() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(mapAuditLogs).where(eq(mapAuditLogs.mapId, input.mapId)).orderBy(desc(mapAuditLogs.createdAt));
    }),
    uploadFile: adminProcedure.input(z.object({
      fileName: z.string().trim().min(1).max(255),
      contentType: z.string().trim().min(1).max(120),
      dataBase64: z.string().min(1),
    })).mutation(async ({ ctx, input }) => {
      const allowedTypes = new Set(["application/octet-stream", "application/x-yaml", "application/yaml", "image/jpeg", "image/png", "image/webp", "image/x-portable-graymap"]);
      const normalizedType = input.contentType.toLowerCase();
      if (!allowedTypes.has(normalizedType)) throw new TRPCError({ code: "BAD_REQUEST", message: "지원하지 않는 지도 파일 형식입니다. PNG, JPG, WEBP, PGM, YAML 파일을 사용하세요." });
      const data = Buffer.from(input.dataBase64, "base64");
      if (data.length === 0 || data.length > 20 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "지도 파일은 20MB 이하만 업로드할 수 있습니다." });
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180) || "map-file";
      try {
        const uploaded = await storagePut(`maps/${ctx.user.id}/${randomUUID()}-${safeName}`, data, normalizedType);
        return { success: true, ...uploaded, size: data.length } as const;
      } catch (error) {
        console.error("[Maps] File upload failed", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "지도 파일 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요." });
      }
    }),
    create: adminProcedure.input(z.object({
      name: z.string().trim().min(1),
      description: z.string().optional(),
      fileUrl: z.string().optional(),
      centerLatitude: z.number().min(-90).max(90).optional(),
      centerLongitude: z.number().min(-180).max(180).optional(),
      zoomLevel: z.number().int().min(1).max(24).optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      const inserted = await db.insert(maps).values({ ...input, centerLatitude: input.centerLatitude === undefined ? undefined : String(input.centerLatitude), centerLongitude: input.centerLongitude === undefined ? undefined : String(input.centerLongitude) });
      const mapId = Number((inserted as { insertId?: number } | undefined)?.insertId);
      if (Number.isFinite(mapId) && mapId > 0) await db.insert(mapAuditLogs).values({ mapId, action: "created", changedByUserId: ctx.user.id, changedByName: ctx.user.name, changedByEmail: ctx.user.email, changedFields: Object.keys(input), beforeData: null, afterData: input });
      return { success: true };
    }),
    update: adminProcedure.input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      fileUrl: z.string().optional(),
      centerLatitude: z.number().min(-90).max(90).optional(),
      centerLongitude: z.number().min(-180).max(180).optional(),
      zoomLevel: z.number().int().min(1).max(24).optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      const { id, ...updateData } = input;
      const current = (await db.select().from(maps).where(eq(maps.id, id)).limit(1))[0];
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "수정할 지도를 찾을 수 없습니다." });
      const normalizedUpdate = { ...updateData, centerLatitude: updateData.centerLatitude === undefined ? undefined : String(updateData.centerLatitude), centerLongitude: updateData.centerLongitude === undefined ? undefined : String(updateData.centerLongitude) };
      await db.update(maps).set(normalizedUpdate).where(eq(maps.id, id));
      const changedFields = Object.keys(updateData).filter(field => JSON.stringify((current as Record<string, unknown>)[field]) !== JSON.stringify((updateData as Record<string, unknown>)[field]));
      await db.insert(mapAuditLogs).values({ mapId: id, action: "updated", changedByUserId: ctx.user.id, changedByName: ctx.user.name, changedByEmail: ctx.user.email, changedFields, beforeData: current, afterData: { ...current, ...normalizedUpdate } });
      return { success: true };
    }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      const current = (await db.select().from(maps).where(eq(maps.id, input.id)).limit(1))[0];
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "삭제할 지도를 찾을 수 없습니다." });
      await db.delete(maps).where(eq(maps.id, input.id));
      await db.insert(mapAuditLogs).values({ mapId: input.id, action: "deleted", changedByUserId: ctx.user.id, changedByName: ctx.user.name, changedByEmail: ctx.user.email, changedFields: [], beforeData: current, afterData: null });
      return { success: true };
    }),
  }),

  // User & role management with create and update
  users: router({
    list: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(users).orderBy(desc(users.createdAt));
    }),
    create: adminProcedure.input(z.object({
      name: z.string().trim().min(1),
      email: z.string().email(),
      role: z.enum(["user", "admin", "operator", "viewer"]).optional().default("viewer"),
    })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      const openId = `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await db.insert(users).values({ openId, name: input.name, email: input.email, role: input.role });
      const created = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
      return { success: true, user: created[0] ?? null };
    }),
    update: adminProcedure.input(z.object({
      userId: z.number(),
      name: z.string().trim().min(1).optional(),
      email: z.string().email().optional(),
      role: z.enum(["user", "admin", "operator", "viewer"]).optional(),
    })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      const { userId, ...updateData } = input;
      await db.update(users).set(updateData).where(eq(users.id, userId));
      const updated = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      return { success: updated.length > 0, user: updated[0] ?? null };
    }),
    updateRole: adminProcedure.input(z.object({
      userId: z.number(),
      role: z.enum(["user", "admin", "operator", "viewer"]),
    })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
      return { success: true };
    }),
    delete: adminProcedure.input(z.object({ userId: z.number() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      const existing = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
      if (existing.length === 0) return { success: false };
      await db.delete(users).where(eq(users.id, input.userId));
      return { success: true, deletedUserId: input.userId };
    }),
  }),

  // Roles management
  roles: router({
    list: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(roles).orderBy(roles.name);
    }),
    create: adminProcedure.input(z.object({
      name: z.string(),
      description: z.string().optional(),
      canRead: z.boolean().optional(),
      canWrite: z.boolean().optional(),
      canDelete: z.boolean().optional(),
      canControl: z.boolean().optional(),
    })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.insert(roles).values(input);
      return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
