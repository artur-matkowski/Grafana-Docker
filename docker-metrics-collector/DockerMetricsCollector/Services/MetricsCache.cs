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
    /// Get metrics for containers within a time range with optional filtering.
    /// </summary>
    /// <param name="containerIds">Optional list of container IDs to filter (null = all)</param>
    /// <param name="from">Start time (default: 6 hours ago)</param>
    /// <param name="to">End time (default: now)</param>
    /// <param name="limit">Max points per container (null = unlimited)</param>
    /// <param name="latest">If true, return only the latest point per container</param>
    public IEnumerable<ContainerMetrics> GetMetrics(
        IEnumerable<string>? containerIds = null,
        DateTimeOffset? from = null,
        DateTimeOffset? to = null,
        int? limit = null,
        bool latest = false)
    {
        var fromTime = from ?? DateTimeOffset.UtcNow.AddHours(-6);
        var toTime = to ?? DateTimeOffset.UtcNow;
        var containerIdSet = containerIds?.ToHashSet();

        var result = new List<ContainerMetrics>();

        foreach (var kvp in _metrics)
        {
            // Filter by container IDs if specified
            if (containerIdSet != null && !containerIdSet.Contains(kvp.Key))
            {
                continue;
            }

            lock (kvp.Value)
            {
                if (kvp.Value.Count == 0) continue;

                if (latest)
                {
                    // Return only the latest metric for this container
                    var latestMetric = kvp.Value
                        .Where(m => m.Timestamp >= fromTime && m.Timestamp <= toTime)
                        .OrderByDescending(m => m.Timestamp)
                        .FirstOrDefault();
                    if (latestMetric != null)
                    {
                        result.Add(latestMetric);
                    }
                }
                else
                {
                    // Return metrics within time range, optionally limited
                    var filtered = kvp.Value
                        .Where(m => m.Timestamp >= fromTime && m.Timestamp <= toTime)
                        .OrderByDescending(m => m.Timestamp);

                    var items = limit.HasValue
                        ? filtered.Take(limit.Value)
                        : filtered;

                    result.AddRange(items);
                }
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
