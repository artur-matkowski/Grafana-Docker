namespace DockerMetricsAgent.Services;

using System.Net.Sockets;
using System.Text.Json;
using DockerMetricsAgent.Models;

/// <summary>
/// Client for interacting with local Docker daemon via Unix socket.
/// </summary>
public class LocalDockerClient
{
    private readonly HttpClient _httpClient;
    private readonly PsiReader _psiReader;
    private readonly ILogger<LocalDockerClient> _logger;
    private string? _dockerVersion;

    public LocalDockerClient(PsiReader psiReader, ILogger<LocalDockerClient> logger)
    {
        _psiReader = psiReader;
        _logger = logger;

        // Create HttpClient that uses Unix socket
        var handler = new SocketsHttpHandler
        {
            ConnectCallback = async (context, cancellationToken) =>
            {
                var socket = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
                var endpoint = new UnixDomainSocketEndPoint("/var/run/docker.sock");
                await socket.ConnectAsync(endpoint, cancellationToken);
                return new NetworkStream(socket, ownsSocket: true);
            }
        };

        _httpClient = new HttpClient(handler)
        {
            BaseAddress = new Uri("http://localhost"),
            Timeout = TimeSpan.FromSeconds(30)
        };
    }

    public string? DockerVersion => _dockerVersion;

    /// <summary>
    /// Check if Docker is reachable and get version info.
    /// </summary>
    public async Task<bool> CheckConnectionAsync()
    {
        try
        {
            var response = await _httpClient.GetAsync("/version");
            if (response.IsSuccessStatusCode)
            {
                var json = await response.Content.ReadAsStringAsync();
                var version = JsonSerializer.Deserialize<JsonElement>(json);
                if (version.TryGetProperty("Version", out var v))
                {
                    _dockerVersion = v.GetString();
                }
                return true;
            }
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to connect to Docker socket");
            return false;
        }
    }

    /// <summary>
    /// Get list of all containers.
    /// </summary>
    public async Task<List<ContainerInfo>> GetContainersAsync(bool all = false)
    {
        try
        {
            var response = await _httpClient.GetAsync($"/containers/json?all={all}");
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync();
            var containers = JsonSerializer.Deserialize<JsonElement[]>(json) ?? [];

            var result = new List<ContainerInfo>();
            foreach (var container in containers)
            {
                var id = container.GetProperty("Id").GetString() ?? "";
                var names = container.GetProperty("Names").EnumerateArray()
                    .FirstOrDefault().GetString() ?? "";
                var state = container.GetProperty("State").GetString() ?? "";

                result.Add(new ContainerInfo(
                    ContainerId: id,
                    ContainerName: names,
                    State: state,
                    IsRunning: state.Equals("running", StringComparison.OrdinalIgnoreCase),
                    IsPaused: state.Equals("paused", StringComparison.OrdinalIgnoreCase)
                ));
            }

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get containers");
            return new List<ContainerInfo>();
        }
    }

    /// <summary>
    /// Get metrics for a specific container including PSI.
    /// </summary>
    public async Task<ContainerMetrics?> GetContainerMetricsAsync(string containerId, string containerName, string state)
    {
        var isRunning = state.Equals("running", StringComparison.OrdinalIgnoreCase);
        var isPaused = state.Equals("paused", StringComparison.OrdinalIgnoreCase);

        // Get PSI metrics from cgroups
        var (cpuPsi, memoryPsi, ioPsi) = _psiReader.GetContainerPsi(containerId);

        // For paused containers, return minimal metrics with PSI
        if (isPaused)
        {
            return new ContainerMetrics(
                ContainerId: containerId,
                ContainerName: containerName,
                Timestamp: DateTimeOffset.UtcNow,
                CpuPercent: 0,
                MemoryBytes: 0,
                MemoryPercent: 0,
                NetworkRxBytes: 0,
                NetworkTxBytes: 0,
                DiskReadBytes: 0,
                DiskWriteBytes: 0,
                UptimeSeconds: 0,
                IsRunning: true,
                IsPaused: true,
                CpuPressure: cpuPsi,
                MemoryPressure: memoryPsi,
                IoPressure: ioPsi
            );
        }

        try
        {
            var response = await _httpClient.GetAsync($"/containers/{containerId}/stats?stream=false");
            if (!response.IsSuccessStatusCode)
                return null;

            var json = await response.Content.ReadAsStringAsync();
            if (string.IsNullOrWhiteSpace(json))
                return null;

            var stats = JsonSerializer.Deserialize<JsonElement>(json);
            return ParseContainerStats(containerId, containerName, state, stats, cpuPsi, memoryPsi, ioPsi);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to get stats for container {ContainerId}", containerId);
            return null;
        }
    }

