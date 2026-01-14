using DockerMetricsAgent.Models;
using DockerMetricsAgent.Services;

var builder = WebApplication.CreateBuilder(args);

// Get hostname for agent info
var hostname = Environment.GetEnvironmentVariable("HOSTNAME") ??
               Environment.GetEnvironmentVariable("COMPUTERNAME") ??
               System.Net.Dns.GetHostName();

// Register services
builder.Services.AddSingleton<PsiReader>();
builder.Services.AddSingleton<LocalDockerClient>();
builder.Services.AddSingleton<MetricsCache>();
builder.Services.AddHostedService<CollectorService>();

// Add CORS for Grafana panel access
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.Build();

// Enable CORS
app.UseCors();

const string AgentVersion = "1.1.1";

// =====================
// Health & Info Endpoints
// =====================

app.MapGet("/", (LocalDockerClient docker, PsiReader psi) => new
{
    service = "Docker Metrics Agent",
    version = AgentVersion,
    hostname = hostname,
    status = "running",
    timestamp = DateTimeOffset.UtcNow
});

app.MapGet("/api/info", async (LocalDockerClient docker, PsiReader psi) =>
{
    var connected = await docker.CheckConnectionAsync();
    return Results.Ok(new AgentInfo(
        Hostname: hostname,
        AgentVersion: AgentVersion,
        DockerVersion: docker.DockerVersion ?? "unknown",
        DockerConnected: connected,
        PsiSupported: psi.IsPsiSupported
    ));
});

// =====================
// Container Endpoints
// =====================

// List all containers
app.MapGet("/api/containers", async (LocalDockerClient docker, bool? all) =>
{
    var containers = await docker.GetContainersAsync(all ?? false);
    return Results.Ok(containers);
});

// Get container status (real-time)
app.MapGet("/api/containers/{containerId}/status", async (LocalDockerClient docker, string containerId) =>
{
    var status = await docker.GetContainerStatusAsync(containerId);
    if (status == null)
    {
        return Results.NotFound(new { error = "Container not found" });
    }
    return Results.Ok(status);
});

// =====================
// Metrics Endpoints
// =====================

// Get all metrics (with optional filters)
app.MapGet("/api/metrics", (
    MetricsCache cache,
    string? containerId,      // Single container (legacy support)
    string? containerIds,     // Comma-separated container IDs
    string? fields,           // Comma-separated field names to include
    DateTimeOffset? from,
    DateTimeOffset? to,
    int? limit,               // Max points per container
    bool? latest) =>          // Return only latest point per container
{
    // Parse container IDs (support both single and multiple)
    IEnumerable<string>? containerIdList = null;
    if (!string.IsNullOrEmpty(containerIds))
    {
        containerIdList = containerIds.Split(',', StringSplitOptions.RemoveEmptyEntries);
    }
    else if (!string.IsNullOrEmpty(containerId))
    {
        containerIdList = new[] { containerId };
    }

    var metrics = cache.GetMetrics(containerIdList, from, to, limit, latest ?? false).ToList();

    // If fields filter specified, project to only those fields
    if (!string.IsNullOrEmpty(fields))
    {
        var fieldSet = fields.Split(',', StringSplitOptions.RemoveEmptyEntries)
            .Select(f => f.Trim().ToLowerInvariant())
            .ToHashSet();

        // Always include these base fields
        fieldSet.Add("containerid");
        fieldSet.Add("containername");
        fieldSet.Add("timestamp");
        fieldSet.Add("isrunning");
        fieldSet.Add("ispaused");

        var projected = metrics.Select(m => ProjectFields(m, fieldSet)).ToList();
        return Results.Ok(projected);
    }

    return Results.Ok(metrics);
});

