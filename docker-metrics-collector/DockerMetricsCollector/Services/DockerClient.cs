namespace DockerMetricsCollector.Services;

using System.Text.Json;
using DockerMetricsCollector.Models;

/// <summary>
/// Client for interacting with Docker Engine API.
/// </summary>
public class DockerClient
{
    private readonly HttpClient _httpClient;
    private readonly string _baseUrl;
    private readonly string _hostId;
    private readonly string _hostName;

    public DockerClient(HttpClient httpClient, string hostId, string hostName, string baseUrl)
    {
        _httpClient = httpClient;
        _hostId = hostId;
        _hostName = hostName;
        _baseUrl = baseUrl.TrimEnd('/');
    }

    public string HostId => _hostId;
    public string HostName => _hostName;
    public string BaseUrl => _baseUrl;

    /// <summary>
    /// Check if Docker API is reachable.
    /// </summary>
    public async Task<bool> CheckHealthAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(TimeSpan.FromSeconds(5));
            var response = await _httpClient.GetAsync($"{_baseUrl}/_ping", cts.Token);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Get list of running containers with basic info.
    /// </summary>
    public async Task<List<DockerContainerInfo>> GetContainersAsync()
    {
        var response = await _httpClient.GetAsync($"{_baseUrl}/containers/json");
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync();
        var containers = JsonSerializer.Deserialize<JsonElement[]>(json) ?? [];

        var result = new List<DockerContainerInfo>();
        foreach (var container in containers)
        {
            var id = container.GetProperty("Id").GetString() ?? "";
            var names = container.GetProperty("Names").EnumerateArray()
                .FirstOrDefault().GetString() ?? "";
            var state = container.GetProperty("State").GetString() ?? "";
            var created = container.GetProperty("Created").GetInt64();

            result.Add(new DockerContainerInfo(id, names, state, created));
        }

        return result;
    }

