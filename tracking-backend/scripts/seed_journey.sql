-- A realistic day of driving for TRACKER-002, used to exercise the history
-- and stop-detection views.
--
--   make db-journey
--
-- Builds a track with three genuine stops separated by driving legs, plus a
-- short traffic-light pause that must NOT be reported as a stop. Points are
-- 30 seconds apart, matching the firmware's publish interval.

BEGIN;

DELETE FROM location_history WHERE device_serial = 'TRACKER-002';

-- Leg 1: parked overnight at home, 08:00-08:45 (45 min stop, with drift)
INSERT INTO location_history
    (device_serial, lat, lng, speed, satellites, csq, battery, ignition, recorded_at)
SELECT
    'TRACKER-002',
    35.70000 + (random() - 0.5) * 0.0004,   -- ~20 m of GPS jitter
    51.39000 + (random() - 0.5) * 0.0004,
    0, 7, 18, 12.6, FALSE,
    NOW() - INTERVAL '9 hours' + (i * INTERVAL '30 seconds')
FROM generate_series(0, 89) AS s(i);

-- Leg 2: driving north-east, 08:45-09:15
INSERT INTO location_history
    (device_serial, lat, lng, speed, satellites, csq, battery, ignition, recorded_at)
SELECT
    'TRACKER-002',
    35.70000 + (i * 0.00060),
    51.39000 + (i * 0.00085),
    35 + (i % 40), 9, 22, 12.9, TRUE,
    NOW() - INTERVAL '8 hours 15 minutes' + (i * INTERVAL '30 seconds')
FROM generate_series(0, 59) AS s(i);

-- Traffic light: 90 seconds stationary. Below the 3-minute default, so it
-- must not appear as a stop.
INSERT INTO location_history
    (device_serial, lat, lng, speed, satellites, csq, battery, ignition, recorded_at)
SELECT
    'TRACKER-002',
    35.73600 + (random() - 0.5) * 0.00006,
    51.44100 + (random() - 0.5) * 0.00006,
    0, 9, 21, 12.9, TRUE,
    NOW() - INTERVAL '7 hours 45 minutes' + (i * INTERVAL '30 seconds')
FROM generate_series(0, 2) AS s(i);

-- Leg 3: continue to the office, 09:17-09:35
INSERT INTO location_history
    (device_serial, lat, lng, speed, satellites, csq, battery, ignition, recorded_at)
SELECT
    'TRACKER-002',
    35.73600 + (i * 0.00055),
    51.44100 + (i * 0.00070),
    40 + (i % 30), 10, 24, 12.8, TRUE,
    NOW() - INTERVAL '7 hours 43 minutes' + (i * INTERVAL '30 seconds')
FROM generate_series(0, 35) AS s(i);

-- Stop 2: at the office, 09:35-13:05 (3.5 hours)
INSERT INTO location_history
    (device_serial, lat, lng, speed, satellites, csq, battery, ignition, recorded_at)
SELECT
    'TRACKER-002',
    35.75580 + (random() - 0.5) * 0.0004,
    51.46620 + (random() - 0.5) * 0.0004,
    0, 6, 19, 12.4, FALSE,
    NOW() - INTERVAL '7 hours 25 minutes' + (i * INTERVAL '30 seconds')
FROM generate_series(0, 419) AS s(i);

-- Leg 4: lunch run south, 13:05-13:20
INSERT INTO location_history
    (device_serial, lat, lng, speed, satellites, csq, battery, ignition, recorded_at)
SELECT
    'TRACKER-002',
    35.75580 - (i * 0.00048),
    51.46620 - (i * 0.00032),
    25 + (i % 25), 8, 20, 12.7, TRUE,
    NOW() - INTERVAL '3 hours 55 minutes' + (i * INTERVAL '30 seconds')
FROM generate_series(0, 29) AS s(i);

-- Stop 3: lunch, 13:20-14:05 (45 min)
INSERT INTO location_history
    (device_serial, lat, lng, speed, satellites, csq, battery, ignition, recorded_at)
SELECT
    'TRACKER-002',
    35.74140 + (random() - 0.5) * 0.0003,
    51.45660 + (random() - 0.5) * 0.0003,
    0, 7, 17, 12.5, FALSE,
    NOW() - INTERVAL '3 hours 40 minutes' + (i * INTERVAL '30 seconds')
FROM generate_series(0, 89) AS s(i);

-- Leg 5: drive home, 14:05-14:35
INSERT INTO location_history
    (device_serial, lat, lng, speed, satellites, csq, battery, ignition, recorded_at)
SELECT
    'TRACKER-002',
    35.74140 - (i * 0.00070),
    51.45660 - (i * 0.00112),
    45 + (i % 35), 9, 23, 12.8, TRUE,
    NOW() - INTERVAL '2 hours 55 minutes' + (i * INTERVAL '30 seconds')
FROM generate_series(0, 59) AS s(i);

COMMIT;

\echo ''
\echo 'Journey loaded for TRACKER-002 (owner: 09120000002 / password123).'
\echo 'Expect 3 stops: ~45 min home, ~3h30 office, ~45 min lunch.'
\echo 'The 90-second traffic-light pause should NOT be reported as a stop.'
\echo ''
