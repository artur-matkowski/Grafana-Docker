namespace DockerMetricsAgent.Models;

/// <summary>
/// Container metrics snapshot including PSI (Pressure Stall Information).
/// </summary>
public record ContainerMetrics(
    string ContainerId,
    string ContainerName,
    DateTimeOffset Timestamp,

    // Basic metrics
    double CpuPercent,
    long MemoryBytes,
    double MemoryPercent,
    long NetworkRxBytes,
    long NetworkTxBytes,
    long DiskReadBytes,
    long DiskWriteBytes,
    long UptimeSeconds,

    // Container state
    bool IsRunning,
    bool IsPaused,

    // PSI metrics (null if not available)
    PsiMetrics? CpuPressure,
    PsiMetrics? MemoryPressure,
    PsiMetrics? IoPressure
);

/// <summary>
/// PSI (Pressure Stall Information) metrics.
/// Values are percentages (0-100) representing time spent waiting for resources.
/// </summary>
public record PsiMetrics(
    double Some10,   // % of time at least some tasks were stalled (10s avg)
    double Some60,   // % of time at least some tasks were stalled (60s avg)
    double Some300,  // % of time at least some tasks were stalled (300s avg)
    double Full10,   // % of time all tasks were stalled (10s avg)
    double Full60,   // % of time all tasks were stalled (60s avg)
    double Full300   // % of time all tasks were stalled (300s avg)
);

/// <summary>
/// Container info for listing.
/// </summary>
public record ContainerInfo(
    string ContainerId,
    string ContainerName,
    string State,
    bool IsRunning,
    bool IsPaused
);

/// <summary>
/// Real-time container status.
/// </summary>
public record ContainerStatus(
    string ContainerId,
    string ContainerName,
    string Status,
    bool IsRunning,
    bool IsPaused
);

/// <summary>
/// Agent info for health checks.
/// </summary>
public record AgentInfo(
    string Hostname,
    string AgentVersion,
    string DockerVersion,
    bool DockerConnected,
    bool PsiSupported
);
