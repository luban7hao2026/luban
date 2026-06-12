-- 004: enforce one food name per user at the database level.
--
-- The unique key relies on the column's default case-insensitive collation
-- (utf8mb4_0900_ai_ci / utf8mb4_general_ci), so it also rejects names that
-- differ only by letter case.
--
-- IMPORTANT: existing duplicate (user_id, name) rows must be removed BEFORE
-- running the ALTER below, otherwise it fails with errno 1062. Inspect them
-- first:
--
--   SELECT user_id, LOWER(name) AS lname, COUNT(*) AS c, GROUP_CONCAT(id ORDER BY id) AS ids
--   FROM foods
--   GROUP BY user_id, LOWER(name)
--   HAVING c > 1;
--
-- Clean them up so each (user_id, lower(name)) keeps a single row (e.g. the
-- lowest id), deleting the related pick_logs of the removed foods first.

ALTER TABLE foods
  ADD UNIQUE KEY uq_foods_user_name (user_id, name);
