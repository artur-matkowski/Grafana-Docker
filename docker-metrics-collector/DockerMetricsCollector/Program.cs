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

const string AgentVersion = "2.0.0";

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
    string? containerId,
    DateTimeOffset? from,
    DateTimeOffset? to) =>
{
    var metrics = cache.GetMetrics(containerId, from, to).ToList();
    return Results.Ok(metrics);
});

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
