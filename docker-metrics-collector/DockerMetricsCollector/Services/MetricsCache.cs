namespace DockerMetricsAgent.Services;

using System.Collections.Concurrent;
using DockerMetricsAgent.Models;

/// <summary>
/// In-memory cache for container metrics with automatic cleanup.
/// </summary>
public class MetricsCache
{
    private readonly ConcurrentDictionary<string, List<ContainerMetrics>> _metrics = new();
    private readonly TimeSpan _retention;
    private readonly ILogger<MetricsCache> _logger;

    public MetricsCache(ILogger<MetricsCache> logger, TimeSpan? retention = null)
    {
        _logger = logger;
        _retention = retention ?? TimeSpan.FromHours(6);
    }

    /// <summary>
    /// Add a metrics snapshot for a container.
    /// </summary>
    public void Add(ContainerMetrics metrics)
    {
        var list = _metrics.GetOrAdd(metrics.ContainerId, _ => new List<ContainerMetrics>());
        lock (list)
        {
            list.Add(metrics);
        }
    }

    /// <summary>
    /// Get metrics for a container within a time range.
    /// </summary>
    public IEnumerable<ContainerMetrics> GetMetrics(string? containerId = null, DateTimeOffset? from = null, DateTimeOffset? to = null)
    {
        var fromTime = from ?? DateTimeOffset.UtcNow.AddHours(-6);
        var toTime = to ?? DateTimeOffset.UtcNow;

        if (containerId != null)
        {
            if (_metrics.TryGetValue(containerId, out var list))
            {
                lock (list)
                {
                    return list
                        .Where(m => m.Timestamp >= fromTime && m.Timestamp <= toTime)
                        .ToList();
                }
            }
            return Enumerable.Empty<ContainerMetrics>();
        }

        var result = new List<ContainerMetrics>();
        foreach (var kvp in _metrics)
        {
            lock (kvp.Value)
            {
                result.AddRange(kvp.Value.Where(m => m.Timestamp >= fromTime && m.Timestamp <= toTime));
            }
        }
        return result;
    }

    /// <summary>
    /// Get latest metrics for all containers.
    /// </summary>
    public IEnumerable<ContainerMetrics> GetLatestMetrics()
    {
        var result = new List<ContainerMetrics>();
        foreach (var kvp in _metrics)
        {
            lock (kvp.Value)
            {
                if (kvp.Value.Count > 0)
                {
                    result.Add(kvp.Value[^1]);
                }
            }
        }
        return result;
    }

    /// <summary>
    /// Get known container IDs.
    /// </summary>
    public IEnumerable<string> GetContainerIds()
    {
        return _metrics.Keys.ToList();
    }

    /// <summary>
    /// Remove old metrics beyond retention period.
    /// </summary>
    public void Trim()
    {
        var cutoff = DateTimeOffset.UtcNow - _retention;
        var totalRemoved = 0;

        foreach (var kvp in _metrics)
        {
            lock (kvp.Value)
            {
                var countBefore = kvp.Value.Count;
                kvp.Value.RemoveAll(m => m.Timestamp < cutoff);
                totalRemoved += countBefore - kvp.Value.Count;
            }
        }

        // Remove empty entries
        var emptyKeys = _metrics.Where(kvp =>
        {
            lock (kvp.Value)
            {
                return kvp.Value.Count == 0;
            }
        }).Select(kvp => kvp.Key).ToList();

        foreach (var key in emptyKeys)
        {
            _metrics.TryRemove(key, out _);
        }

        if (totalRemoved > 0)
        {
            _logger.LogDebug("Trimmed {Count} old metrics entries", totalRemoved);
        }
    }

    /// <summary>
    /// Get cache statistics.
    /// </summary>
    public (int ContainerCount, int TotalSnapshots) GetStats()
    {
        var totalSnapshots = 0;
        foreach (var kvp in _metrics)
        {
            lock (kvp.Value)
            {
                totalSnapshots += kvp.Value.Count;
            }
        }
        return (_metrics.Count, totalSnapshots);
    }
}
