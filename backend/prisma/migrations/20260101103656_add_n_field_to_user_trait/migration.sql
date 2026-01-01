-- AlterTable
ALTER TABLE `usertrait` ADD COLUMN `n` INTEGER NOT NULL DEFAULT 1;

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

-- AddForeignKey
ALTER TABLE `ConversationUserState` ADD CONSTRAINT `ConversationUserState_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConversationUserState` ADD CONSTRAINT `ConversationUserState_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
