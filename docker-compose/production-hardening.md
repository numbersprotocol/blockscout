# Production Hardening

This checklist keeps the public Docker Compose files safe to publish while
covering the failure mode observed on the Numbers mainnet explorer: long-running
containers consumed nearly all VM memory, then the VM kept receiving packets but
stopped returning responses.

## Resource Guards

The compose service files define non-secret defaults that can be overridden by
the production environment:

```sh
BACKEND_MEM_LIMIT=5g
BACKEND_MEMSWAP_LIMIT=5g
DB_MEM_LIMIT=5g
DB_MEMSWAP_LIMIT=5g
STATS_MEM_LIMIT=1g
STATS_MEMSWAP_LIMIT=1g
STATS_DB_MEM_LIMIT=1g
STATS_DB_MEMSWAP_LIMIT=1g
REDIS_MEM_LIMIT=512m
REDIS_MEMSWAP_LIMIT=512m
```

Keep total container limits below host memory so the OS, nginx, Docker, and the
monitoring agent have headroom. On a 16 GiB VM, reserve at least 3 GiB for the
host.

## Health Checks

The backend container now exposes a Docker healthcheck against:

```text
http://localhost:$${PORT:-4000}/api/v2/main-page/indexing-status
```

Production monitoring should also check the public endpoint:

```sh
curl -fsS --max-time 10 \
  https://mainnet.num.network/api/v2/main-page/indexing-status
```

Alert if this endpoint is non-200 or exceeds the expected latency for multiple
consecutive checks.

## Log Rotation

Docker `json-file` log rotation is enabled for the high-volume services. The
defaults are intentionally conservative and can be adjusted without changing the
compose files:

```sh
BACKEND_LOG_MAX_SIZE=50m
BACKEND_LOG_MAX_FILE=5
DB_LOG_MAX_SIZE=50m
DB_LOG_MAX_FILE=5
STATS_LOG_MAX_SIZE=50m
STATS_LOG_MAX_FILE=5
STATS_DB_LOG_MAX_SIZE=25m
STATS_DB_LOG_MAX_FILE=5
REDIS_LOG_MAX_SIZE=25m
REDIS_LOG_MAX_FILE=5
```

## Monitoring

Required production alerts:

- VM memory used > 85% for 10 minutes.
- VM outbound bytes = 0 while inbound bytes > 0 for 5 minutes.
- Public explorer health endpoint returns non-200 for 3 consecutive checks.
- Docker container health is `unhealthy` for backend.

Enable process-level memory metrics on the VM. Without process RSS history, an
incident can prove memory exhaustion but cannot identify which process caused it.
Do not exclude these Ops Agent metrics in production:

```yaml
agent.googleapis.com/processes/*
agent.googleapis.com/swap/*
```
