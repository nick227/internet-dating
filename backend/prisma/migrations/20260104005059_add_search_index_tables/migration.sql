-- CreateTable
CREATE TABLE `ProfileSearchIndex` (
    `userId` BIGINT NOT NULL,
    `displayName` VARCHAR(191) NULL,
    `bio` TEXT NULL,
    `locationText` VARCHAR(191) NULL,
    `gender` ENUM('UNSPECIFIED', 'MALE', 'FEMALE', 'NONBINARY', 'OTHER') NOT NULL,
    `intent` ENUM('UNSPECIFIED', 'FRIENDS', 'CASUAL', 'LONG_TERM', 'MARRIAGE') NOT NULL,
    `age` INTEGER NULL,
    `ageBucket` INTEGER NULL,
    `birthdate` DATETIME(3) NULL,
    `locationCity` VARCHAR(191) NULL,
    `locationState` VARCHAR(191) NULL,
    `locationCountry` VARCHAR(191) NULL,
    `interestCount` INTEGER NOT NULL DEFAULT 0,
    `traitCount` INTEGER NOT NULL DEFAULT 0,
    `traitSummary` JSON NULL,
    `top5Keywords` JSON NULL,
    `isVisible` BOOLEAN NOT NULL,
    `isDeleted` BOOLEAN NOT NULL,
    `accountCreatedAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `indexedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProfileSearchIndex_isVisible_isDeleted_gender_intent_idx`(`isVisible`, `isDeleted`, `gender`, `intent`),
    INDEX `ProfileSearchIndex_ageBucket_gender_intent_idx`(`ageBucket`, `gender`, `intent`),
    INDEX `ProfileSearchIndex_locationCity_locationState_idx`(`locationCity`, `locationState`),
    INDEX `ProfileSearchIndex_locationText_idx`(`locationText`),
    INDEX `ProfileSearchIndex_accountCreatedAt_idx`(`accountCreatedAt`),
    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InterestUserSet` (
    `interestId` BIGINT NOT NULL,
    `userId` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InterestUserSet_interestId_idx`(`interestId`),
    INDEX `InterestUserSet_userId_idx`(`userId`),
    PRIMARY KEY (`interestId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InterestSubjectUserSet` (
    `subjectId` BIGINT NOT NULL,
    `userId` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InterestSubjectUserSet_subjectId_idx`(`subjectId`),
    INDEX `InterestSubjectUserSet_userId_idx`(`userId`),
    PRIMARY KEY (`subjectId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SearchableUser` (
    `userId` BIGINT NOT NULL,
    `isVisible` BOOLEAN NOT NULL,
    `isDeleted` BOOLEAN NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SearchableUser_isVisible_isDeleted_idx`(`isVisible`, `isDeleted`),
    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProfileSearchIndex` ADD CONSTRAINT `ProfileSearchIndex_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InterestUserSet` ADD CONSTRAINT `InterestUserSet_interestId_fkey` FOREIGN KEY (`interestId`) REFERENCES `Interest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InterestUserSet` ADD CONSTRAINT `InterestUserSet_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InterestSubjectUserSet` ADD CONSTRAINT `InterestSubjectUserSet_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `InterestSubject`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InterestSubjectUserSet` ADD CONSTRAINT `InterestSubjectUserSet_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SearchableUser` ADD CONSTRAINT `SearchableUser_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
