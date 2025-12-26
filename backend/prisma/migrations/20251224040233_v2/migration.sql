/*
  Warnings:

  - You are about to drop the `savedpost` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `swipe` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `savedpost` DROP FOREIGN KEY `SavedPost_postId_fkey`;

-- DropForeignKey
ALTER TABLE `savedpost` DROP FOREIGN KEY `SavedPost_userId_fkey`;

-- DropForeignKey
ALTER TABLE `swipe` DROP FOREIGN KEY `Swipe_fromUserId_fkey`;

-- DropForeignKey
ALTER TABLE `swipe` DROP FOREIGN KEY `Swipe_toUserId_fkey`;

-- DropTable
DROP TABLE `savedpost`;

-- DropTable
DROP TABLE `swipe`;

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

-- AddForeignKey
ALTER TABLE `LikedPost` ADD CONSTRAINT `LikedPost_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LikedPost` ADD CONSTRAINT `LikedPost_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Like` ADD CONSTRAINT `Like_fromUserId_fkey` FOREIGN KEY (`fromUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Like` ADD CONSTRAINT `Like_toUserId_fkey` FOREIGN KEY (`toUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
