ALTER TABLE `Profile`
  ADD COLUMN `geoPrecision` ENUM('EXACT','CITY','STATE','UNKNOWN') NULL,
  ADD COLUMN `locationAccuracy` ENUM('FRESH','STALE') NULL;

ALTER TABLE `ProfileSearchIndex`
  ADD COLUMN `geoPrecision` ENUM('EXACT','CITY','STATE','UNKNOWN') NULL,
  ADD COLUMN `locationAccuracy` ENUM('FRESH','STALE') NULL;
