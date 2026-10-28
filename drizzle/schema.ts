import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, json } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "operator", "viewer"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Local email/password credentials. Passwords are stored only as salted scrypt hashes.
export const emailCredentials = mysqlTable("emailCredentials", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  normalizedEmail: varchar("normalizedEmail", { length: 320 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EmailCredential = typeof emailCredentials.$inferSelect;
export type InsertEmailCredential = typeof emailCredentials.$inferInsert;

// Robots table
export const robots = mysqlTable("robots", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  serialNumber: varchar("serialNumber", { length: 255 }).unique(),
  status: mysqlEnum("status", ["online", "offline", "idle", "active", "error"]).default("offline").notNull(),
  battery: decimal("battery", { precision: 5, scale: 2 }), // 0-100%
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  heading: decimal("heading", { precision: 6, scale: 2 }), // 0-360 degrees
  speed: decimal("speed", { precision: 8, scale: 2 }), // m/s
  angularVelocity: decimal("angularVelocity", { precision: 8, scale: 2 }), // rad/s
  currentMissionId: int("currentMissionId"),
  lastConnectedAt: timestamp("lastConnectedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Robot = typeof robots.$inferSelect;
export type InsertRobot = typeof robots.$inferInsert;

// Robot Sensors table
export const robotSensors = mysqlTable("robotSensors", {
  id: int("id").autoincrement().primaryKey(),
  robotId: int("robotId").notNull(),
  cameraStatus: mysqlEnum("cameraStatus", ["ok", "warning", "error", "offline"]).default("offline"),
  lidarStatus: mysqlEnum("lidarStatus", ["ok", "warning", "error", "offline"]).default("offline"),
  imuStatus: mysqlEnum("imuStatus", ["ok", "warning", "error", "offline"]).default("offline"),
  aiModuleStatus: mysqlEnum("aiModuleStatus", ["ok", "warning", "error", "offline"]).default("offline"),
  connectionStatus: mysqlEnum("connectionStatus", ["ok", "warning", "error", "offline"]).default("offline"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RobotSensor = typeof robotSensors.$inferSelect;
export type InsertRobotSensor = typeof robotSensors.$inferInsert;

// Missions table
export const missions = mysqlTable("missions", {
  id: int("id").autoincrement().primaryKey(),
  robotId: int("robotId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed", "cancelled"]).default("pending").notNull(),
  startTime: timestamp("startTime"),
  endTime: timestamp("endTime"),
  targetLatitude: decimal("targetLatitude", { precision: 10, scale: 8 }),
  targetLongitude: decimal("targetLongitude", { precision: 11, scale: 8 }),
  distanceTraveled: decimal("distanceTraveled", { precision: 10, scale: 2 }), // meters
  detectionCount: int("detectionCount").default(0),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Mission = typeof missions.$inferSelect;
export type InsertMission = typeof missions.$inferInsert;

// YOLO Detections table
export const detections = mysqlTable("detections", {
  id: int("id").autoincrement().primaryKey(),
  missionId: int("missionId").notNull(),
  robotId: int("robotId").notNull(),
  imageUrl: varchar("imageUrl", { length: 1024 }),
  className: varchar("className", { length: 255 }).notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 4 }).notNull(), // 0-1
  xMin: decimal("xMin", { precision: 8, scale: 2 }),
  yMin: decimal("yMin", { precision: 8, scale: 2 }),
  xMax: decimal("xMax", { precision: 8, scale: 2 }),
  yMax: decimal("yMax", { precision: 8, scale: 2 }),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  detectedAt: timestamp("detectedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Detection = typeof detections.$inferSelect;
export type InsertDetection = typeof detections.$inferInsert;

// Maps table
export const maps = mysqlTable("maps", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  fileUrl: varchar("fileUrl", { length: 1024 }),
  description: text("description"),
  centerLatitude: decimal("centerLatitude", { precision: 10, scale: 8 }),
  centerLongitude: decimal("centerLongitude", { precision: 11, scale: 8 }),
  zoomLevel: int("zoomLevel"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Map = typeof maps.$inferSelect;
export type InsertMap = typeof maps.$inferInsert;

// Immutable audit trail for map changes, including the actor and before/after snapshots.
export const mapAuditLogs = mysqlTable("mapAuditLogs", {
  id: int("id").autoincrement().primaryKey(),
  mapId: int("mapId").notNull(),
  action: varchar("action", { length: 32 }).notNull(),
  changedByUserId: int("changedByUserId").notNull(),
  changedByName: varchar("changedByName", { length: 255 }),
  changedByEmail: varchar("changedByEmail", { length: 320 }),
  changedFields: json("changedFields"),
  beforeData: json("beforeData"),
  afterData: json("afterData"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MapAuditLog = typeof mapAuditLogs.$inferSelect;
export type InsertMapAuditLog = typeof mapAuditLogs.$inferInsert;

// Roles table
export const roles = mysqlTable("roles", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description"),
  canRead: boolean("canRead").default(true),
  canWrite: boolean("canWrite").default(false),
  canDelete: boolean("canDelete").default(false),
  canControl: boolean("canControl").default(false), // Robot control permissions
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Role = typeof roles.$inferSelect;
export type InsertRole = typeof roles.$inferInsert;

// User Roles table (junction table)
export const userRoles = mysqlTable("userRoles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  roleId: int("roleId").notNull(),
  assignedAt: timestamp("assignedAt").defaultNow().notNull(),
});

export type UserRole = typeof userRoles.$inferSelect;
export type InsertUserRole = typeof userRoles.$inferInsert;
