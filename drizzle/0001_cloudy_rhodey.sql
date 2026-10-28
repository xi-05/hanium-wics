CREATE TABLE `detections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`missionId` int NOT NULL,
	`robotId` int NOT NULL,
	`imageUrl` varchar(1024),
	`className` varchar(255) NOT NULL,
	`confidence` decimal(5,4) NOT NULL,
	`xMin` decimal(8,2),
	`yMin` decimal(8,2),
	`xMax` decimal(8,2),
	`yMax` decimal(8,2),
	`latitude` decimal(10,8),
	`longitude` decimal(11,8),
	`detectedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `detections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `maps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`fileUrl` varchar(1024),
	`description` text,
	`centerLatitude` decimal(10,8),
	`centerLongitude` decimal(11,8),
	`zoomLevel` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `maps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `missions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`robotId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`status` enum('pending','running','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
	`startTime` timestamp,
	`endTime` timestamp,
	`targetLatitude` decimal(10,8),
	`targetLongitude` decimal(11,8),
	`distanceTraveled` decimal(10,2),
	`detectionCount` int DEFAULT 0,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `missions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `robotSensors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`robotId` int NOT NULL,
	`cameraStatus` enum('ok','warning','error','offline') DEFAULT 'offline',
	`lidarStatus` enum('ok','warning','error','offline') DEFAULT 'offline',
	`imuStatus` enum('ok','warning','error','offline') DEFAULT 'offline',
	`aiModuleStatus` enum('ok','warning','error','offline') DEFAULT 'offline',
	`connectionStatus` enum('ok','warning','error','offline') DEFAULT 'offline',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `robotSensors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `robots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`serialNumber` varchar(255),
	`status` enum('online','offline','idle','active','error') NOT NULL DEFAULT 'offline',
	`battery` decimal(5,2),
	`latitude` decimal(10,8),
	`longitude` decimal(11,8),
	`heading` decimal(6,2),
	`speed` decimal(8,2),
	`angularVelocity` decimal(8,2),
	`currentMissionId` int,
	`lastConnectedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `robots_id` PRIMARY KEY(`id`),
	CONSTRAINT `robots_serialNumber_unique` UNIQUE(`serialNumber`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`canRead` boolean DEFAULT true,
	`canWrite` boolean DEFAULT false,
	`canDelete` boolean DEFAULT false,
	`canControl` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `roles_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `userRoles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`roleId` int NOT NULL,
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `userRoles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','operator','viewer') NOT NULL DEFAULT 'user';