CREATE TABLE `emailCredentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `emailCredentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `emailCredentials_userId_unique` UNIQUE(`userId`),
	CONSTRAINT `emailCredentials_email_unique` UNIQUE(`email`)
);
