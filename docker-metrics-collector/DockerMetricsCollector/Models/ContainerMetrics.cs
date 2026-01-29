using System.Text.Json.Serialization;

namespace DockerMetricsAgent.Models;

/// <summary>
/// Container state enum with failure markers for debugging propagation issues.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ContainerState
{
    /// <summary>Never fetched properly - default value.</summary>
    Undefined = 0,
    /// <summary>Fetched but source was invalid - shows where propagation breaks.</summary>
    Invalid,
    /// <summary>Container created but not started.</summary>
    Created,
    /// <summary>Container is running.</summary>
    Running,
    /// <summary>Container is paused.</summary>
    Paused,
    /// <summary>Container is restarting.</summary>
    Restarting,
    /// <summary>Container is being removed.</summary>
    Removing,
    /// <summary>Container has exited/stopped.</summary>
    Exited,
    /// <summary>Container is dead (failed to stop gracefully).</summary>
    Dead
}

/// <summary>
/// Container health check status from Docker HEALTHCHECK.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ContainerHealthStatus
{
    /// <summary>No health check defined.</summary>
    None = 0,
    /// <summary>Health check is starting.</summary>
    Starting,
    /// <summary>Container is healthy.</summary>
    Healthy,
    /// <summary>Container is unhealthy.</summary>
    Unhealthy
}

/// <summary>
/// Helper methods for ContainerHealthStatus.
/// </summary>
public static class ContainerHealthStatusExtensions
{
    /// <summary>
    /// Parse Docker API health status string to ContainerHealthStatus enum.
    /// </summary>
    public static ContainerHealthStatus ParseDockerHealthStatus(string? status)
    {
        if (string.IsNullOrEmpty(status))
            return ContainerHealthStatus.None;

        return status.ToLowerInvariant() switch
        {
            "healthy" => ContainerHealthStatus.Healthy,
            "unhealthy" => ContainerHealthStatus.Unhealthy,
            "starting" => ContainerHealthStatus.Starting,
            "none" => ContainerHealthStatus.None,
            _ => ContainerHealthStatus.None
        };
    }

    /// <summary>
    /// Check if container is unhealthy.
    /// </summary>
    public static bool IsUnhealthy(this ContainerHealthStatus status) =>
        status == ContainerHealthStatus.Unhealthy;
}

/// <summary>
/// Helper methods for ContainerState.
/// </summary>
public static class ContainerStateExtensions
{
    /// <summary>
    /// Parse Docker API state string to ContainerState enum.
    /// </summary>
    public static ContainerState ParseDockerState(string? state)
    {
        if (string.IsNullOrEmpty(state))
            return ContainerState.Undefined;

        return state.ToLowerInvariant() switch
        {
            "created" => ContainerState.Created,
            "running" => ContainerState.Running,
            "paused" => ContainerState.Paused,
            "restarting" => ContainerState.Restarting,
            "removing" => ContainerState.Removing,
            "exited" => ContainerState.Exited,
            "dead" => ContainerState.Dead,
            "undefined" => ContainerState.Undefined,
            "invalid" => ContainerState.Invalid,
            _ => ContainerState.Invalid // Unknown state from Docker = Invalid
        };
    }

    /// <summary>
    /// Check if container is in a running state.
    /// </summary>
    public static bool IsRunning(this ContainerState state) =>
        state == ContainerState.Running;

    /// <summary>
    /// Check if container is paused.
    /// </summary>
    public static bool IsPaused(this ContainerState state) =>
        state == ContainerState.Paused;

    /// <summary>
    /// Check if container is in an active state (running or paused).
    /// </summary>
    public static bool IsActive(this ContainerState state) =>
        state == ContainerState.Running || state == ContainerState.Paused;
}

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
    ContainerState State,
    ContainerHealthStatus HealthStatus,

    // PSI metrics (null if not available)
    PsiMetrics? CpuPressure,
    PsiMetrics? MemoryPressure,
    PsiMetrics? IoPressure
)
{
    // Computed properties for backward compatibility
    public bool IsRunning => State.IsRunning();
    public bool IsPaused => State.IsPaused();
    public bool IsUnhealthy => HealthStatus.IsUnhealthy();
}

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
    ContainerState State,
    ContainerHealthStatus HealthStatus
)
{
    public bool IsRunning => State.IsRunning();
    public bool IsPaused => State.IsPaused();
    public bool IsUnhealthy => HealthStatus.IsUnhealthy();
}

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
