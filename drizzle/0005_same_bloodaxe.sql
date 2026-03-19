CREATE TABLE `analysis_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accessEventId` int NOT NULL,
	`videoUploadId` int NOT NULL,
	`cameraId` int NOT NULL,
	`summary` text,
	`totalFramesAnalyzed` int NOT NULL DEFAULT 0,
	`segmentsDetected` int NOT NULL DEFAULT 0,
	`finalDecision` varchar(32),
	`decisionReasoning` text,
	`frameSteps` json,
	`annotatedFrameUrls` json,
	`directionConfigSnapshot` json,
	`promptSnapshot` text,
	`processingTimeMs` int,
	`llmCallCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `analysis_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `cameras` ADD `customSystemPrompt` text;--> statement-breakpoint
ALTER TABLE `cameras` ADD `customUserPrompt` text;--> statement-breakpoint
ALTER TABLE `cameras` ADD `promptVersion` int DEFAULT 1 NOT NULL;