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

-- AddForeignKey
ALTER TABLE `QuizAnswerStats` ADD CONSTRAINT `QuizAnswerStats_quizId_fkey` FOREIGN KEY (`quizId`) REFERENCES `Quiz`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuizAnswerStats` ADD CONSTRAINT `QuizAnswerStats_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `QuizQuestion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
