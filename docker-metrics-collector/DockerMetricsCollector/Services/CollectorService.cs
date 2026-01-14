namespace DockerMetricsAgent.Services;

using Microsoft.Extensions.Hosting;

/// <summary>
/// Background service that periodically collects metrics from local Docker.
/// </summary>
public class CollectorService : BackgroundService
{
    private readonly LocalDockerClient _docker;
    private readonly MetricsCache _cache;
    private readonly ILogger<CollectorService> _logger;
    private readonly TimeSpan _pollInterval = TimeSpan.FromSeconds(10);
    private readonly TimeSpan _trimInterval = TimeSpan.FromMinutes(5);
    private DateTimeOffset _lastTrimTime = DateTimeOffset.MinValue;

    public CollectorService(
        LocalDockerClient docker,
        MetricsCache cache,
        ILogger<CollectorService> logger)
    {
        _docker = docker;
        _cache = cache;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Collector service starting. Poll interval: {Interval}s", _pollInterval.TotalSeconds);

        // Wait for Docker to be ready
        var connected = false;
        while (!connected && !stoppingToken.IsCancellationRequested)
        {
            connected = await _docker.CheckConnectionAsync();
            if (!connected)
            {
                _logger.LogWarning("Docker not available, retrying in 5 seconds...");
                await Task.Delay(5000, stoppingToken);
            }
        }

        if (connected)
        {
            _logger.LogInformation("Connected to Docker {Version}", _docker.DockerVersion);
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CollectMetricsAsync(stoppingToken);

                // Trim old entries periodically
                if (DateTimeOffset.UtcNow - _lastTrimTime > _trimInterval)
                {
                    _cache.Trim();
                    _lastTrimTime = DateTimeOffset.UtcNow;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in collection cycle");
            }

            await Task.Delay(_pollInterval, stoppingToken);
        }

        _logger.LogInformation("Collector service stopping");
    }

    private async Task CollectMetricsAsync(CancellationToken stoppingToken)
    {
        var containers = await _docker.GetContainersAsync();
        var collectedCount = 0;

        foreach (var container in containers)
        {
            if (stoppingToken.IsCancellationRequested)
                break;

            var metrics = await _docker.GetContainerMetricsAsync(
                container.ContainerId,
                container.ContainerName,
                container.State);

            if (metrics != null)
            {
                _cache.Add(metrics);
                collectedCount++;
            }
        }

        _logger.LogDebug("Collected metrics for {Count}/{Total} containers",
            collectedCount, containers.Count);
    }
}
