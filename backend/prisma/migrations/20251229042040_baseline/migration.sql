-- CreateTable
CREATE TABLE `conversation` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `matchId` BIGINT NULL,
    `userAId` BIGINT NOT NULL,
    `userBId` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Conversation_matchId_key`(`matchId` ASC),
    INDEX `Conversation_updatedAt_idx`(`updatedAt` ASC),
    INDEX `Conversation_userAId_updatedAt_idx`(`userAId` ASC, `updatedAt` ASC),
    UNIQUE INDEX `Conversation_userAId_userBId_key`(`userAId` ASC, `userBId` ASC),
    INDEX `Conversation_userBId_updatedAt_idx`(`userBId` ASC, `updatedAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feedseen` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `viewerUserId` BIGINT NOT NULL,
    `itemType` ENUM('POST', 'SUGGESTION') NOT NULL,
    `itemId` BIGINT NOT NULL,
    `seenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FeedSeen_itemType_itemId_idx`(`itemType` ASC, `itemId` ASC),
    UNIQUE INDEX `FeedSeen_viewerUserId_itemType_itemId_key`(`viewerUserId` ASC, `itemType` ASC, `itemId` ASC),
    INDEX `FeedSeen_viewerUserId_seenAt_idx`(`viewerUserId` ASC, `seenAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `interest` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `subjectId` BIGINT NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Interest_subjectId_key_idx`(`subjectId` ASC, `key` ASC),
    UNIQUE INDEX `Interest_subjectId_key_key`(`subjectId` ASC, `key` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `interestsubject` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `InterestSubject_key_key`(`key` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `jobrun` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `jobName` VARCHAR(191) NOT NULL,
    `status` ENUM('RUNNING', 'SUCCESS', 'FAILED') NOT NULL,
    `trigger` ENUM('CRON', 'EVENT', 'MANUAL') NOT NULL,
    `scope` VARCHAR(191) NULL,
    `algorithmVersion` VARCHAR(191) NULL,
    `attempt` INTEGER NOT NULL DEFAULT 1,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `durationMs` INTEGER NULL,
    `error` TEXT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `JobRun_jobName_startedAt_idx`(`jobName` ASC, `startedAt` ASC),
    INDEX `JobRun_jobName_status_idx`(`jobName` ASC, `status` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `like` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `fromUserId` BIGINT NOT NULL,
    `toUserId` BIGINT NOT NULL,
    `action` ENUM('LIKE', 'DISLIKE') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Like_fromUserId_createdAt_idx`(`fromUserId` ASC, `createdAt` ASC),
    UNIQUE INDEX `Like_fromUserId_toUserId_key`(`fromUserId` ASC, `toUserId` ASC),
    INDEX `Like_toUserId_action_createdAt_idx`(`toUserId` ASC, `action` ASC, `createdAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `likedpost` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `postId` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LikedPost_postId_fkey`(`postId` ASC),
    INDEX `LikedPost_userId_createdAt_idx`(`userId` ASC, `createdAt` ASC),
    UNIQUE INDEX `LikedPost_userId_postId_key`(`userId` ASC, `postId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `match` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userAId` BIGINT NOT NULL,
    `userBId` BIGINT NOT NULL,
    `state` ENUM('ACTIVE', 'BLOCKED', 'CLOSED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `closedAt` DATETIME(3) NULL,

    INDEX `Match_state_updatedAt_idx`(`state` ASC, `updatedAt` ASC),
    UNIQUE INDEX `Match_userAId_userBId_key`(`userAId` ASC, `userBId` ASC),
    INDEX `Match_userBId_fkey`(`userBId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `matchscore` (
    `userId` BIGINT NOT NULL,
    `candidateUserId` BIGINT NOT NULL,
    `score` DOUBLE NOT NULL,
    `algorithmVersion` VARCHAR(191) NULL,
    `scoreQuiz` DOUBLE NULL,
    `scoreInterests` DOUBLE NULL,
    `scoreRatingsQuality` DOUBLE NULL,
    `scoreRatingsFit` DOUBLE NULL,
    `scoreNew` DOUBLE NULL,
    `scoreNearby` DOUBLE NULL,
    `ratingAttractive` DOUBLE NULL,
    `ratingSmart` DOUBLE NULL,
    `ratingFunny` DOUBLE NULL,
    `ratingInteresting` DOUBLE NULL,
    `distanceKm` DOUBLE NULL,
    `reasons` JSON NULL,
    `scoredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MatchScore_candidateUserId_fkey`(`candidateUserId` ASC),
    INDEX `MatchScore_userId_score_idx`(`userId` ASC, `score` ASC),
    INDEX `MatchScore_userId_scoredAt_idx`(`userId` ASC, `scoredAt` ASC),
    PRIMARY KEY (`userId` ASC, `candidateUserId` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `media` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `type` ENUM('IMAGE', 'VIDEO') NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `thumbUrl` VARCHAR(191) NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `durationSec` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,
    `ownerUserId` BIGINT NOT NULL,
    `status` ENUM('PENDING', 'READY', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `visibility` ENUM('PUBLIC', 'PRIVATE') NOT NULL DEFAULT 'PUBLIC',
    `storageKey` VARCHAR(191) NULL,
    `variants` JSON NULL,
    `contentHash` VARCHAR(191) NULL,
    `mimeType` VARCHAR(191) NULL,
    `sizeBytes` INTEGER NULL,

    INDEX `Media_deletedAt_idx`(`deletedAt` ASC),
    INDEX `Media_ownerUserId_deletedAt_createdAt_idx`(`ownerUserId` ASC, `deletedAt` ASC, `createdAt` ASC),
    INDEX `Media_userId_deletedAt_createdAt_idx`(`userId` ASC, `deletedAt` ASC, `createdAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `message` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `conversationId` BIGINT NOT NULL,
    `senderId` BIGINT NOT NULL,
    `body` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,

    INDEX `Message_conversationId_createdAt_idx`(`conversationId` ASC, `createdAt` ASC),
    INDEX `Message_senderId_createdAt_idx`(`senderId` ASC, `createdAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `messagereceipt` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `messageId` BIGINT NOT NULL,
    `userId` BIGINT NOT NULL,
    `readAt` DATETIME(3) NULL,

    UNIQUE INDEX `MessageReceipt_messageId_userId_key`(`messageId` ASC, `userId` ASC),
    INDEX `MessageReceipt_userId_readAt_idx`(`userId` ASC, `readAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `post` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `visibility` ENUM('PUBLIC', 'PRIVATE') NOT NULL DEFAULT 'PUBLIC',
    `text` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Post_deletedAt_idx`(`deletedAt` ASC),
    INDEX `Post_userId_deletedAt_createdAt_idx`(`userId` ASC, `deletedAt` ASC, `createdAt` ASC),
    INDEX `Post_visibility_deletedAt_createdAt_idx`(`visibility` ASC, `deletedAt` ASC, `createdAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `postfeatures` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `postId` BIGINT NOT NULL,
    `topics` JSON NULL,
    `quality` DOUBLE NULL,
    `nsfw` BOOLEAN NOT NULL DEFAULT false,
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PostFeatures_computedAt_idx`(`computedAt` ASC),
    INDEX `PostFeatures_nsfw_idx`(`nsfw` ASC),
    UNIQUE INDEX `PostFeatures_postId_key`(`postId` ASC),
    INDEX `PostFeatures_quality_idx`(`quality` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `postmedia` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `postId` BIGINT NOT NULL,
    `mediaId` BIGINT NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    INDEX `PostMedia_mediaId_fkey`(`mediaId` ASC),
    UNIQUE INDEX `PostMedia_postId_mediaId_key`(`postId` ASC, `mediaId` ASC),
    INDEX `PostMedia_postId_order_idx`(`postId` ASC, `order` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `presortedfeedsegment` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `segmentIndex` INTEGER NOT NULL,
    `items` JSON NOT NULL,
    `phase1Json` TEXT NULL,
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `algorithmVersion` VARCHAR(191) NOT NULL DEFAULT 'v1',
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `PresortedFeedSegment_expiresAt_idx`(`expiresAt` ASC),
    INDEX `PresortedFeedSegment_userId_expiresAt_idx`(`userId` ASC, `expiresAt` ASC),
    UNIQUE INDEX `PresortedFeedSegment_userId_segmentIndex_key`(`userId` ASC, `segmentIndex` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `profile` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `displayName` VARCHAR(191) NULL,
    `bio` TEXT NULL,
    `birthdate` DATETIME(3) NULL,
    `locationText` VARCHAR(191) NULL,
    `lat` DECIMAL(9, 6) NULL,
    `lng` DECIMAL(9, 6) NULL,
    `gender` ENUM('UNSPECIFIED', 'MALE', 'FEMALE', 'NONBINARY', 'OTHER') NOT NULL DEFAULT 'UNSPECIFIED',
    `intent` ENUM('UNSPECIFIED', 'FRIENDS', 'CASUAL', 'LONG_TERM', 'MARRIAGE') NOT NULL DEFAULT 'UNSPECIFIED',
    `isVisible` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,
    `avatarMediaId` BIGINT NULL,
    `heroMediaId` BIGINT NULL,

    INDEX `Profile_avatarMediaId_idx`(`avatarMediaId` ASC),
    INDEX `Profile_deletedAt_idx`(`deletedAt` ASC),
    INDEX `Profile_heroMediaId_idx`(`heroMediaId` ASC),
    INDEX `Profile_isVisible_intent_locationText_idx`(`isVisible` ASC, `intent` ASC, `locationText` ASC),
    INDEX `Profile_lat_lng_idx`(`lat` ASC, `lng` ASC),
    UNIQUE INDEX `Profile_userId_key`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `profileaccess` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `ownerUserId` BIGINT NOT NULL,
    `viewerUserId` BIGINT NOT NULL,
    `status` ENUM('PENDING', 'GRANTED', 'DENIED', 'REVOKED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProfileAccess_ownerUserId_status_updatedAt_idx`(`ownerUserId` ASC, `status` ASC, `updatedAt` ASC),
    UNIQUE INDEX `ProfileAccess_ownerUserId_viewerUserId_key`(`ownerUserId` ASC, `viewerUserId` ASC),
    INDEX `ProfileAccess_viewerUserId_status_updatedAt_idx`(`viewerUserId` ASC, `status` ASC, `updatedAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `profilerating` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `attractive` INTEGER NOT NULL,
    `smart` INTEGER NOT NULL,
    `funny` INTEGER NOT NULL,
    `interesting` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `raterProfileId` BIGINT NOT NULL,
    `targetProfileId` BIGINT NOT NULL,

    UNIQUE INDEX `ProfileRating_raterProfileId_targetProfileId_key`(`raterProfileId` ASC, `targetProfileId` ASC),
    INDEX `ProfileRating_targetProfileId_createdAt_idx`(`targetProfileId` ASC, `createdAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quiz` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Quiz_slug_key`(`slug` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quizoption` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `questionId` BIGINT NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL,

    UNIQUE INDEX `QuizOption_questionId_order_key`(`questionId` ASC, `order` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quizquestion` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `quizId` BIGINT NOT NULL,
    `prompt` TEXT NOT NULL,
    `order` INTEGER NOT NULL,

    UNIQUE INDEX `QuizQuestion_quizId_order_key`(`quizId` ASC, `order` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quizresult` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `quizId` BIGINT NOT NULL,
    `answers` JSON NOT NULL,
    `scoreVec` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `QuizResult_quizId_fkey`(`quizId` ASC),
    UNIQUE INDEX `QuizResult_userId_quizId_key`(`userId` ASC, `quizId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `top5item` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `listId` BIGINT NOT NULL,
    `order` INTEGER NOT NULL,
    `text` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Top5Item_listId_order_key`(`listId` ASC, `order` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `top5list` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `profileId` BIGINT NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Top5List_profileId_updatedAt_idx`(`profileId` ASC, `updatedAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trendingscore` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `postId` BIGINT NOT NULL,
    `popularity` DOUBLE NOT NULL DEFAULT 0,
    `velocity` DOUBLE NOT NULL DEFAULT 0,
    `peakTime` DATETIME(3) NULL,
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `TrendingScore_computedAt_idx`(`computedAt` ASC),
    INDEX `TrendingScore_expiresAt_idx`(`expiresAt` ASC),
    INDEX `TrendingScore_popularity_idx`(`popularity` ASC),
    UNIQUE INDEX `TrendingScore_postId_key`(`postId` ASC),
    INDEX `TrendingScore_velocity_idx`(`velocity` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `User_createdAt_idx`(`createdAt` ASC),
    INDEX `User_deletedAt_idx`(`deletedAt` ASC),
    UNIQUE INDEX `User_email_key`(`email` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `useraffinityprofile` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `topCreators` JSON NULL,
    `topTopics` JSON NULL,
    `contentTypePrefs` JSON NULL,
    `engagementVelocity` DOUBLE NOT NULL DEFAULT 0,
    `explorationFactor` DOUBLE NOT NULL DEFAULT 0.5,
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UserAffinityProfile_computedAt_idx`(`computedAt` ASC),
    INDEX `UserAffinityProfile_userId_idx`(`userId` ASC),
    UNIQUE INDEX `UserAffinityProfile_userId_key`(`userId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `userblock` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `blockerId` BIGINT NOT NULL,
    `blockedId` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserBlock_blockedId_createdAt_idx`(`blockedId` ASC, `createdAt` ASC),
    UNIQUE INDEX `UserBlock_blockerId_blockedId_key`(`blockerId` ASC, `blockedId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usercompatibility` (
    `viewerUserId` BIGINT NOT NULL,
    `targetUserId` BIGINT NOT NULL,
    `status` ENUM('READY', 'INSUFFICIENT_DATA') NOT NULL DEFAULT 'INSUFFICIENT_DATA',
    `score` DOUBLE NULL,
    `algorithmVersion` VARCHAR(191) NULL,
    `reasons` JSON NULL,
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UserCompatibility_targetUserId_score_idx`(`targetUserId` ASC, `score` ASC),
    INDEX `UserCompatibility_viewerUserId_computedAt_idx`(`viewerUserId` ASC, `computedAt` ASC),
    INDEX `UserCompatibility_viewerUserId_score_idx`(`viewerUserId` ASC, `score` ASC),
    PRIMARY KEY (`viewerUserId` ASC, `targetUserId` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `userinterest` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `subjectId` BIGINT NOT NULL,
    `interestId` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserInterest_interestId_fkey`(`interestId` ASC),
    INDEX `UserInterest_subjectId_interestId_idx`(`subjectId` ASC, `interestId` ASC),
    INDEX `UserInterest_userId_createdAt_idx`(`userId` ASC, `createdAt` ASC),
    UNIQUE INDEX `UserInterest_userId_subjectId_interestId_key`(`userId` ASC, `subjectId` ASC, `interestId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `userpreference` (
    `userId` BIGINT NOT NULL,
    `preferredAgeMin` INTEGER NULL,
    `preferredAgeMax` INTEGER NULL,
    `preferredDistanceKm` INTEGER NULL,
    `preferredGenders` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `userreport` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `reporterId` BIGINT NOT NULL,
    `targetId` BIGINT NOT NULL,
    `reason` ENUM('SPAM', 'HARASSMENT', 'IMPERSONATION', 'NUDITY', 'HATE', 'OTHER') NOT NULL,
    `details` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserReport_reporterId_fkey`(`reporterId` ASC),
    INDEX `UserReport_targetId_createdAt_idx`(`targetId` ASC, `createdAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `conversation` ADD CONSTRAINT `Conversation_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `match`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversation` ADD CONSTRAINT `Conversation_userAId_fkey` FOREIGN KEY (`userAId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversation` ADD CONSTRAINT `Conversation_userBId_fkey` FOREIGN KEY (`userBId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feedseen` ADD CONSTRAINT `FeedSeen_viewerUserId_fkey` FOREIGN KEY (`viewerUserId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `interest` ADD CONSTRAINT `Interest_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `interestsubject`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `like` ADD CONSTRAINT `Like_fromUserId_fkey` FOREIGN KEY (`fromUserId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `like` ADD CONSTRAINT `Like_toUserId_fkey` FOREIGN KEY (`toUserId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `likedpost` ADD CONSTRAINT `LikedPost_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `post`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `likedpost` ADD CONSTRAINT `LikedPost_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `match` ADD CONSTRAINT `Match_userAId_fkey` FOREIGN KEY (`userAId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `match` ADD CONSTRAINT `Match_userBId_fkey` FOREIGN KEY (`userBId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `matchscore` ADD CONSTRAINT `MatchScore_candidateUserId_fkey` FOREIGN KEY (`candidateUserId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `matchscore` ADD CONSTRAINT `MatchScore_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media` ADD CONSTRAINT `Media_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media` ADD CONSTRAINT `Media_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message` ADD CONSTRAINT `Message_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `conversation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message` ADD CONSTRAINT `Message_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messagereceipt` ADD CONSTRAINT `MessageReceipt_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `message`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messagereceipt` ADD CONSTRAINT `MessageReceipt_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `post` ADD CONSTRAINT `Post_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `postfeatures` ADD CONSTRAINT `PostFeatures_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `post`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `postmedia` ADD CONSTRAINT `PostMedia_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `media`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `postmedia` ADD CONSTRAINT `PostMedia_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `post`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `presortedfeedsegment` ADD CONSTRAINT `PresortedFeedSegment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `profile` ADD CONSTRAINT `Profile_avatarMediaId_fkey` FOREIGN KEY (`avatarMediaId`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `profile` ADD CONSTRAINT `Profile_heroMediaId_fkey` FOREIGN KEY (`heroMediaId`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `profile` ADD CONSTRAINT `Profile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `profileaccess` ADD CONSTRAINT `ProfileAccess_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `profileaccess` ADD CONSTRAINT `ProfileAccess_viewerUserId_fkey` FOREIGN KEY (`viewerUserId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `profilerating` ADD CONSTRAINT `ProfileRating_raterProfileId_fkey` FOREIGN KEY (`raterProfileId`) REFERENCES `profile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `profilerating` ADD CONSTRAINT `ProfileRating_targetProfileId_fkey` FOREIGN KEY (`targetProfileId`) REFERENCES `profile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quizoption` ADD CONSTRAINT `QuizOption_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `quizquestion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quizquestion` ADD CONSTRAINT `QuizQuestion_quizId_fkey` FOREIGN KEY (`quizId`) REFERENCES `quiz`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quizresult` ADD CONSTRAINT `QuizResult_quizId_fkey` FOREIGN KEY (`quizId`) REFERENCES `quiz`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quizresult` ADD CONSTRAINT `QuizResult_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `top5item` ADD CONSTRAINT `Top5Item_listId_fkey` FOREIGN KEY (`listId`) REFERENCES `top5list`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `top5list` ADD CONSTRAINT `Top5List_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `profile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trendingscore` ADD CONSTRAINT `TrendingScore_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `post`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `useraffinityprofile` ADD CONSTRAINT `UserAffinityProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `userblock` ADD CONSTRAINT `UserBlock_blockedId_fkey` FOREIGN KEY (`blockedId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `userblock` ADD CONSTRAINT `UserBlock_blockerId_fkey` FOREIGN KEY (`blockerId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usercompatibility` ADD CONSTRAINT `UserCompatibility_targetUserId_fkey` FOREIGN KEY (`targetUserId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usercompatibility` ADD CONSTRAINT `UserCompatibility_viewerUserId_fkey` FOREIGN KEY (`viewerUserId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `userinterest` ADD CONSTRAINT `UserInterest_interestId_fkey` FOREIGN KEY (`interestId`) REFERENCES `interest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `userinterest` ADD CONSTRAINT `UserInterest_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `interestsubject`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `userinterest` ADD CONSTRAINT `UserInterest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `userpreference` ADD CONSTRAINT `UserPreference_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `userreport` ADD CONSTRAINT `UserReport_reporterId_fkey` FOREIGN KEY (`reporterId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `userreport` ADD CONSTRAINT `UserReport_targetId_fkey` FOREIGN KEY (`targetId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


