-- ============================================================
-- POLARLOG - Real password hashes for the seeded demo users
-- Run this ONCE against your existing database. Replaces the
-- 'REPLACE_WITH_GENERATED_HASH' placeholders from seed.sql with
-- real werkzeug scrypt hashes, generated with the exact same
-- werkzeug.security.generate_password_hash() that auth.py
-- verifies against.
--
-- Demo credentials (username / password):
--   admin        / admin2026
--   coord        / coord2026
--   bhr_office   / bharati2026
--   mtr_office   / maitri2026
--   hmd_office   / himadri2026
-- ============================================================

USE polarlog;

UPDATE users SET password_hash = 'scrypt:32768:8:1$rw9oFVRG93OeBvtw$3942f512acc75d4954671d446f89d6fdda868fa5fa218ff375568719d508570513f13e84f44fb5a49e267896533ef88b0cd004f89521f093917c3d1561774f62' WHERE username = 'admin';
UPDATE users SET password_hash = 'scrypt:32768:8:1$5TaT2d6KgdCLDCQl$b8b631b5ad2c58f9f84d08c3c92633aefb94bd8aae6bb0725a18558c1dac6bcc37bbd7142a6b23068e02d4d372b7dfad69cd265a404000a7e134c4271e6af6c7' WHERE username = 'coord';
UPDATE users SET password_hash = 'scrypt:32768:8:1$ZSdNnPjsSdS0ah7Z$d0eb77d84bb763f31b195a2d98bc6f294e68396ec701b385f2fdd558307d8621b7e7c0d7652f38532d2f875ec0a9f11cd38b90518b25089d08bb4e9d7f6747e3' WHERE username = 'bhr_office';
UPDATE users SET password_hash = 'scrypt:32768:8:1$y2x2DR8k4OjXrq3O$a421e72875e4e322b43d0fddca4c2011ee537fa92e00837f6816767523ebae66ab3e7d78e410c8fd3497386e9dedc807216251026956c48865de04ceb88e6cb8' WHERE username = 'mtr_office';
UPDATE users SET password_hash = 'scrypt:32768:8:1$3aW96ffX41XW3Cxr$21c9d654e1f14bd57ea50a9359615d74ac9f2ec0f4ed5afc8dcde74d4c61750816017e3d6b479b9c3af3341ec8dc458e185717ffa9ebbd989db10d1af73170b2' WHERE username = 'hmd_office';

-- Sanity check - should show real hashes now, not placeholders.
SELECT username, LEFT(password_hash, 20) AS hash_preview, role FROM users;
