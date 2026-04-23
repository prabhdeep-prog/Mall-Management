-- ============================================================
-- Enable slow query logging for load test analysis
-- ============================================================
-- Run against your PostgreSQL instance before load testing.
-- Queries taking >200ms will appear in pg_log.
-- ============================================================

-- Log queries slower than 200ms
ALTER SYSTEM SET log_min_duration_statement = 200;

-- Include query parameters in logs
ALTER SYSTEM SET log_statement = 'none';
ALTER SYSTEM SET log_duration = off;

-- Log lock waits
ALTER SYSTEM SET log_lock_waits = on;
ALTER SYSTEM SET deadlock_timeout = '1s';

-- Connection stats
ALTER SYSTEM SET log_connections = on;
ALTER SYSTEM SET log_disconnections = on;

-- Apply changes
SELECT pg_reload_conf();

-- ── Verify settings ─────────────────────────────────────────────────────────
SELECT name, setting, unit
FROM pg_settings
WHERE name IN (
  'log_min_duration_statement',
  'log_lock_waits',
  'deadlock_timeout',
  'max_connections',
  'shared_buffers',
  'work_mem',
  'effective_cache_size'
);

-- ── Active connections by state ─────────────────────────────────────────────
SELECT state, count(*)
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state;

-- ── Connection pool saturation check ────────────────────────────────────────
SELECT
  count(*) AS total_connections,
  count(*) FILTER (WHERE state = 'active') AS active,
  count(*) FILTER (WHERE state = 'idle') AS idle,
  count(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_txn,
  (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections
FROM pg_stat_activity
WHERE datname = current_database();
