-- AlterTable
ALTER TABLE `comment` ADD COLUMN `likeCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `replyCount` INTEGER NOT NULL DEFAULT 0;

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

-- CreateIndex
CREATE INDEX `Comment_targetKind_targetId_likeCount_createdAt_idx` ON `Comment`(`targetKind`, `targetId`, `likeCount`, `createdAt`);

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
