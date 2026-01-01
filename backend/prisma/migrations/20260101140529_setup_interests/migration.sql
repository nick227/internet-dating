-- CreateTable
CREATE TABLE `InterestRelationship` (
    `interestAId` BIGINT NOT NULL,
    `interestBId` BIGINT NOT NULL,
    `pairCount` INTEGER NOT NULL DEFAULT 0,
    `interestACount` INTEGER NOT NULL,
    `interestBCount` INTEGER NOT NULL,
    `strengthAB` DOUBLE NULL,
    `strengthBA` DOUBLE NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InterestRelationship_interestAId_strengthAB_idx`(`interestAId`, `strengthAB`),
    INDEX `InterestRelationship_interestBId_strengthBA_idx`(`interestBId`, `strengthBA`),
    PRIMARY KEY (`interestAId`, `interestBId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InterestStats` (
    `interestId` BIGINT NOT NULL,
    `userCount` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`interestId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InterestRelationshipQueue` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `interestId` BIGINT NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `processed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InterestRelationshipQueue_processed_createdAt_idx`(`processed`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserInterestDelta` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `interestId` BIGINT NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `processed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserInterestDelta_processed_createdAt_idx`(`processed`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InterestDirty` (
    `interestId` BIGINT NOT NULL,
    `touchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InterestDirty_touchedAt_idx`(`touchedAt`),
    PRIMARY KEY (`interestId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `InterestRelationship` ADD CONSTRAINT `InterestRelationship_interestAId_fkey` FOREIGN KEY (`interestAId`) REFERENCES `Interest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InterestRelationship` ADD CONSTRAINT `InterestRelationship_interestBId_fkey` FOREIGN KEY (`interestBId`) REFERENCES `Interest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InterestStats` ADD CONSTRAINT `InterestStats_interestId_fkey` FOREIGN KEY (`interestId`) REFERENCES `Interest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InterestRelationshipQueue` ADD CONSTRAINT `InterestRelationshipQueue_interestId_fkey` FOREIGN KEY (`interestId`) REFERENCES `Interest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserInterestDelta` ADD CONSTRAINT `UserInterestDelta_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserInterestDelta` ADD CONSTRAINT `UserInterestDelta_interestId_fkey` FOREIGN KEY (`interestId`) REFERENCES `Interest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InterestDirty` ADD CONSTRAINT `InterestDirty_interestId_fkey` FOREIGN KEY (`interestId`) REFERENCES `Interest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