    /// <summary>
    /// Get stats for a specific container and convert to a metric snapshot.
    /// </summary>
    public async Task<ContainerMetricSnapshot?> GetContainerStatsAsync(string containerId, string containerName)
    {
        try
        {
            var response = await _httpClient.GetAsync(
                $"{_baseUrl}/containers/{containerId}/stats?stream=false");

            if (!response.IsSuccessStatusCode)
                return null;

            var json = await response.Content.ReadAsStringAsync();
            var stats = JsonSerializer.Deserialize<JsonElement>(json);

            return ParseContainerStats(_hostId, _hostName, containerId, containerName, stats);
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Start a stopped container.
    /// </summary>
    public async Task<(bool Success, string? Error)> StartContainerAsync(string containerId)
    {
        try
        {
            var response = await _httpClient.PostAsync(
                $"{_baseUrl}/containers/{containerId}/start", null);

            if (response.IsSuccessStatusCode || response.StatusCode == System.Net.HttpStatusCode.NotModified)
                return (true, null);

            var error = await response.Content.ReadAsStringAsync();
            return (false, $"Failed to start container: {response.StatusCode} - {error}");
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    /// <summary>
    /// Stop a running container.
    /// </summary>
    public async Task<(bool Success, string? Error)> StopContainerAsync(string containerId, int timeoutSeconds = 10)
    {
        try
        {
            var response = await _httpClient.PostAsync(
                $"{_baseUrl}/containers/{containerId}/stop?t={timeoutSeconds}", null);

            if (response.IsSuccessStatusCode || response.StatusCode == System.Net.HttpStatusCode.NotModified)
                return (true, null);

            var error = await response.Content.ReadAsStringAsync();
            return (false, $"Failed to stop container: {response.StatusCode} - {error}");
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    /// <summary>
    /// Restart a container.
    /// </summary>
    public async Task<(bool Success, string? Error)> RestartContainerAsync(string containerId, int timeoutSeconds = 10)
    {
        try
        {
            var response = await _httpClient.PostAsync(
                $"{_baseUrl}/containers/{containerId}/restart?t={timeoutSeconds}", null);

            if (response.IsSuccessStatusCode)
                return (true, null);

            var error = await response.Content.ReadAsStringAsync();
            return (false, $"Failed to restart container: {response.StatusCode} - {error}");
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    /// <summary>
    /// Pause a running container.
    /// </summary>
    public async Task<(bool Success, string? Error)> PauseContainerAsync(string containerId)
    {
        try
        {
            var response = await _httpClient.PostAsync(
                $"{_baseUrl}/containers/{containerId}/pause", null);

            if (response.IsSuccessStatusCode)
                return (true, null);

            var error = await response.Content.ReadAsStringAsync();
            return (false, $"Failed to pause container: {response.StatusCode} - {error}");
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    /// <summary>
    /// Unpause a paused container.
    /// </summary>
    public async Task<(bool Success, string? Error)> UnpauseContainerAsync(string containerId)
    {
        try
        {
            var response = await _httpClient.PostAsync(
                $"{_baseUrl}/containers/{containerId}/unpause", null);

            if (response.IsSuccessStatusCode)
                return (true, null);

            var error = await response.Content.ReadAsStringAsync();
            return (false, $"Failed to unpause container: {response.StatusCode} - {error}");
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    private static ContainerMetricSnapshot? ParseContainerStats(
        string hostId,
        string hostName,
        string containerId,
        string containerName,
        JsonElement stats)
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

            // CPU stats - calculate percentage
            double cpuPercent = 0;
            if (stats.TryGetProperty("cpu_stats", out var cpuStats) &&
                stats.TryGetProperty("precpu_stats", out var preCpuStats))
            {
                cpuPercent = CalculateCpuPercent(cpuStats, preCpuStats);
            }

            // Network stats (aggregated across all interfaces)
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

            // Disk I/O stats (aggregated)
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

            // PSI pressure metrics (if available - requires cgroups v2)
            double? cpuPressureSome = null, cpuPressureFull = null;
            double? memPressureSome = null, memPressureFull = null;
            double? ioPressureSome = null, ioPressureFull = null;

            // CPU pressure
            if (cpuStats.TryGetProperty("pressure", out var cpuPressure))
            {
                if (cpuPressure.TryGetProperty("some", out var some))
                    cpuPressureSome = some.GetDouble();
                if (cpuPressure.TryGetProperty("full", out var full))
                    cpuPressureFull = full.GetDouble();
            }

            // Memory pressure
            if (stats.TryGetProperty("memory_stats", out var memStatsForPressure) &&
                memStatsForPressure.TryGetProperty("pressure", out var memPressure))
            {
                if (memPressure.TryGetProperty("some", out var some))
                    memPressureSome = some.GetDouble();
                if (memPressure.TryGetProperty("full", out var full))
                    memPressureFull = full.GetDouble();
            }

            // IO pressure (from blkio_stats)
            if (blkio.TryGetProperty("pressure", out var ioPressure))
            {
                if (ioPressure.TryGetProperty("some", out var some))
                    ioPressureSome = some.GetDouble();
                if (ioPressure.TryGetProperty("full", out var full))
                    ioPressureFull = full.GetDouble();
            }

            // Container uptime (approximate - from read timestamp)
            // Note: For accurate uptime, we'd need to call /containers/{id}/json
            long uptimeSeconds = 0;

            return new ContainerMetricSnapshot(
                HostId: hostId,
                HostName: hostName,
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
                UptimeSeconds: uptimeSeconds,
                IsRunning: true,
                CpuPressureSome: cpuPressureSome,
                CpuPressureFull: cpuPressureFull,
                MemoryPressureSome: memPressureSome,
                MemoryPressureFull: memPressureFull,
                IoPressureSome: ioPressureSome,
                IoPressureFull: ioPressureFull
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
            // Get current CPU usage
            var cpuUsage = cpuStats.GetProperty("cpu_usage");
            var totalUsage = cpuUsage.GetProperty("total_usage").GetInt64();

            // Get previous CPU usage
            var preCpuUsage = preCpuStats.GetProperty("cpu_usage");
            var preTotalUsage = preCpuUsage.GetProperty("total_usage").GetInt64();

            // Get system CPU usage
            var systemUsage = cpuStats.GetProperty("system_cpu_usage").GetInt64();
            var preSystemUsage = preCpuStats.GetProperty("system_cpu_usage").GetInt64();

            // Calculate deltas
            var cpuDelta = totalUsage - preTotalUsage;
            var systemDelta = systemUsage - preSystemUsage;

            if (systemDelta <= 0 || cpuDelta < 0)
                return 0;

            // Get number of CPUs
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

/// <summary>
/// Basic container information from Docker API.
/// </summary>
public record DockerContainerInfo(
    string Id,
    string Name,
    string State,
    long Created
);