// Helper to project only selected fields
static Dictionary<string, object?> ProjectFields(ContainerMetrics m, HashSet<string> fields)
{
    var result = new Dictionary<string, object?>
    {
        ["containerId"] = m.ContainerId,
        ["containerName"] = m.ContainerName,
        ["timestamp"] = m.Timestamp,
        ["isRunning"] = m.IsRunning,
        ["isPaused"] = m.IsPaused
    };

    if (fields.Contains("cpupercent")) result["cpuPercent"] = m.CpuPercent;
    if (fields.Contains("memorybytes")) result["memoryBytes"] = m.MemoryBytes;
    if (fields.Contains("memorypercent")) result["memoryPercent"] = m.MemoryPercent;
    if (fields.Contains("networkrxbytes")) result["networkRxBytes"] = m.NetworkRxBytes;
    if (fields.Contains("networktxbytes")) result["networkTxBytes"] = m.NetworkTxBytes;
    if (fields.Contains("diskreadbytes")) result["diskReadBytes"] = m.DiskReadBytes;
    if (fields.Contains("diskwritebytes")) result["diskWriteBytes"] = m.DiskWriteBytes;
    if (fields.Contains("uptimeseconds")) result["uptimeSeconds"] = m.UptimeSeconds;
    if (fields.Contains("cpupressure")) result["cpuPressure"] = m.CpuPressure;
    if (fields.Contains("memorypressure")) result["memoryPressure"] = m.MemoryPressure;
    if (fields.Contains("iopressure")) result["ioPressure"] = m.IoPressure;

    return result;
}

// Get latest metrics for all containers
app.MapGet("/api/metrics/latest", (MetricsCache cache) =>
{
    var metrics = cache.GetLatestMetrics().ToList();
    return Results.Ok(metrics);
});

// =====================
// Container Control Endpoints
// =====================

app.MapPost("/api/containers/{containerId}/start", async (LocalDockerClient docker, string containerId) =>
{
    var (success, error) = await docker.StartContainerAsync(containerId);
    if (success)
        return Results.Ok(new { success = true, action = "start", containerId });
    return Results.BadRequest(new { success = false, error });
});

app.MapPost("/api/containers/{containerId}/stop", async (LocalDockerClient docker, string containerId) =>
{
    var (success, error) = await docker.StopContainerAsync(containerId);
    if (success)
        return Results.Ok(new { success = true, action = "stop", containerId });
    return Results.BadRequest(new { success = false, error });
});

app.MapPost("/api/containers/{containerId}/restart", async (LocalDockerClient docker, string containerId) =>
{
    var (success, error) = await docker.RestartContainerAsync(containerId);
    if (success)
        return Results.Ok(new { success = true, action = "restart", containerId });
    return Results.BadRequest(new { success = false, error });
});

app.MapPost("/api/containers/{containerId}/pause", async (LocalDockerClient docker, string containerId) =>
{
    var (success, error) = await docker.PauseContainerAsync(containerId);
    if (success)
        return Results.Ok(new { success = true, action = "pause", containerId });
    return Results.BadRequest(new { success = false, error });
});

app.MapPost("/api/containers/{containerId}/unpause", async (LocalDockerClient docker, string containerId) =>
{
    var (success, error) = await docker.UnpauseContainerAsync(containerId);
    if (success)
        return Results.Ok(new { success = true, action = "unpause", containerId });
    return Results.BadRequest(new { success = false, error });
});

// =====================
// Stats Endpoint
// =====================

app.MapGet("/api/stats", (MetricsCache cache, PsiReader psi) =>
{
    var (containerCount, totalSnapshots) = cache.GetStats();
    return Results.Ok(new
    {
        hostname,
        agentVersion = AgentVersion,
        psiSupported = psi.IsPsiSupported,
        containerCount,
        totalSnapshots,
        timestamp = DateTimeOffset.UtcNow
    });
});

// Get port from environment or use default
var port = Environment.GetEnvironmentVariable("PORT") ?? "5000";

Console.WriteLine($"Docker Metrics Agent v{AgentVersion} starting...");
Console.WriteLine($"Hostname: {hostname}");
Console.WriteLine($"API available at: http://0.0.0.0:{port}");

app.Run($"http://0.0.0.0:{port}");
