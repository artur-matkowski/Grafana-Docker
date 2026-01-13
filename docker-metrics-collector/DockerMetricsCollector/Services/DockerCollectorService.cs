namespace DockerMetricsCollector.Services;

using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

/// <summary>
/// Background service that periodically collects metrics from Docker.
/// </summary>
public class DockerCollectorService : BackgroundService
{
    private readonly DockerClient _dockerClient;
    private readonly MetricsStore _metricsStore;
    private readonly ILogger<DockerCollectorService> _logger;
    private readonly TimeSpan _pollInterval;
    private readonly TimeSpan _trimInterval;

    private DateTimeOffset _lastTrimTime = DateTimeOffset.MinValue;

    public DockerCollectorService(
        DockerClient dockerClient,
        MetricsStore metricsStore,
        ILogger<DockerCollectorService> logger,
        TimeSpan? pollInterval = null,
        TimeSpan? trimInterval = null)
    {
        _dockerClient = dockerClient;
        _metricsStore = metricsStore;
        _logger = logger;
        _pollInterval = pollInterval ?? TimeSpan.FromSeconds(10);
        _trimInterval = trimInterval ?? TimeSpan.FromMinutes(5);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Docker Collector Service starting. Poll interval: {Interval}s",
            _pollInterval.TotalSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CollectMetricsAsync();

                // Trim old entries periodically
                if (DateTimeOffset.UtcNow - _lastTrimTime > _trimInterval)
                {
                    _metricsStore.Trim();
                    _lastTrimTime = DateTimeOffset.UtcNow;
                    _logger.LogDebug("Trimmed old metrics from store");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error collecting metrics");
            }

            await Task.Delay(_pollInterval, stoppingToken);
        }

        _logger.LogInformation("Docker Collector Service stopping");
    }

    private async Task CollectMetricsAsync()
    {
        // Get list of containers
        var containers = await _dockerClient.GetContainersAsync();
        _logger.LogDebug("Found {Count} containers", containers.Count);

        // Collect stats for each container
        var collectedCount = 0;
        foreach (var container in containers)
        {
            var snapshot = await _dockerClient.GetContainerStatsAsync(container.Id, container.Name);
            if (snapshot != null)
            {
                _metricsStore.AddContainerSnapshot(snapshot);
                collectedCount++;
            }
        }

        _logger.LogDebug("Collected metrics for {Count} containers", collectedCount);

        // TODO: Add host metrics collection
        // For now, we'll add a placeholder host metric
        var hostSnapshot = CreateHostSnapshot();
        _metricsStore.AddHostSnapshot(hostSnapshot);
    }

    private static Models.HostMetricSnapshot CreateHostSnapshot()
    {
        // Basic host metrics - in a real implementation, you'd read from /proc or use a library
        // For now, return placeholder values
        return new Models.HostMetricSnapshot(
            Hostname: Environment.MachineName,
            Timestamp: DateTimeOffset.UtcNow,
            CpuPercent: 0,        // TODO: Implement actual CPU reading
            CpuFrequencyMhz: 0,   // TODO: Implement actual frequency reading
            MemoryBytes: GC.GetGCMemoryInfo().TotalAvailableMemoryBytes,
            MemoryPercent: 0,     // TODO: Calculate actual percentage
            UptimeSeconds: Environment.TickCount64 / 1000,
            IsUp: true
        );
    }
}
