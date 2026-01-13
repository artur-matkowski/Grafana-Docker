namespace DockerMetricsCollector.Services;

using System.Collections.Concurrent;
using DockerMetricsCollector.Models;

/// <summary>
/// Thread-safe in-memory store for container and host metrics.
/// Supports rolling 24-hour retention and multi-host storage.
/// </summary>
public class MetricsStore
{
    // Key is "hostId:containerId" for unique identification across hosts
    private readonly ConcurrentDictionary<string, List<ContainerMetricSnapshot>> _containerMetrics = new();
    private readonly List<HostMetricSnapshot> _hostMetrics = new();
    private readonly object _hostLock = new();
    private readonly TimeSpan _retentionPeriod = TimeSpan.FromHours(24);

    private static string MakeKey(string hostId, string containerId) => $"{hostId}:{containerId}";

    /// <summary>
    /// Add a container metric snapshot to the store.
    /// </summary>
    public void AddContainerSnapshot(ContainerMetricSnapshot snapshot)
    {
        var key = MakeKey(snapshot.HostId, snapshot.ContainerId);
        _containerMetrics.AddOrUpdate(
            key,
            _ => new List<ContainerMetricSnapshot> { snapshot },
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
    /// Get container metrics with flexible filtering.
    /// </summary>
    public IEnumerable<ContainerMetricSnapshot> GetContainerMetrics(
        string? hostId = null,
        string? containerId = null,
        DateTimeOffset? from = null,
        DateTimeOffset? to = null)
    {
        IEnumerable<KeyValuePair<string, List<ContainerMetricSnapshot>>> entries;

        if (hostId != null && containerId != null)
        {
            // Specific container on specific host
            var key = MakeKey(hostId, containerId);
            if (_containerMetrics.TryGetValue(key, out var snapshots))
            {
                entries = new[] { new KeyValuePair<string, List<ContainerMetricSnapshot>>(key, snapshots) };
            }
            else
            {
                return Enumerable.Empty<ContainerMetricSnapshot>();
            }
        }
        else if (hostId != null)
        {
            // All containers from specific host
            entries = _containerMetrics.Where(kvp => kvp.Key.StartsWith($"{hostId}:"));
        }
        else if (containerId != null)
        {
            // Container by ID across all hosts (backward compatibility)
            entries = _containerMetrics.Where(kvp => kvp.Key.EndsWith($":{containerId}"));
        }
        else
        {
            // All containers from all hosts
            entries = _containerMetrics;
        }

        var result = new List<ContainerMetricSnapshot>();
        foreach (var kvp in entries)
        {
            List<ContainerMetricSnapshot> copy;
            lock (kvp.Value)
            {
                copy = kvp.Value.ToList();
            }
            result.AddRange(FilterByTimeRange(copy, from, to));
        }

        return result.OrderBy(s => s.Timestamp);
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
    /// Get all known containers with host info.
    /// </summary>
    public IEnumerable<ContainerInfo> GetKnownContainers(string? hostId = null)
    {
        var containers = new Dictionary<string, ContainerInfo>();

        foreach (var kvp in _containerMetrics)
        {
            List<ContainerMetricSnapshot> snapshots;
            lock (kvp.Value)
            {
                if (kvp.Value.Count == 0) continue;
                snapshots = kvp.Value.ToList();
            }

            var latest = snapshots.OrderByDescending(s => s.Timestamp).First();

            if (hostId != null && latest.HostId != hostId)
                continue;

            containers[kvp.Key] = new ContainerInfo(
                latest.HostId,
                latest.HostName,
                latest.ContainerId,
                latest.ContainerName
            );
        }

        return containers.Values;
    }

    /// <summary>
    /// Get container count per host.
    /// </summary>
    public Dictionary<string, int> GetContainerCountByHost()
    {
        var counts = new Dictionary<string, int>();

        foreach (var kvp in _containerMetrics)
        {
            var hostId = kvp.Key.Split(':')[0];
            if (!counts.ContainsKey(hostId))
                counts[hostId] = 0;
            counts[hostId]++;
        }

        return counts;
    }

    /// <summary>
    /// Remove all data for a specific host.
    /// </summary>
    public void RemoveHostData(string hostId)
    {
        var keysToRemove = _containerMetrics.Keys
            .Where(k => k.StartsWith($"{hostId}:"))
            .ToList();

        foreach (var key in keysToRemove)
        {
            _containerMetrics.TryRemove(key, out _);
        }
    }

    /// <summary>
    /// Remove entries older than 24 hours.
    /// </summary>
    public void Trim()
    {
        var cutoff = DateTimeOffset.UtcNow - _retentionPeriod;

        // Trim container metrics
        var emptyKeys = new List<string>();
        foreach (var kvp in _containerMetrics)
        {
            lock (kvp.Value)
            {
                kvp.Value.RemoveAll(s => s.Timestamp < cutoff);
                if (kvp.Value.Count == 0)
                    emptyKeys.Add(kvp.Key);
            }
        }

        // Remove empty entries
        foreach (var key in emptyKeys)
        {
            _containerMetrics.TryRemove(key, out _);
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

/// <summary>
/// Container info for listing known containers.
/// </summary>
public record ContainerInfo(
    string HostId,
    string HostName,
    string ContainerId,
    string ContainerName
);
