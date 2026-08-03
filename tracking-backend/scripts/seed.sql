-- Sample data for local development and smoke testing.
--
-- Idempotent: re-running updates the sample rows rather than erroring.
-- Run after schema.sql (`make db-seed`).
--
-- ALL PASSWORDS BELOW ARE 'password123'. Development only — never load this
-- into a production database.
--
-- The bcrypt hash is fixed rather than generated so the file is deterministic
-- and needs no tooling. To mint your own:
--     make create-user PHONE=09120000000 PASSWORD=... ROLE=user

BEGIN;

-- ---------------------------------------------------------------- users
INSERT INTO users (phone, password_hash, role) VALUES
    ('admin',       '$2a$10$TGWE7cOYHHdT.80IpfmtQuvjShU73og6mRhBkq.Ohy/GrGwBkNeta', 'admin'),
    ('09120000001', '$2a$10$TGWE7cOYHHdT.80IpfmtQuvjShU73og6mRhBkq.Ohy/GrGwBkNeta', 'user'),
    ('09120000002', '$2a$10$TGWE7cOYHHdT.80IpfmtQuvjShU73og6mRhBkq.Ohy/GrGwBkNeta', 'user')
ON CONFLICT (phone) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        role          = EXCLUDED.role;

-- -------------------------------------------------------------- devices
-- DEVICEADMIN / 357951 match the constants in GPS-SIM800C-MQTT-DC.ino, so
-- real hardware flashed with that firmware works against a seeded database.
INSERT INTO devices (serial, device_secret, user_id, is_active, activated_at, created_by)
VALUES
    ('DEVICEADMIN',
     '357951',
     (SELECT id FROM users WHERE phone = 'admin'),
     TRUE,
     NOW(),
     (SELECT id FROM users WHERE phone = 'admin')),

    ('TRACKER-001',
     'secret-001',
     (SELECT id FROM users WHERE phone = '09120000001'),
     TRUE,
     NOW(),
     (SELECT id FROM users WHERE phone = 'admin')),

    ('TRACKER-002',
     'secret-002',
     (SELECT id FROM users WHERE phone = '09120000002'),
     TRUE,
     NOW(),
     (SELECT id FROM users WHERE phone = 'admin')),

    -- Unassigned and inactive: exercises the activation flow end to end.
    ('TRACKER-003',
     'secret-003',
     NULL,
     FALSE,
     NULL,
     (SELECT id FROM users WHERE phone = 'admin'))
ON CONFLICT (serial) DO UPDATE
    SET device_secret = EXCLUDED.device_secret,
        user_id       = EXCLUDED.user_id,
        is_active     = EXCLUDED.is_active,
        activated_at  = EXCLUDED.activated_at;

-- ----------------------------------------------------- location_history
-- A short synthetic track heading north-east across Tehran, one point per
-- minute for the last two hours, so history and map rendering have data.
DELETE FROM location_history WHERE device_serial IN ('DEVICEADMIN', 'TRACKER-001');

INSERT INTO location_history
    (device_serial, lat, lng, speed, satellites, csq, battery, ignition, recorded_at)
SELECT
    'DEVICEADMIN',
    35.6892 + (i * 0.0008),
    51.3890 + (i * 0.0011),
    (40 + (i % 35))::INT,
    (6 + (i % 5))::INT,
    (14 + (i % 12))::INT,
    round((12.6 - (i * 0.006))::NUMERIC, 2)::DOUBLE PRECISION,
    TRUE,
    NOW() - ((120 - i) * INTERVAL '1 minute')
FROM generate_series(0, 119) AS s(i);

INSERT INTO location_history
    (device_serial, lat, lng, speed, satellites, csq, battery, ignition, recorded_at)
SELECT
    'TRACKER-001',
    35.7100 - (i * 0.0005),
    51.4100 + (i * 0.0004),
    (0 + (i % 20))::INT,
    (4 + (i % 6))::INT,
    (10 + (i % 15))::INT,
    round((12.2 - (i * 0.004))::NUMERIC, 2)::DOUBLE PRECISION,
    (i % 4 <> 0),
    NOW() - ((60 - i) * INTERVAL '1 minute')
FROM generate_series(0, 59) AS s(i);

COMMIT;

\echo ''
\echo 'Seed complete. Sample credentials (password: password123):'
\echo '  admin       / password123   (role: admin)'
\echo '  09120000001 / password123   (owns TRACKER-001)'
\echo '  09120000002 / password123   (owns TRACKER-002)'
\echo ''
\echo 'Devices: DEVICEADMIN(357951), TRACKER-001, TRACKER-002, TRACKER-003(unassigned)'
\echo ''
