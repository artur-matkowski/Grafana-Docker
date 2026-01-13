namespace DockerMetricsCollector.Services;

using System.Collections.Concurrent;
using DockerMetricsCollector.Models;

/// <summary>
/// Thread-safe in-memory store for container and host metrics.
/// Supports rolling 24-hour retention.
/// </summary>
public class MetricsStore
{
    private readonly ConcurrentDictionary<string, List<ContainerMetricSnapshot>> _containerMetrics = new();
    private readonly List<HostMetricSnapshot> _hostMetrics = new();
    private readonly object _hostLock = new();
    private readonly TimeSpan _retentionPeriod = TimeSpan.FromHours(24);

    /// <summary>
    /// Add a container metric snapshot to the store.
    /// </summary>
    public void AddContainerSnapshot(ContainerMetricSnapshot snapshot)
    {
        _containerMetrics.AddOrUpdate(
            snapshot.ContainerId,
            // Add new list with single item
            _ => new List<ContainerMetricSnapshot> { snapshot },
            // Update existing list
            (_, existing) =>
            {
                lock (existing)
                {
                    existing.Add(snapshot);
                }
                return existing;
            }
        );
    }

    /// <summary>
    /// Add a host metric snapshot to the store.
    /// </summary>
    public void AddHostSnapshot(HostMetricSnapshot snapshot)
    {
        lock (_hostLock)
        {
            _hostMetrics.Add(snapshot);
        }
    }

    /// <summary>
    /// Get container metrics, optionally filtered by time range.
    /// </summary>
    public IEnumerable<ContainerMetricSnapshot> GetContainerMetrics(
        string containerId,
        DateTimeOffset? from = null,
        DateTimeOffset? to = null)
    {
        if (!_containerMetrics.TryGetValue(containerId, out var snapshots))
        {
            return Enumerable.Empty<ContainerMetricSnapshot>();
        }

        List<ContainerMetricSnapshot> copy;
        lock (snapshots)
        {
            copy = snapshots.ToList();
        }

        return FilterByTimeRange(copy, from, to);
    }

    /// <summary>
    /// Get host metrics, optionally filtered by time range.
    /// </summary>
    public IEnumerable<HostMetricSnapshot> GetHostMetrics(
        DateTimeOffset? from = null,
        DateTimeOffset? to = null)
    {
        List<HostMetricSnapshot> copy;
        lock (_hostLock)
        {
            copy = _hostMetrics.ToList();
        }

        return FilterByTimeRange(copy, from, to);
    }

    /// <summary>
    /// Get all known container IDs.
    /// </summary>
    public IEnumerable<string> GetKnownContainerIds()
    {
        return _containerMetrics.Keys.ToList();
    }

    /// <summary>
    /// Remove entries older than 24 hours.
    /// </summary>
    public void Trim()
    {
        var cutoff = DateTimeOffset.UtcNow - _retentionPeriod;

        // Trim container metrics
        foreach (var kvp in _containerMetrics)
        {
            lock (kvp.Value)
            {
                kvp.Value.RemoveAll(s => s.Timestamp < cutoff);
            }
        }

        // Trim host metrics
        lock (_hostLock)
        {
            _hostMetrics.RemoveAll(s => s.Timestamp < cutoff);
        }
    }

    private static IEnumerable<T> FilterByTimeRange<T>(
        IEnumerable<T> snapshots,
        DateTimeOffset? from,
        DateTimeOffset? to) where T : class
    {
        var result = snapshots;

        if (from.HasValue)
        {
            result = result.Where(s => GetTimestamp(s) >= from.Value);
        }

        if (to.HasValue)
        {
            result = result.Where(s => GetTimestamp(s) <= to.Value);
        }

        return result;
    }

    private static DateTimeOffset GetTimestamp<T>(T snapshot) where T : class
    {
        return snapshot switch
        {
            ContainerMetricSnapshot c => c.Timestamp,
            HostMetricSnapshot h => h.Timestamp,
            _ => throw new ArgumentException($"Unknown snapshot type: {typeof(T)}")
        };
    }
}
