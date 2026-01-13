namespace DockerMetricsCollector.Models;

/// <summary>
/// Immutable snapshot of host metrics at a point in time.
/// </summary>
public record HostMetricSnapshot(
    string Hostname,
    DateTimeOffset Timestamp,
    double CpuPercent,
    double CpuFrequencyMhz,
    long MemoryBytes,
    double MemoryPercent,
    long UptimeSeconds,
    bool IsUp
);
