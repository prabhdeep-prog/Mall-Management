# MallOS Load Testing

Load tests using [k6](https://grafana.com/docs/k6/).

## Install k6

```bash
# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

## Setup

### 1. Seed test data (500 tenants + leases)

```bash
k6 run --vus 50 --iterations 500 \
  -e BASE_URL=http://localhost:3000 \
  -e PROPERTY_ID=<your-property-id> \
  tests/load/seed-users.js
```

### 2. Enable slow query logging (PostgreSQL)

```sql
ALTER SYSTEM SET log_min_duration_statement = 200;
SELECT pg_reload_conf();
```

## Run Load Test

```bash
k6 run \
  -e BASE_URL=http://localhost:3000 \
  -e PROPERTY_ID=<your-property-id> \
  -e POS_INTEGRATION_ID=<your-pos-id> \
  tests/load/basic.js
```

## Scenarios

| Scenario         | VUs | Duration | Target p95 |
|------------------|-----|----------|------------|
| Login            | 200 | 5m       | < 800ms    |
| Dashboard fetch  | 200 | 5m       | < 500ms    |
| Invoice list     | 200 | 5m       | < 500ms    |
| POS sale write   | 200 | 5m       | < 500ms    |
| CAM preview      | 200 | 5m       | < 1000ms   |

## Thresholds

- `http_req_duration` p95 < 500ms
- `http_req_failed` < 1%
- Individual endpoint p95 targets as above

## Output

Results are written to `tests/load/report.json` with:
- Total requests
- Error rate
- p95 latency per endpoint
- Threshold pass/fail status

## Connection Pool Verification

Current pool settings (`src/lib/db/index.ts`):

| Connection | Role        | Max Pool | Idle Timeout |
|-----------|-------------|----------|-------------|
| db        | app_user    | 20       | 20s         |
| serviceDb | app_service | 5        | 20s         |
| adminDb   | app_admin   | 3        | 20s         |

If p95 exceeds thresholds under load, consider:
1. Increasing `max` pool size (monitor with `pg_stat_activity`)
2. Adding read replicas
3. Enabling PgBouncer transaction pooling (already compatible: `prepare: false`)
