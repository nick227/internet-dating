-- CreateTable
CREATE TABLE `ProfileAccess` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `ownerUserId` BIGINT NOT NULL,
    `viewerUserId` BIGINT NOT NULL,
    `status` ENUM('PENDING', 'GRANTED', 'DENIED', 'REVOKED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `statusUpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `respondedAt` DATETIME(3) NULL,
    `decisionReason` TEXT NULL,
    `source` ENUM('PROFILE', 'INBOX', 'SYSTEM') NOT NULL DEFAULT 'PROFILE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProfileAccess_ownerUserId_status_updatedAt_idx`(`ownerUserId`, `status`, `updatedAt`),
    INDEX `ProfileAccess_viewerUserId_status_updatedAt_idx`(`viewerUserId`, `status`, `updatedAt`),
    UNIQUE INDEX `ProfileAccess_ownerUserId_viewerUserId_key`(`ownerUserId`, `viewerUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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
    `likeCount` INTEGER NOT NULL DEFAULT 0,
    `replyCount` INTEGER NOT NULL DEFAULT 0,

    INDEX `Comment_targetKind_targetId_createdAt_idx`(`targetKind`, `targetId`, `createdAt`),
    INDEX `Comment_targetKind_targetId_rootId_createdAt_idx`(`targetKind`, `targetId`, `rootId`, `createdAt`),
    INDEX `Comment_targetKind_targetId_likeCount_createdAt_idx`(`targetKind`, `targetId`, `likeCount`, `createdAt`),
    INDEX `Comment_authorId_createdAt_idx`(`authorId`, `createdAt`),
    INDEX `Comment_parentId_idx`(`parentId`),
    INDEX `Comment_rootId_idx`(`rootId`),
    UNIQUE INDEX `Comment_authorId_targetKind_targetId_clientRequestId_key`(`authorId`, `targetKind`, `targetId`, `clientRequestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CommentLike` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `commentId` BIGINT NOT NULL,
    `userId` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CommentLike_commentId_createdAt_idx`(`commentId`, `createdAt`),
    INDEX `CommentLike_userId_createdAt_idx`(`userId`, `createdAt`),
    UNIQUE INDEX `CommentLike_commentId_userId_key`(`commentId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CommentMention` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `commentId` BIGINT NOT NULL,
    `userId` BIGINT NOT NULL,

    INDEX `CommentMention_commentId_idx`(`commentId`),
    INDEX `CommentMention_userId_idx`(`userId`),
    UNIQUE INDEX `CommentMention_commentId_userId_key`(`commentId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserCompatibility` (
    `viewerUserId` BIGINT NOT NULL,
    `targetUserId` BIGINT NOT NULL,
    `status` ENUM('READY', 'INSUFFICIENT_DATA') NOT NULL DEFAULT 'INSUFFICIENT_DATA',
    `score` DOUBLE NULL,
    `algorithmVersion` VARCHAR(191) NULL,
    `reasons` JSON NULL,
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UserCompatibility_viewerUserId_score_idx`(`viewerUserId`, `score`),
    INDEX `UserCompatibility_viewerUserId_computedAt_idx`(`viewerUserId`, `computedAt`),
    INDEX `UserCompatibility_targetUserId_score_idx`(`targetUserId`, `score`),
    PRIMARY KEY (`viewerUserId`, `targetUserId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Post` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `targetProfileUserId` BIGINT NULL,
    `visibility` ENUM('PUBLIC', 'PRIVATE') NOT NULL DEFAULT 'PUBLIC',
    `text` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Post_visibility_deletedAt_createdAt_idx`(`visibility`, `deletedAt`, `createdAt`),
    INDEX `Post_userId_deletedAt_createdAt_idx`(`userId`, `deletedAt`, `createdAt`),
    INDEX `Post_targetProfileUserId_deletedAt_createdAt_idx`(`targetProfileUserId`, `deletedAt`, `createdAt`),
    INDEX `Post_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Media` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `ownerUserId` BIGINT NOT NULL,
    `type` ENUM('IMAGE', 'VIDEO', 'AUDIO') NOT NULL,
    `status` ENUM('NEW', 'PENDING_UPLOAD', 'UPLOADING', 'UPLOADED', 'FAILED_UPLOAD', 'VALIDATING', 'REJECTED', 'READY', 'PROCESSING', 'READY_WITH_VARIANTS', 'FAILED_PROCESSING', 'DELETING', 'DELETED', 'PENDING', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `visibility` ENUM('PUBLIC', 'PRIVATE') NOT NULL DEFAULT 'PUBLIC',
    `storageKey` VARCHAR(191) NULL,
    `variants` JSON NULL,
    `contentHash` VARCHAR(191) NULL,
    `mimeType` VARCHAR(191) NULL,
    `sizeBytes` INTEGER NULL,
    `url` VARCHAR(191) NOT NULL,
    `thumbUrl` VARCHAR(191) NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `durationSec` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,

    INDEX `Media_userId_deletedAt_createdAt_idx`(`userId`, `deletedAt`, `createdAt`),
    INDEX `Media_ownerUserId_deletedAt_createdAt_idx`(`ownerUserId`, `deletedAt`, `createdAt`),
    INDEX `Media_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PostMedia` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `postId` BIGINT NOT NULL,
    `mediaId` BIGINT NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    INDEX `PostMedia_postId_order_idx`(`postId`, `order`),
    INDEX `PostMedia_postId_mediaId_idx`(`postId`, `mediaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LikedPost` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `postId` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LikedPost_userId_createdAt_idx`(`userId`, `createdAt`),
    UNIQUE INDEX `LikedPost_userId_postId_key`(`userId`, `postId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FeedSeen` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `viewerUserId` BIGINT NOT NULL,
    `itemType` ENUM('POST', 'SUGGESTION') NOT NULL,
    `itemId` BIGINT NOT NULL,
    `seenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FeedSeen_viewerUserId_seenAt_idx`(`viewerUserId`, `seenAt`),
    INDEX `FeedSeen_itemType_itemId_idx`(`itemType`, `itemId`),
    UNIQUE INDEX `FeedSeen_viewerUserId_itemType_itemId_key`(`viewerUserId`, `itemType`, `itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PostFeatures` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `postId` BIGINT NOT NULL,
    `topics` JSON NULL,
    `quality` DOUBLE NULL,
    `nsfw` BOOLEAN NOT NULL DEFAULT false,
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PostFeatures_postId_key`(`postId`),
    INDEX `PostFeatures_quality_idx`(`quality`),
    INDEX `PostFeatures_nsfw_idx`(`nsfw`),
    INDEX `PostFeatures_computedAt_idx`(`computedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TrendingScore` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `postId` BIGINT NOT NULL,
    `popularity` DOUBLE NOT NULL DEFAULT 0,
    `velocity` DOUBLE NOT NULL DEFAULT 0,
    `peakTime` DATETIME(3) NULL,
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TrendingScore_postId_key`(`postId`),
    INDEX `TrendingScore_popularity_idx`(`popularity`),
    INDEX `TrendingScore_velocity_idx`(`velocity`),
    INDEX `TrendingScore_expiresAt_idx`(`expiresAt`),
    INDEX `TrendingScore_computedAt_idx`(`computedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserAffinityProfile` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `topCreators` JSON NULL,
    `topTopics` JSON NULL,
    `contentTypePrefs` JSON NULL,
    `engagementVelocity` DOUBLE NOT NULL DEFAULT 0,
    `explorationFactor` DOUBLE NOT NULL DEFAULT 0.5,
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserAffinityProfile_userId_key`(`userId`),
    INDEX `UserAffinityProfile_userId_idx`(`userId`),
    INDEX `UserAffinityProfile_computedAt_idx`(`computedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InterestSubject` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `InterestSubject_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Interest` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `subjectId` BIGINT NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Interest_subjectId_key_idx`(`subjectId`, `key`),
    UNIQUE INDEX `Interest_subjectId_key_key`(`subjectId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserInterest` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `subjectId` BIGINT NOT NULL,
    `interestId` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserInterest_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `UserInterest_subjectId_interestId_idx`(`subjectId`, `interestId`),
    UNIQUE INDEX `UserInterest_userId_subjectId_interestId_key`(`userId`, `subjectId`, `interestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MatchScore` (
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
    `tier` VARCHAR(191) NULL,
    `scoredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MatchScore_userId_score_idx`(`userId`, `score`),
    INDEX `MatchScore_userId_scoredAt_idx`(`userId`, `scoredAt`),
    INDEX `MatchScore_userId_tier_idx`(`userId`, `tier`),
    PRIMARY KEY (`userId`, `candidateUserId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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

-- CreateTable
CREATE TABLE `JobRun` (
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

    INDEX `JobRun_jobName_status_idx`(`jobName`, `status`),
    INDEX `JobRun_jobName_startedAt_idx`(`jobName`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Like` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `fromUserId` BIGINT NOT NULL,
    `toUserId` BIGINT NOT NULL,
    `action` ENUM('LIKE', 'DISLIKE') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Like_toUserId_action_createdAt_idx`(`toUserId`, `action`, `createdAt`),
    INDEX `Like_fromUserId_createdAt_idx`(`fromUserId`, `createdAt`),
    UNIQUE INDEX `Like_fromUserId_toUserId_key`(`fromUserId`, `toUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Match` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userAId` BIGINT NOT NULL,
    `userBId` BIGINT NOT NULL,
    `state` ENUM('ACTIVE', 'BLOCKED', 'CLOSED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `closedAt` DATETIME(3) NULL,

    INDEX `Match_state_updatedAt_idx`(`state`, `updatedAt`),
    UNIQUE INDEX `Match_userAId_userBId_key`(`userAId`, `userBId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Conversation` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `matchId` BIGINT NULL,
    `userAId` BIGINT NOT NULL,
    `userBId` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Conversation_matchId_key`(`matchId`),
    INDEX `Conversation_updatedAt_idx`(`updatedAt`),
    INDEX `Conversation_userAId_updatedAt_idx`(`userAId`, `updatedAt`),
    INDEX `Conversation_userBId_updatedAt_idx`(`userBId`, `updatedAt`),
    UNIQUE INDEX `Conversation_userAId_userBId_key`(`userAId`, `userBId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Message` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `conversationId` BIGINT NOT NULL,
    `senderId` BIGINT NOT NULL,
    `body` TEXT NOT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `followRequestId` BIGINT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,

    INDEX `Message_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    INDEX `Message_senderId_createdAt_idx`(`senderId`, `createdAt`),
    INDEX `Message_followRequestId_idx`(`followRequestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MessageReceipt` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `messageId` BIGINT NOT NULL,
    `userId` BIGINT NOT NULL,
    `readAt` DATETIME(3) NULL,

    INDEX `MessageReceipt_userId_readAt_idx`(`userId`, `readAt`),
    UNIQUE INDEX `MessageReceipt_messageId_userId_key`(`messageId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConversationUserState` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `conversationId` BIGINT NOT NULL,
    `userId` BIGINT NOT NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ConversationUserState_userId_deletedAt_idx`(`userId`, `deletedAt`),
    UNIQUE INDEX `ConversationUserState_conversationId_userId_key`(`conversationId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserPreference` (
    `userId` BIGINT NOT NULL,
    `preferredAgeMin` INTEGER NULL,
    `preferredAgeMax` INTEGER NULL,
    `preferredDistanceKm` INTEGER NULL,
    `preferredGenders` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PresortedFeedSegment` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `segmentIndex` INTEGER NOT NULL,
    `items` JSON NOT NULL,
    `phase1Json` TEXT NULL,
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `algorithmVersion` VARCHAR(191) NOT NULL DEFAULT 'v1',
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `PresortedFeedSegment_userId_expiresAt_idx`(`userId`, `expiresAt`),
    INDEX `PresortedFeedSegment_expiresAt_idx`(`expiresAt`),
    UNIQUE INDEX `PresortedFeedSegment_userId_segmentIndex_key`(`userId`, `segmentIndex`),
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
CREATE TABLE `Quiz` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Quiz_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuizTag` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `QuizTag_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuizQuestion` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `quizId` BIGINT NOT NULL,
    `prompt` TEXT NOT NULL,
    `order` INTEGER NOT NULL,

    UNIQUE INDEX `QuizQuestion_quizId_order_key`(`quizId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuizOption` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `questionId` BIGINT NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL,
    `traitValues` JSON NULL,

    UNIQUE INDEX `QuizOption_questionId_order_key`(`questionId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuizResult` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `quizId` BIGINT NOT NULL,
    `answers` JSON NOT NULL,
    `scoreVec` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `QuizResult_userId_quizId_key`(`userId`, `quizId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuizAnswerStats` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `quizId` BIGINT NOT NULL,
    `questionId` BIGINT NOT NULL,
    `optionValue` VARCHAR(191) NOT NULL,
    `dimension` VARCHAR(191) NOT NULL,
    `bucket` VARCHAR(191) NOT NULL,
    `count` INTEGER NOT NULL,
    `total` INTEGER NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `QuizAnswerStats_quizId_questionId_optionValue_dimension_idx`(`quizId`, `questionId`, `optionValue`, `dimension`),
    INDEX `QuizAnswerStats_dimension_bucket_idx`(`dimension`, `bucket`),
    UNIQUE INDEX `QuizAnswerStats_quizId_questionId_optionValue_dimension_buck_key`(`quizId`, `questionId`, `optionValue`, `dimension`, `bucket`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProfileRating` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `raterProfileId` BIGINT NOT NULL,
    `targetProfileId` BIGINT NOT NULL,
    `attractive` INTEGER NOT NULL,
    `smart` INTEGER NOT NULL,
    `funny` INTEGER NOT NULL,
    `interesting` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProfileRating_targetProfileId_createdAt_idx`(`targetProfileId`, `createdAt`),
    UNIQUE INDEX `ProfileRating_raterProfileId_targetProfileId_key`(`raterProfileId`, `targetProfileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Top5List` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `profileId` BIGINT NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Top5List_profileId_updatedAt_idx`(`profileId`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Top5Item` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `listId` BIGINT NOT NULL,
    `order` INTEGER NOT NULL,
    `text` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Top5Item_listId_order_key`(`listId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserBlock` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `blockerId` BIGINT NOT NULL,
    `blockedId` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserBlock_blockedId_createdAt_idx`(`blockedId`, `createdAt`),
    UNIQUE INDEX `UserBlock_blockerId_blockedId_key`(`blockerId`, `blockedId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserReport` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `reporterId` BIGINT NOT NULL,
    `targetId` BIGINT NOT NULL,
    `reason` ENUM('SPAM', 'HARASSMENT', 'IMPERSONATION', 'NUDITY', 'HATE', 'OTHER') NOT NULL,
    `details` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserReport_targetId_createdAt_idx`(`targetId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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

-- CreateTable
CREATE TABLE `User` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_createdAt_idx`(`createdAt`),
    INDEX `User_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Profile` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `avatarMediaId` BIGINT NULL,
    `heroMediaId` BIGINT NULL,
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

    UNIQUE INDEX `Profile_userId_key`(`userId`),
    INDEX `Profile_isVisible_intent_locationText_idx`(`isVisible`, `intent`, `locationText`),
    INDEX `Profile_avatarMediaId_idx`(`avatarMediaId`),
    INDEX `Profile_heroMediaId_idx`(`heroMediaId`),
    INDEX `Profile_lat_lng_idx`(`lat`, `lng`),
    INDEX `Profile_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserTrait` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `traitKey` VARCHAR(191) NOT NULL,
    `value` DECIMAL(10, 2) NOT NULL,
    `n` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UserTrait_userId_idx`(`userId`),
    INDEX `UserTrait_traitKey_idx`(`traitKey`),
    UNIQUE INDEX `UserTrait_userId_traitKey_key`(`userId`, `traitKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_QuizToQuizTag` (
    `A` BIGINT NOT NULL,
    `B` BIGINT NOT NULL,

    UNIQUE INDEX `_QuizToQuizTag_AB_unique`(`A`, `B`),
    INDEX `_QuizToQuizTag_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProfileAccess` ADD CONSTRAINT `ProfileAccess_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProfileAccess` ADD CONSTRAINT `ProfileAccess_viewerUserId_fkey` FOREIGN KEY (`viewerUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Comment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommentLike` ADD CONSTRAINT `CommentLike_commentId_fkey` FOREIGN KEY (`commentId`) REFERENCES `Comment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommentLike` ADD CONSTRAINT `CommentLike_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommentMention` ADD CONSTRAINT `CommentMention_commentId_fkey` FOREIGN KEY (`commentId`) REFERENCES `Comment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommentMention` ADD CONSTRAINT `CommentMention_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserCompatibility` ADD CONSTRAINT `UserCompatibility_viewerUserId_fkey` FOREIGN KEY (`viewerUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserCompatibility` ADD CONSTRAINT `UserCompatibility_targetUserId_fkey` FOREIGN KEY (`targetUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Post` ADD CONSTRAINT `Post_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Post` ADD CONSTRAINT `Post_targetProfileUserId_fkey` FOREIGN KEY (`targetProfileUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Media` ADD CONSTRAINT `Media_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Media` ADD CONSTRAINT `Media_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PostMedia` ADD CONSTRAINT `PostMedia_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PostMedia` ADD CONSTRAINT `PostMedia_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `Media`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LikedPost` ADD CONSTRAINT `LikedPost_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LikedPost` ADD CONSTRAINT `LikedPost_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeedSeen` ADD CONSTRAINT `FeedSeen_viewerUserId_fkey` FOREIGN KEY (`viewerUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PostFeatures` ADD CONSTRAINT `PostFeatures_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TrendingScore` ADD CONSTRAINT `TrendingScore_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserAffinityProfile` ADD CONSTRAINT `UserAffinityProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Interest` ADD CONSTRAINT `Interest_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `InterestSubject`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserInterest` ADD CONSTRAINT `UserInterest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserInterest` ADD CONSTRAINT `UserInterest_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `InterestSubject`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserInterest` ADD CONSTRAINT `UserInterest_interestId_fkey` FOREIGN KEY (`interestId`) REFERENCES `Interest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MatchScore` ADD CONSTRAINT `MatchScore_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MatchScore` ADD CONSTRAINT `MatchScore_candidateUserId_fkey` FOREIGN KEY (`candidateUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE `Like` ADD CONSTRAINT `Like_fromUserId_fkey` FOREIGN KEY (`fromUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Like` ADD CONSTRAINT `Like_toUserId_fkey` FOREIGN KEY (`toUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Match` ADD CONSTRAINT `Match_userAId_fkey` FOREIGN KEY (`userAId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Match` ADD CONSTRAINT `Match_userBId_fkey` FOREIGN KEY (`userBId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Conversation` ADD CONSTRAINT `Conversation_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Conversation` ADD CONSTRAINT `Conversation_userAId_fkey` FOREIGN KEY (`userAId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Conversation` ADD CONSTRAINT `Conversation_userBId_fkey` FOREIGN KEY (`userBId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_followRequestId_fkey` FOREIGN KEY (`followRequestId`) REFERENCES `ProfileAccess`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MessageReceipt` ADD CONSTRAINT `MessageReceipt_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MessageReceipt` ADD CONSTRAINT `MessageReceipt_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConversationUserState` ADD CONSTRAINT `ConversationUserState_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConversationUserState` ADD CONSTRAINT `ConversationUserState_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserPreference` ADD CONSTRAINT `UserPreference_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PresortedFeedSegment` ADD CONSTRAINT `PresortedFeedSegment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeedQuestion` ADD CONSTRAINT `FeedQuestion_quizId_fkey` FOREIGN KEY (`quizId`) REFERENCES `Quiz`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeedQuestion` ADD CONSTRAINT `FeedQuestion_quizQuestionId_fkey` FOREIGN KEY (`quizQuestionId`) REFERENCES `QuizQuestion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuizQuestion` ADD CONSTRAINT `QuizQuestion_quizId_fkey` FOREIGN KEY (`quizId`) REFERENCES `Quiz`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuizOption` ADD CONSTRAINT `QuizOption_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `QuizQuestion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuizResult` ADD CONSTRAINT `QuizResult_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuizResult` ADD CONSTRAINT `QuizResult_quizId_fkey` FOREIGN KEY (`quizId`) REFERENCES `Quiz`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuizAnswerStats` ADD CONSTRAINT `QuizAnswerStats_quizId_fkey` FOREIGN KEY (`quizId`) REFERENCES `Quiz`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuizAnswerStats` ADD CONSTRAINT `QuizAnswerStats_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `QuizQuestion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProfileRating` ADD CONSTRAINT `ProfileRating_raterProfileId_fkey` FOREIGN KEY (`raterProfileId`) REFERENCES `Profile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProfileRating` ADD CONSTRAINT `ProfileRating_targetProfileId_fkey` FOREIGN KEY (`targetProfileId`) REFERENCES `Profile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Top5List` ADD CONSTRAINT `Top5List_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `Profile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Top5Item` ADD CONSTRAINT `Top5Item_listId_fkey` FOREIGN KEY (`listId`) REFERENCES `Top5List`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserBlock` ADD CONSTRAINT `UserBlock_blockerId_fkey` FOREIGN KEY (`blockerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserBlock` ADD CONSTRAINT `UserBlock_blockedId_fkey` FOREIGN KEY (`blockedId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserReport` ADD CONSTRAINT `UserReport_reporterId_fkey` FOREIGN KEY (`reporterId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserReport` ADD CONSTRAINT `UserReport_targetId_fkey` FOREIGN KEY (`targetId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE `PostStats` ADD CONSTRAINT `PostStats_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProfileStats` ADD CONSTRAINT `ProfileStats_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `Profile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Profile` ADD CONSTRAINT `Profile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Profile` ADD CONSTRAINT `Profile_avatarMediaId_fkey` FOREIGN KEY (`avatarMediaId`) REFERENCES `Media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Profile` ADD CONSTRAINT `Profile_heroMediaId_fkey` FOREIGN KEY (`heroMediaId`) REFERENCES `Media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserTrait` ADD CONSTRAINT `UserTrait_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_QuizToQuizTag` ADD CONSTRAINT `_QuizToQuizTag_A_fkey` FOREIGN KEY (`A`) REFERENCES `Quiz`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_QuizToQuizTag` ADD CONSTRAINT `_QuizToQuizTag_B_fkey` FOREIGN KEY (`B`) REFERENCES `QuizTag`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
