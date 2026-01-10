-- CreateTable: JobSchedule
CREATE TABLE `JobSchedule` (
    `id` VARCHAR(50) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `lockedAt` DATETIME(3) NULL,
    `lockedBy` VARCHAR(100) NULL,
    `lastRunAt` DATETIME(3) NULL,
    `lastRunId` BIGINT NULL,
    `nextRunAt` DATETIME(3) NULL,
    `runCount` INTEGER NOT NULL DEFAULT 0,
    `failureCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `JobSchedule_enabled_nextRunAt_idx` ON `JobSchedule`(`enabled`, `nextRunAt`);
CREATE INDEX `JobSchedule_lastRunId_idx` ON `JobSchedule`(`lastRunId`);
CREATE INDEX `JobSchedule_lockedAt_idx` ON `JobSchedule`(`lockedAt`);

-- AlterTable: Add scheduleId to JobRun
ALTER TABLE `JobRun` ADD COLUMN `scheduleId` VARCHAR(50) NULL;

-- CreateIndex
CREATE INDEX `JobRun_scheduleId_idx` ON `JobRun`(`scheduleId`);

-- AddForeignKey
ALTER TABLE `JobSchedule` ADD CONSTRAINT `JobSchedule_lastRunId_fkey` 
    FOREIGN KEY (`lastRunId`) REFERENCES `JobRun`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobRun` ADD CONSTRAINT `JobRun_scheduleId_fkey` 
    FOREIGN KEY (`scheduleId`) REFERENCES `JobSchedule`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
