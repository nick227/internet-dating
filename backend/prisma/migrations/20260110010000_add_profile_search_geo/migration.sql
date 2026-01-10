ALTER TABLE `ProfileSearchIndex`
  ADD COLUMN `lat` DOUBLE NULL,
  ADD COLUMN `lng` DOUBLE NULL,
  ADD COLUMN `hasLocation` BOOLEAN NOT NULL DEFAULT false,
  ADD INDEX `ProfileSearchIndex_hasLocation_lat_lng_idx` (`hasLocation`, `lat`, `lng`);
