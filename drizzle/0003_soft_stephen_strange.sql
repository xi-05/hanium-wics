ALTER TABLE `emailCredentials` RENAME COLUMN `email` TO `normalizedEmail`;--> statement-breakpoint
ALTER TABLE `emailCredentials` DROP INDEX `emailCredentials_email_unique`;--> statement-breakpoint
ALTER TABLE `emailCredentials` ADD CONSTRAINT `emailCredentials_normalizedEmail_unique` UNIQUE(`normalizedEmail`);