# Logging Standards

This document defines logging conventions for the Grafana-Docker project across both the C# collector and TypeScript panel.

## Log Level Semantics

| Level | Purpose | When to Use |
|-------|---------|-------------|
| TRACE | Method entry/exit, variable values | Fine-grained debugging; disabled in production |
| DEBUG | Diagnostic information | Request/response details, cache operations, internal state |
| INFO | Operational milestones | Startup/shutdown, collection cycles, successful operations |
| WARN | Recoverable issues | Retries, approaching thresholds, deprecated usage |
| ERROR | Failures requiring attention | Exceptions, failed operations, broken integrations |

## C# Collector Logging

### Framework

Uses .NET `ILogger<T>` dependency injection with structured logging support.

### Configuration

**File**: `appsettings.json`

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning",
      "DockerMetricsCollector": "Debug"
    }
  }
}
```

**Environment Override**:
```bash
export Logging__LogLevel__Default=Debug
```

### Usage Pattern

```csharp
public class MyService
{
    private readonly ILogger<MyService> _logger;

    public MyService(ILogger<MyService> logger)
    {
        _logger = logger;
    }

    public async Task DoWorkAsync()
    {
        _logger.LogDebug("Starting work for {ContainerId}", containerId);

        try
        {
            // ... work ...
            _logger.LogInformation("Completed work for {ContainerId}", containerId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to complete work for {ContainerId}", containerId);
            throw;
        }
    }
}
```

### Current Logging Locations

| File | Logger | Levels Used |
|------|--------|-------------|
| `CollectorService.cs` | `ILogger<CollectorService>` | Info, Warning, Error, Debug |
| `LocalDockerClient.cs` | `ILogger<LocalDockerClient>` | Warning, Error, Debug |
| `MetricsCache.cs` | `ILogger<MetricsCache>` | Debug |
| `PsiReader.cs` | `ILogger<PsiReader>` | Information, Warning, Debug |

### Structured Logging Fields

Always use structured placeholders, not string interpolation:

```csharp
// Good
_logger.LogInformation("Collected {MetricCount} metrics for {ContainerId}", count, id);

// Bad
_logger.LogInformation($"Collected {count} metrics for {id}");
```

Common fields:
- `{ContainerId}` - Container ID (short form)
- `{ContainerName}` - Container name
- `{MetricCount}` - Number of metrics
- `{DurationMs}` - Operation duration in milliseconds
- `{Endpoint}` - API endpoint path

## TypeScript Panel Logging

### Framework

Custom debug logger with area-based filtering.

### Configuration

**File**: `src/components/SimplePanel.tsx` (lines 8-15)

```typescript
const DEBUG = false;  // Toggle for development

const log = (area: string, message: string, data?: unknown) => {
  if (DEBUG) {
    console.warn(`[DockerMetrics:${area}]`, message, data !== undefined ? data : '');
  }
};
```

**Grafana Environment**:
```yaml
environment:
  - GF_LOG_LEVEL=debug
  - GF_LOG_FILTERS=plugin.bitforge-dockermetrics-panel:debug
  - GF_DATAPROXY_LOGGING=1
```

### Usage Pattern

```typescript
log('Render', 'Component rendered', { renderCount });
log('Effect:Metrics', 'Fetching metrics', { hostId, containerIds });
log('State', 'State updated', { metricsCount: allMetrics.size });
```

### Debug Areas

| Area | Purpose |
|------|---------|
| `Render` | Component render cycles |
| `Effect:Containers` | Container list fetch lifecycle |
| `Effect:Metrics` | Metrics fetch lifecycle |
| `Effect:Prune` | Old metric cleanup |
| `Effect:Reset` | Container selection changes |
| `State` | State setter calls |
| `Controls` | Container action operations |

### Production vs Development

- **Development**: Set `DEBUG = true` for verbose console output
- **Production**: Set `DEBUG = false` (default) to disable all logging
- **Grafana Debug**: Use `GF_LOG_FILTERS` for plugin-level logging

## Retrofit Status

### C# Collector

| Component | Logging Status | Notes |
|-----------|----------------|-------|
| `CollectorService` | Complete | Lifecycle + collection cycle |
| `LocalDockerClient` | Complete | Connection + parsing |
| `MetricsCache` | Partial | Only trim operations |
| `PsiReader` | Complete | Cgroup detection + parsing |
| `Program.cs` (endpoints) | Missing | Add request/response logging |

### TypeScript Panel

| Component | Logging Status | Notes |
|-----------|----------------|-------|
| `SimplePanel` | Complete | All major operations |
| `proxy.ts` | Missing | Add request/error logging |
| Editor components | Missing | Low priority |

## Security: What NOT to Log

Never log:
- Passwords, API keys, tokens
- Full request/response bodies that may contain secrets
- PII (names, emails, addresses)
- Docker registry credentials
- Grafana API tokens

If debugging requires sensitive data, log a redacted identifier:
```csharp
_logger.LogDebug("Processing container {ContainerId}", id[..8] + "...");
```
