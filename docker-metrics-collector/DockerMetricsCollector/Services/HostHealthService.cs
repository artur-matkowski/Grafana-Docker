using System.Collections.Concurrent;

namespace DockerMetricsCollector.Services;

/// <summary>
/// Tracks health status of configured Docker hosts.
/// </summary>
public class HostHealthService
{
    private readonly ConcurrentDictionary<string, HostHealthInfo> _healthInfo = new();

    public void UpdateHealth(string hostId, bool isHealthy, string? error = null)
    {
        var info = new HostHealthInfo(DateTimeOffset.UtcNow, isHealthy, error);
        _healthInfo.AddOrUpdate(hostId, info, (_, _) => info);
    }

    public HostHealthInfo? GetHealth(string hostId)
    {
        return _healthInfo.TryGetValue(hostId, out var info) ? info : null;
    }

    public Dictionary<string, HostHealthInfo> GetAllHealth()
    {
        return _healthInfo.ToDictionary(kvp => kvp.Key, kvp => kvp.Value);
    }

    public void RemoveHost(string hostId)
    {
        _healthInfo.TryRemove(hostId, out _);
    }
}

public record HostHealthInfo(
    DateTimeOffset LastChecked,
    bool IsHealthy,
    string? LastError
);
