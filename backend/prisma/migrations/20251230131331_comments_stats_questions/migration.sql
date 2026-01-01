-- CreateTable
CREATE TABLE `Comment` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `targetKind` ENUM('POST', 'PROFILE', 'QUESTION', 'MATCH') NOT NULL,
    `targetId` BIGINT NOT NULL,
    `authorId` BIGINT NOT NULL,
    `clientRequestId` VARCHAR(191) NULL,
    `body` TEXT NOT NULL,
    `status` ENUM('ACTIVE', 'HIDDEN', 'DELETED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,
    `parentId` BIGINT NULL,
    `rootId` BIGINT NULL,

    INDEX `Comment_targetKind_targetId_createdAt_idx`(`targetKind`, `targetId`, `createdAt`),
    INDEX `Comment_targetKind_targetId_rootId_createdAt_idx`(`targetKind`, `targetId`, `rootId`, `createdAt`),
    INDEX `Comment_authorId_createdAt_idx`(`authorId`, `createdAt`),
    INDEX `Comment_parentId_idx`(`parentId`),
    INDEX `Comment_rootId_idx`(`rootId`),
    UNIQUE INDEX `Comment_authorId_targetKind_targetId_clientRequestId_key`(`authorId`, `targetKind`, `targetId`, `clientRequestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FeedQuestion` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `targetKind` ENUM('POST', 'PROFILE', 'FEED') NOT NULL,
    `targetId` BIGINT NOT NULL,
    `quizId` BIGINT NOT NULL,
    `quizQuestionId` BIGINT NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FeedQuestion_targetKind_targetId_isActive_idx`(`targetKind`, `targetId`, `isActive`),
    INDEX `FeedQuestion_quizId_idx`(`quizId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FeedQuestionCurrent` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `targetKind` ENUM('POST', 'PROFILE', 'FEED') NOT NULL,
    `targetId` BIGINT NOT NULL,
    `feedQuestionId` BIGINT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FeedQuestionCurrent_feedQuestionId_idx`(`feedQuestionId`),
    UNIQUE INDEX `FeedQuestionCurrent_targetKind_targetId_key`(`targetKind`, `targetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PostStats` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `postId` BIGINT NOT NULL,
    `likeCount` INTEGER NOT NULL DEFAULT 0,
    `commentCount` INTEGER NOT NULL DEFAULT 0,
    `lastLikeAt` DATETIME(3) NULL,
    `lastCommentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PostStats_postId_key`(`postId`),
    INDEX `PostStats_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProfileStats` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `profileId` BIGINT NOT NULL,
    `likeCount` INTEGER NOT NULL DEFAULT 0,
    `dislikeCount` INTEGER NOT NULL DEFAULT 0,
    `ratingCount` INTEGER NOT NULL DEFAULT 0,
    `ratingSums` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProfileStats_profileId_key`(`profileId`),
    INDEX `ProfileStats_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeedQuestion` ADD CONSTRAINT `FeedQuestion_quizId_fkey` FOREIGN KEY (`quizId`) REFERENCES `Quiz`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeedQuestion` ADD CONSTRAINT `FeedQuestion_quizQuestionId_fkey` FOREIGN KEY (`quizQuestionId`) REFERENCES `QuizQuestion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PostStats` ADD CONSTRAINT `PostStats_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProfileStats` ADD CONSTRAINT `ProfileStats_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `Profile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
