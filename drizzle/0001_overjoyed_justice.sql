CREATE TABLE `access_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cameraId` int NOT NULL,
	`videoUploadId` int,
	`eventType` enum('entry','exit','unknown') NOT NULL,
	`vehicleType` enum('truck','car','motorcycle','van','person','unknown') NOT NULL,
	`direction` enum('right','left','unknown') NOT NULL DEFAULT 'unknown',
	`llmDescription` text,
	`vehicleColor` varchar(64),
	`vehiclePlate` varchar(32),
	`hasLoad` boolean,
	`loadDescription` text,
	`evidenceFrameS3Key` varchar(1024),
	`evidenceFrameUrl` text,
	`confidence` float,
	`eventTimestamp` timestamp NOT NULL,
	`rawLlmResponse` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `access_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cameras` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`type` enum('trucks','vehicles') NOT NULL,
	`location` varchar(256),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cameras_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `person_counts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cameraId` int NOT NULL,
	`videoUploadId` int NOT NULL,
	`totalCount` int NOT NULL DEFAULT 0,
	`detectedPersonIds` json,
	`periodStart` timestamp NOT NULL,
	`periodEnd` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `person_counts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `video_uploads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cameraId` int NOT NULL,
	`uploadedBy` int NOT NULL,
	`originalFilename` varchar(512) NOT NULL,
	`s3Key` varchar(1024) NOT NULL,
	`s3Url` text NOT NULL,
	`fileSize` int,
	`durationSeconds` float,
	`status` enum('pending','processing','completed','error') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`processedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `video_uploads_id` PRIMARY KEY(`id`)
);
