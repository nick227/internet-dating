-- AlterTable
ALTER TABLE `post` ADD COLUMN `targetProfileUserId` BIGINT NULL;

-- CreateIndex
CREATE INDEX `Post_targetProfileUserId_deletedAt_createdAt_idx` ON `Post`(`targetProfileUserId`, `deletedAt`, `createdAt`);

-- AddForeignKey
ALTER TABLE `Post` ADD CONSTRAINT `Post_targetProfileUserId_fkey` FOREIGN KEY (`targetProfileUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
