-- Add User.role column for admin access
ALTER TABLE `User`
ADD COLUMN `role` ENUM('USER', 'ADMIN', 'SUPER_ADMIN') NOT NULL DEFAULT 'USER';
