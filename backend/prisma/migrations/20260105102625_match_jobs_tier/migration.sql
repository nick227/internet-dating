-- AlterTable
ALTER TABLE `matchscore` ADD COLUMN `tier` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `MatchScore_userId_tier_idx` ON `MatchScore`(`userId`, `tier`);
