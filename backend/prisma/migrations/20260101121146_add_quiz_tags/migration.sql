-- CreateTable
CREATE TABLE `QuizTag` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `QuizTag_slug_key`(`slug`),
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
ALTER TABLE `_QuizToQuizTag` ADD CONSTRAINT `_QuizToQuizTag_A_fkey` FOREIGN KEY (`A`) REFERENCES `Quiz`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_QuizToQuizTag` ADD CONSTRAINT `_QuizToQuizTag_B_fkey` FOREIGN KEY (`B`) REFERENCES `QuizTag`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
