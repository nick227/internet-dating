-- DropIndex
DROP INDEX `PostMedia_postId_mediaId_key` ON `postmedia`;

-- CreateIndex
CREATE INDEX `PostMedia_postId_mediaId_idx` ON `PostMedia`(`postId`, `mediaId`);
