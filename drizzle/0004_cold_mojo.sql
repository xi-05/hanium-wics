CREATE TABLE `mapAuditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`mapId` int NOT NULL,
	`action` varchar(32) NOT NULL,
	`changedByUserId` int NOT NULL,
	`changedByName` varchar(255),
	`changedByEmail` varchar(320),
	`changedFields` json,
	`beforeData` json,
	`afterData` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mapAuditLogs_id` PRIMARY KEY(`id`)
);
