ALTER TABLE `access_events` MODIFY COLUMN `direction` enum('right','left','forward','backward','unknown') NOT NULL DEFAULT 'unknown';--> statement-breakpoint
ALTER TABLE `access_events` ADD `vehicleColorSecondary` varchar(64);--> statement-breakpoint
ALTER TABLE `access_events` ADD `vehicleBrand` varchar(64);--> statement-breakpoint
ALTER TABLE `access_events` ADD `vehicleModel` varchar(64);--> statement-breakpoint
ALTER TABLE `access_events` ADD `vehicleYear` varchar(16);--> statement-breakpoint
ALTER TABLE `access_events` ADD `vehicleSubtype` varchar(64);--> statement-breakpoint
ALTER TABLE `access_events` ADD `axleCount` varchar(16);--> statement-breakpoint
ALTER TABLE `access_events` ADD `hasTrailer` boolean;--> statement-breakpoint
ALTER TABLE `access_events` ADD `trailerType` varchar(64);--> statement-breakpoint
ALTER TABLE `access_events` ADD `cabinType` varchar(64);--> statement-breakpoint
ALTER TABLE `access_events` ADD `loadType` varchar(64);--> statement-breakpoint
ALTER TABLE `access_events` ADD `estimatedLoadWeight` varchar(32);--> statement-breakpoint
ALTER TABLE `access_events` ADD `bodyCondition` varchar(64);--> statement-breakpoint
ALTER TABLE `access_events` ADD `hasVisibleDamage` boolean;--> statement-breakpoint
ALTER TABLE `access_events` ADD `damageDescription` text;--> statement-breakpoint
ALTER TABLE `access_events` ADD `cleanlinessLevel` varchar(32);--> statement-breakpoint
ALTER TABLE `access_events` ADD `hasRoofLights` boolean;--> statement-breakpoint
ALTER TABLE `access_events` ADD `hasExhaustStack` boolean;--> statement-breakpoint
ALTER TABLE `access_events` ADD `hasCompany` varchar(128);--> statement-breakpoint
ALTER TABLE `access_events` ADD `hasSignage` text;--> statement-breakpoint
ALTER TABLE `access_events` ADD `distinctiveFeatures` text;--> statement-breakpoint
ALTER TABLE `access_events` ADD `visibleOccupants` int;--> statement-breakpoint
ALTER TABLE `access_events` ADD `driverVisible` boolean;--> statement-breakpoint
ALTER TABLE `access_events` ADD `directionConfidence` float;