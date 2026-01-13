namespace DockerMetricsCollector.Models;

/// <summary>
/// Represents a configured Docker host endpoint.
/// </summary>
public record DockerHostConfig(
    string Id,
    string Name,
    string Url,
    bool Enabled
);

/// <summary>
/// Docker host with runtime health status (not persisted).
/// </summary>
public record DockerHostStatus(
    string Id,
    string Name,
    string Url,
    bool Enabled,
    DateTimeOffset? LastSeen,
    bool IsHealthy,
    string? LastError,
    int ContainerCount
);
