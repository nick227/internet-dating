-- Science Page Schema Migration
-- Creates views and tables for the /science analytics page

-- ============================================================================
-- VIEW: v_match_explainer
-- Derives detailed match explanations from existing data (live computation)
-- ============================================================================
CREATE OR REPLACE VIEW v_match_explainer AS
SELECT 
  ms.userId as user1_id,
  ms.candidateUserId as user2_id,
  ms.score as match_score,
  ms.scoreQuiz as score_quiz,
  ms.scoreInterests as score_interests,
  ms.scoreNearby as score_proximity,
  ms.scoreRatingsQuality as score_ratings,
  ms.tier,
  ms.distanceKm as distance_km,
  ms.algorithmVersion as algorithm_version,
  ms.scoredAt as scored_at,
  ms.createdAt as created_at,
  
  -- User info
  u1.email as user1_email,
  u2.email as user2_email,
  
  -- Shared interests (aggregated)
  GROUP_CONCAT(DISTINCT CASE 
    WHEN ui1.interestId IS NOT NULL AND ui2.interestId IS NOT NULL 
    THEN ui1.interestId 
  END ORDER BY ui1.interestId SEPARATOR ',') as shared_interest_ids,
  
  COUNT(DISTINCT CASE 
    WHEN ui1.interestId IS NOT NULL AND ui2.interestId IS NOT NULL 
    THEN ui1.interestId 
  END) as shared_interest_count,
  
  -- Match status (if they matched)
  m.id IS NOT NULL as is_matched,
  m.state as match_state,
  m.createdAt as matched_at
  
FROM MatchScore ms
INNER JOIN User u1 ON ms.userId = u1.id
INNER JOIN User u2 ON ms.candidateUserId = u2.id
LEFT JOIN UserInterest ui1 ON ui1.userId = u1.id
LEFT JOIN UserInterest ui2 ON ui2.userId = u2.id AND ui2.interestId = ui1.interestId
LEFT JOIN `Match` m ON (
  (m.userAId = ms.userId AND m.userBId = ms.candidateUserId) OR
  (m.userAId = ms.candidateUserId AND m.userBId = ms.userId)
)
GROUP BY 
  ms.userId, ms.candidateUserId, ms.score, ms.scoreQuiz, ms.scoreInterests, 
  ms.scoreNearby, ms.scoreRatingsQuality, ms.tier, ms.distanceKm, 
  ms.algorithmVersion, ms.scoredAt, ms.createdAt,
  u1.email, u2.email, m.id, m.state, m.createdAt;

-- ============================================================================
-- VIEW: v_interest_popularity
-- Live interest statistics from existing data
-- ============================================================================
CREATE OR REPLACE VIEW v_interest_popularity AS
SELECT 
  i.id as interest_id,
  i.label as interest_name,
  i.key as interest_key,
  s.label as subject_name,
  COUNT(DISTINCT ui.userId) as total_users,
  ROUND(100.0 * COUNT(DISTINCT ui.userId) / NULLIF(
    (SELECT COUNT(*) FROM User WHERE deletedAt IS NULL), 
    0
  ), 2) as percentage
FROM Interest i
INNER JOIN InterestSubject s ON i.subjectId = s.id
LEFT JOIN UserInterest ui ON ui.interestId = i.id
GROUP BY i.id, i.label, i.key, s.label
ORDER BY total_users DESC;

-- ============================================================================
-- TABLE: science_sample_pairs
-- Stores sampled representative match pairs (IDs only, explanations from views)
-- ============================================================================
CREATE TABLE `science_sample_pairs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user1Id` BIGINT NOT NULL,
  `user2Id` BIGINT NOT NULL,
  `matchScore` DECIMAL(5,2) NOT NULL,
  `sampleCategory` ENUM('BEST', 'MIDDLE', 'WORST') NOT NULL,
  `sampledAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  
  INDEX `science_sample_pairs_category_score_idx`(`sampleCategory`, `matchScore` DESC),
  INDEX `science_sample_pairs_sampled_idx`(`sampledAt` DESC),
  UNIQUE INDEX `science_sample_pairs_users_key`(`user1Id`, `user2Id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- TABLE: science_daily_stats
-- Daily platform-wide aggregate statistics
-- ============================================================================
CREATE TABLE `science_daily_stats` (
  `statDate` DATE NOT NULL,
  
  -- Match score distribution (histogram buckets)
  `scoreDist0to20` INT NOT NULL DEFAULT 0,
  `scoreDist20to40` INT NOT NULL DEFAULT 0,
  `scoreDist40to60` INT NOT NULL DEFAULT 0,
  `scoreDist60to80` INT NOT NULL DEFAULT 0,
  `scoreDist80to100` INT NOT NULL DEFAULT 0,
  
  `avgMatchScore` DECIMAL(5,2) NULL,
  `medianMatchScore` DECIMAL(5,2) NULL,
  `totalMatchPairs` INT NOT NULL DEFAULT 0,
  
  -- Connection metrics
  `totalMatches` INT NOT NULL DEFAULT 0,
  `matchRate` DECIMAL(5,2) NULL,
  `avgDaysToMatch` DECIMAL(5,2) NULL,
  
  -- Interest metrics
  `avgInterestsPerUser` DECIMAL(5,2) NULL,
  `mostPopularInterests` JSON NULL,
  
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  
  PRIMARY KEY (`statDate`),
  INDEX `science_daily_stats_date_idx`(`statDate` DESC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- TABLE: science_interest_correlations
-- Precalculated interest correlation matrix
-- ============================================================================
CREATE TABLE `science_interest_correlations` (
  `interestAId` BIGINT NOT NULL,
  `interestBId` BIGINT NOT NULL,
  
  -- Correlation metrics
  `sharedUserCount` INT NOT NULL DEFAULT 0,
  `correlationScore` DECIMAL(5,4) NULL, -- Jaccard similarity
  `avgMatchScore` DECIMAL(5,2) NULL,    -- Avg match score for users sharing both
  
  `updatedAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  
  PRIMARY KEY (`interestAId`, `interestBId`),
  INDEX `science_interest_correlations_score_idx`(`correlationScore` DESC),
  CONSTRAINT `science_interest_correlations_check` CHECK (`interestAId` < `interestBId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `science_sample_pairs` ADD CONSTRAINT `science_sample_pairs_user1Id_fkey` FOREIGN KEY (`user1Id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `science_sample_pairs` ADD CONSTRAINT `science_sample_pairs_user2Id_fkey` FOREIGN KEY (`user2Id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `science_interest_correlations` ADD CONSTRAINT `science_interest_correlations_interestAId_fkey` FOREIGN KEY (`interestAId`) REFERENCES `Interest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `science_interest_correlations` ADD CONSTRAINT `science_interest_correlations_interestBId_fkey` FOREIGN KEY (`interestBId`) REFERENCES `Interest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