    /// <summary>
    /// Get real-time container status.
    /// </summary>
    public async Task<ContainerStatus?> GetContainerStatusAsync(string containerId)
    {
        try
        {
            var response = await _httpClient.GetAsync($"/containers/{containerId}/json");
            if (!response.IsSuccessStatusCode)
                return null;

            var json = await response.Content.ReadAsStringAsync();
            var container = JsonSerializer.Deserialize<JsonElement>(json);

            var stateObj = container.GetProperty("State");
            var status = stateObj.GetProperty("Status").GetString() ?? "unknown";
            var running = stateObj.GetProperty("Running").GetBoolean();
            var paused = stateObj.GetProperty("Paused").GetBoolean();
            var name = container.GetProperty("Name").GetString() ?? "";

            return new ContainerStatus(containerId, name, status, running, paused);
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Start a container.
    /// </summary>
    public async Task<(bool Success, string? Error)> StartContainerAsync(string containerId)
    {
        return await ExecuteContainerAction(containerId, "start");
    }

    /// <summary>
    /// Stop a container.
    /// </summary>
    public async Task<(bool Success, string? Error)> StopContainerAsync(string containerId)
    {
        return await ExecuteContainerAction(containerId, "stop?t=10");
    }

    /// <summary>
    /// Restart a container.
    /// </summary>
    public async Task<(bool Success, string? Error)> RestartContainerAsync(string containerId)
    {
        return await ExecuteContainerAction(containerId, "restart?t=10");
    }

    /// <summary>
    /// Pause a container.
    /// </summary>
    public async Task<(bool Success, string? Error)> PauseContainerAsync(string containerId)
    {
        return await ExecuteContainerAction(containerId, "pause");
    }

    /// <summary>
    /// Unpause a container.
    /// </summary>
    public async Task<(bool Success, string? Error)> UnpauseContainerAsync(string containerId)
    {
        return await ExecuteContainerAction(containerId, "unpause");
    }

    private async Task<(bool Success, string? Error)> ExecuteContainerAction(string containerId, string action)
    {
        try
        {
            var response = await _httpClient.PostAsync($"/containers/{containerId}/{action}", null);
            if (response.IsSuccessStatusCode || response.StatusCode == System.Net.HttpStatusCode.NotModified)
                return (true, null);

            var error = await response.Content.ReadAsStringAsync();
            return (false, $"Failed: {response.StatusCode} - {error}");
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    private ContainerMetrics? ParseContainerStats(
        string containerId,
        string containerName,
        string state,
        JsonElement stats,
        PsiMetrics? cpuPsi,
        PsiMetrics? memoryPsi,
        PsiMetrics? ioPsi)
    {
        try
        {
            // Memory stats
            long memoryBytes = 0;
            double memoryPercent = 0;
            if (stats.TryGetProperty("memory_stats", out var memStats))
            {
                if (memStats.TryGetProperty("usage", out var usage))
                    memoryBytes = usage.GetInt64();
                if (memStats.TryGetProperty("limit", out var limit) && limit.GetInt64() > 0)
                    memoryPercent = (double)memoryBytes / limit.GetInt64() * 100;
            }

            // CPU stats
            double cpuPercent = 0;
            if (stats.TryGetProperty("cpu_stats", out var cpuStats) &&
                stats.TryGetProperty("precpu_stats", out var preCpuStats))
            {
                cpuPercent = CalculateCpuPercent(cpuStats, preCpuStats);
            }

            // Network stats
            long networkRx = 0, networkTx = 0;
            if (stats.TryGetProperty("networks", out var networks))
            {
                foreach (var iface in networks.EnumerateObject())
                {
                    if (iface.Value.TryGetProperty("rx_bytes", out var rx))
                        networkRx += rx.GetInt64();
                    if (iface.Value.TryGetProperty("tx_bytes", out var tx))
                        networkTx += tx.GetInt64();
                }
            }

            // Disk I/O stats
            long diskRead = 0, diskWrite = 0;
            if (stats.TryGetProperty("blkio_stats", out var blkio) &&
                blkio.TryGetProperty("io_service_bytes_recursive", out var ioStats) &&
                ioStats.ValueKind == JsonValueKind.Array)
            {
                foreach (var entry in ioStats.EnumerateArray())
                {
                    var op = entry.GetProperty("op").GetString();
                    var value = entry.GetProperty("value").GetInt64();
                    if (op == "read" || op == "Read") diskRead += value;
                    if (op == "write" || op == "Write") diskWrite += value;
                }
            }

            var isRunning = state.Equals("running", StringComparison.OrdinalIgnoreCase);
            var isPaused = state.Equals("paused", StringComparison.OrdinalIgnoreCase);

            return new ContainerMetrics(
                ContainerId: containerId,
                ContainerName: containerName,
                Timestamp: DateTimeOffset.UtcNow,
                CpuPercent: cpuPercent,
                MemoryBytes: memoryBytes,
                MemoryPercent: memoryPercent,
                NetworkRxBytes: networkRx,
                NetworkTxBytes: networkTx,
                DiskReadBytes: diskRead,
                DiskWriteBytes: diskWrite,
                UptimeSeconds: 0,
                IsRunning: isRunning || isPaused,
                IsPaused: isPaused,
                CpuPressure: cpuPsi,
                MemoryPressure: memoryPsi,
                IoPressure: ioPsi
            );
        }
        catch
        {
            return null;
        }
    }

    private static double CalculateCpuPercent(JsonElement cpuStats, JsonElement preCpuStats)
    {
        try
        {
            var cpuUsage = cpuStats.GetProperty("cpu_usage");
            var totalUsage = cpuUsage.GetProperty("total_usage").GetInt64();

            var preCpuUsage = preCpuStats.GetProperty("cpu_usage");
            var preTotalUsage = preCpuUsage.GetProperty("total_usage").GetInt64();

            var systemUsage = cpuStats.GetProperty("system_cpu_usage").GetInt64();
            var preSystemUsage = preCpuStats.GetProperty("system_cpu_usage").GetInt64();

            var cpuDelta = totalUsage - preTotalUsage;
            var systemDelta = systemUsage - preSystemUsage;

            if (systemDelta <= 0 || cpuDelta < 0)
                return 0;

            var numCpus = 1;
            if (cpuStats.TryGetProperty("online_cpus", out var onlineCpus))
            {
                numCpus = onlineCpus.GetInt32();
            }
            else if (cpuUsage.TryGetProperty("percpu_usage", out var percpu) &&
                     percpu.ValueKind == JsonValueKind.Array)
            {
                numCpus = percpu.GetArrayLength();
            }

            return ((double)cpuDelta / systemDelta) * numCpus * 100.0;
        }
        catch
        {
            return 0;
        }
    }
}
