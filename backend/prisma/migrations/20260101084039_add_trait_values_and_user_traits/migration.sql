-- AlterTable
ALTER TABLE `message` ADD COLUMN `followRequestId` BIGINT NULL;

-- AlterTable
ALTER TABLE `profileaccess` ADD COLUMN `decisionReason` TEXT NULL,
    ADD COLUMN `respondedAt` DATETIME(3) NULL,
    ADD COLUMN `source` ENUM('PROFILE', 'INBOX', 'SYSTEM') NOT NULL DEFAULT 'PROFILE',
    ADD COLUMN `statusUpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    MODIFY `status` ENUM('PENDING', 'GRANTED', 'DENIED', 'REVOKED', 'CANCELED') NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE `quizoption` ADD COLUMN `traitValues` JSON NULL;

-- CreateTable
CREATE TABLE `UserTrait` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `traitKey` VARCHAR(191) NOT NULL,
    `value` DECIMAL(10, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UserTrait_userId_idx`(`userId`),
    INDEX `UserTrait_traitKey_idx`(`traitKey`),
    UNIQUE INDEX `UserTrait_userId_traitKey_key`(`userId`, `traitKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Message_followRequestId_idx` ON `Message`(`followRequestId`);

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_followRequestId_fkey` FOREIGN KEY (`followRequestId`) REFERENCES `ProfileAccess`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserTrait` ADD CONSTRAINT `UserTrait_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
