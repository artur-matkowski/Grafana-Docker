namespace DockerMetricsCollector.Services;

using System.Collections.Concurrent;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using DockerMetricsCollector.Models;

/// <summary>
/// Background service that periodically collects metrics from all configured Docker hosts.
/// </summary>
public class DockerCollectorService : BackgroundService
{
    private readonly ConfigService _configService;
    private readonly DockerClientFactory _clientFactory;
    private readonly HostHealthService _healthService;
    private readonly MetricsStore _metricsStore;
    private readonly ILogger<DockerCollectorService> _logger;
    private readonly TimeSpan _pollInterval;
    private readonly TimeSpan _trimInterval;

    private readonly ConcurrentDictionary<string, DockerClient> _clients = new();
    private DateTimeOffset _lastTrimTime = DateTimeOffset.MinValue;

    public DockerCollectorService(
        ConfigService configService,
        DockerClientFactory clientFactory,
        HostHealthService healthService,
        MetricsStore metricsStore,
        ILogger<DockerCollectorService> logger)
    {
        _configService = configService;
        _clientFactory = clientFactory;
        _healthService = healthService;
        _metricsStore = metricsStore;
        _logger = logger;

        var settings = _configService.GetConfig().Settings;
        _pollInterval = TimeSpan.FromSeconds(settings.PollIntervalSeconds);
        _trimInterval = TimeSpan.FromMinutes(5);

        // Subscribe to config changes
        _configService.ConfigChanged += OnConfigChanged;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Docker Collector Service starting. Poll interval: {Interval}s",
            _pollInterval.TotalSeconds);

        // Initialize clients for all enabled hosts
        RefreshClients();

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CollectFromAllHostsAsync(stoppingToken);

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
                _logger.LogError(ex, "Error in collection cycle");
            }

            await Task.Delay(_pollInterval, stoppingToken);
        }

        _logger.LogInformation("Docker Collector Service stopping");
    }

    private async Task CollectFromAllHostsAsync(CancellationToken stoppingToken)
    {
        if (_clients.IsEmpty)
        {
            _logger.LogDebug("No Docker hosts configured");
            return;
        }

        // Collect from all hosts in parallel
        var tasks = _clients.Values
            .Select(client => CollectFromHostAsync(client, stoppingToken))
            .ToArray();

        await Task.WhenAll(tasks);
    }

    private async Task CollectFromHostAsync(DockerClient client, CancellationToken stoppingToken)
    {
        try
        {
            // Get list of containers
            var containers = await client.GetContainersAsync();
            _logger.LogDebug("Host {Host}: Found {Count} containers", client.HostName, containers.Count);

            // Collect stats for each container
            var collectedCount = 0;
            foreach (var container in containers)
            {
                if (stoppingToken.IsCancellationRequested) break;

                var snapshot = await client.GetContainerStatsAsync(container.Id, container.Name);
                if (snapshot != null)
                {
                    _metricsStore.AddContainerSnapshot(snapshot);
                    collectedCount++;
                }
            }

            _logger.LogDebug("Host {Host}: Collected metrics for {Count} containers",
                client.HostName, collectedCount);

            _healthService.UpdateHealth(client.HostId, true);
        }
        catch (Exception ex)
        {
            _healthService.UpdateHealth(client.HostId, false, ex.Message);
            _logger.LogWarning(ex, "Failed to collect from host {Host} ({Url})",
                client.HostName, client.BaseUrl);
        }
    }

    private void OnConfigChanged(object? sender, ConfigChangedEventArgs e)
    {
        _logger.LogInformation("Config changed, refreshing Docker clients");
        RefreshClients();

        // Clean up data for removed hosts
        foreach (var host in e.RemovedHosts)
        {
            _metricsStore.RemoveHostData(host.Id);
            _healthService.RemoveHost(host.Id);
        }
    }

    private void RefreshClients()
    {
        var hosts = _configService.GetHosts();
        var enabledHostIds = hosts.Where(h => h.Enabled).Select(h => h.Id).ToHashSet();

        // Remove clients for hosts that are no longer enabled or exist
        var clientsToRemove = _clients.Keys.Where(id => !enabledHostIds.Contains(id)).ToList();
        foreach (var id in clientsToRemove)
        {
            _clients.TryRemove(id, out _);
            _logger.LogDebug("Removed client for host {HostId}", id);
        }

        // Add/update clients for enabled hosts
        foreach (var host in hosts.Where(h => h.Enabled))
        {
            if (!_clients.ContainsKey(host.Id))
            {
                var client = _clientFactory.CreateClient(host);
                _clients[host.Id] = client;
                _logger.LogInformation("Added client for host {Host} ({Url})", host.Name, host.Url);
            }
        }

        _logger.LogInformation("Active Docker clients: {Count}", _clients.Count);
    }

    public override void Dispose()
    {
        _configService.ConfigChanged -= OnConfigChanged;
        base.Dispose();
    }
}
