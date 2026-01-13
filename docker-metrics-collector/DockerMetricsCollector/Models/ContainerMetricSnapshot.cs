namespace DockerMetricsCollector.Models;

/// <summary>
/// Immutable snapshot of container metrics at a point in time.
/// PSI (Pressure Stall Information) fields are nullable for systems that don't support them.
/// </summary>
public record ContainerMetricSnapshot(
    string HostId,
    string HostName,
    string ContainerId,
    string ContainerName,
    DateTimeOffset Timestamp,
    double CpuPercent,
    long MemoryBytes,
    double MemoryPercent,
    long NetworkRxBytes,
    long NetworkTxBytes,
    long DiskReadBytes,
    long DiskWriteBytes,
    long UptimeSeconds,
    bool IsRunning,
    double? CpuPressureSome,
    double? CpuPressureFull,
    double? MemoryPressureSome,
    double? MemoryPressureFull,
    double? IoPressureSome,
    double? IoPressureFull
);
