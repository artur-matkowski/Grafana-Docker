# Caveat: PSI Metrics Require cgroup v2

## Problem

PSI (Pressure Stall Information) metrics are only available on Linux systems with cgroup v2 enabled. The collector gracefully disables PSI if unavailable, but this may surprise users expecting these metrics.

## Detection Logic

**File**: `docker-metrics-collector/DockerMetricsCollector/Services/PsiReader.cs`

The collector tries these cgroup paths in order:
1. `/sys/fs/cgroup/system.slice/docker-{containerId}.scope/`
2. `/sys/fs/cgroup/docker/{containerId}/`
3. `/sys/fs/cgroup/` (root cgroup)

If none contain PSI files (`cpu.pressure`, `memory.pressure`, `io.pressure`), PSI is disabled.

## Symptoms

- PSI metrics return `null` in API responses
- Panel shows "N/A" for pressure metrics
- `/api/info` returns `"psiSupported": false`

## Requirements for PSI

1. **Linux kernel >= 4.20** with PSI enabled (`CONFIG_PSI=y`)
2. **cgroup v2** filesystem mounted (unified hierarchy)
3. **Container access** to `/sys/fs/cgroup` (read-only mount)

## Verification

Check if cgroup v2 is available:
```bash
mount | grep cgroup2
# Should show: cgroup2 on /sys/fs/cgroup type cgroup2 ...
```

Check if PSI is enabled:
```bash
cat /proc/pressure/cpu
# Should show: some avg10=... avg60=... avg300=...
```

## Docker Compose Configuration

```yaml
docker-metrics-agent:
  volumes:
    - /sys/fs/cgroup:/sys/fs/cgroup:ro
```

## Trade-offs

**Graceful Degradation**:
- Collector works without PSI (returns null for pressure metrics)
- Panel handles null values (shows "N/A")
- No errors or crashes

**Why Not Error**:
- Many environments don't have cgroup v2
- Core metrics (CPU, memory, network, disk) still valuable
- PSI is an enhancement, not a requirement
