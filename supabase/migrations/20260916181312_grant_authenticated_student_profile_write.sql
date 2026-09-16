-- Historical marker only.
-- This migration version was applied transiently during a production privilege audit,
-- then superseded by 20260916181501_restore_column_scoped_student_profile_write.sql.
-- Do not replay the broader table-level INSERT/UPDATE grants on fresh environments;
-- the existing column-scoped grants are the intended security model.
select 1;
