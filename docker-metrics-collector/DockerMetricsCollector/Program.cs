using DockerMetricsCollector.Models;
using DockerMetricsCollector.Services;

var builder = WebApplication.CreateBuilder(args);

// Determine config file path
var configPath = Path.Combine(AppContext.BaseDirectory, "config.json");

// Register HttpClient factory
builder.Services.AddHttpClient();

// Register singleton services
builder.Services.AddSingleton<MetricsStore>();
builder.Services.AddSingleton<HostHealthService>();
builder.Services.AddSingleton<DockerClientFactory>();
builder.Services.AddSingleton(sp => new ConfigService(
    configPath,
    sp.GetRequiredService<ILogger<ConfigService>>(),
    sp.GetRequiredService<IHttpClientFactory>().CreateClient()
));

// Register background collector service
builder.Services.AddHostedService<DockerCollectorService>();

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

// =====================
// Health Check
// =====================
app.MapGet("/", () => new
{
    service = "Docker Metrics Collector",
    status = "running",
    timestamp = DateTimeOffset.UtcNow
});

// =====================
// Configuration Endpoints
// =====================

// Get current configuration
app.MapGet("/api/config", (ConfigService config) =>
{
    return Results.Ok(config.GetConfig());
});

// Add a new Docker host
app.MapPost("/api/config/hosts", (ConfigService config, AddHostRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.Name))
    {
        return Results.BadRequest(new { error = "Name is required" });
    }
    if (string.IsNullOrWhiteSpace(request.Url))
    {
        return Results.BadRequest(new { error = "URL is required" });
    }

    var host = config.AddHost(request.Name, request.Url, request.Enabled ?? true);
    return Results.Created($"/api/config/hosts/{host.Id}", host);
});

// Update a Docker host
app.MapPut("/api/config/hosts/{id}", (ConfigService config, string id, UpdateHostRequest request) =>
{
    var success = config.UpdateHost(id, request.Name, request.Url, request.Enabled);
    if (!success)
    {
        return Results.NotFound(new { error = "Host not found" });
    }

    var host = config.GetHost(id);
    return Results.Ok(host);
});

// Remove a Docker host
app.MapDelete("/api/config/hosts/{id}", (ConfigService config, string id) =>
{
    var success = config.RemoveHost(id);
    if (!success)
    {
        return Results.NotFound(new { error = "Host not found" });
    }
    return Results.NoContent();
});

// =====================
// Host Status Endpoints
// =====================

// Get all hosts with health status
app.MapGet("/api/hosts", (ConfigService config, HostHealthService health, MetricsStore store) =>
{
    var hosts = config.GetHosts();
    var healthInfo = health.GetAllHealth();
    var containerCounts = store.GetContainerCountByHost();

    var result = hosts.Select(h =>
    {
        healthInfo.TryGetValue(h.Id, out var hostHealth);
        containerCounts.TryGetValue(h.Id, out var count);

        return new DockerHostStatus(
            Id: h.Id,
            Name: h.Name,
            Url: h.Url,
            Enabled: h.Enabled,
            LastSeen: hostHealth?.LastChecked,
            IsHealthy: hostHealth?.IsHealthy ?? false,
            LastError: hostHealth?.LastError,
            ContainerCount: count
        );
    });

    return Results.Ok(result);
});

// =====================
// Container Endpoints
// =====================

// Get list of known containers (with host info)
app.MapGet("/api/containers", (MetricsStore store, string? hostId) =>
{
    var containers = store.GetKnownContainers(hostId).ToList();
    return Results.Ok(containers);
});

// Get container metrics
app.MapGet("/api/metrics/containers", (
    MetricsStore store,
    string? id,
    string? hostId,
    DateTimeOffset? from,
    DateTimeOffset? to) =>
{
    // Allow querying by hostId only (all containers from host)
    // or by id only (specific container across all hosts)
    // or by both (specific container on specific host)
    var metrics = store.GetContainerMetrics(hostId, id, from, to).ToList();
    return Results.Ok(metrics);
});

// =====================
// Host Metrics Endpoints
// =====================

// Get host metrics
app.MapGet("/api/metrics/hosts", (
    MetricsStore store,
    DateTimeOffset? from,
    DateTimeOffset? to) =>
{
    var metrics = store.GetHostMetrics(from, to).ToList();
    return Results.Ok(metrics);
});

// =====================
// Container Control Endpoints
// =====================

// Start a container
app.MapPost("/api/containers/{hostId}/{containerId}/start", async (
    ConfigService config,
    DockerClientFactory clientFactory,
    string hostId,
    string containerId) =>
{
    var host = config.GetHost(hostId);
    if (host == null)
    {
        return Results.NotFound(new { error = "Host not found" });
    }

    var client = clientFactory.CreateClient(host);
    var (success, error) = await client.StartContainerAsync(containerId);

    if (success)
    {
        return Results.Ok(new { success = true, action = "start", containerId });
    }
    return Results.BadRequest(new { success = false, error });
});

// Stop a container
app.MapPost("/api/containers/{hostId}/{containerId}/stop", async (
    ConfigService config,
    DockerClientFactory clientFactory,
    string hostId,
    string containerId) =>
{
    var host = config.GetHost(hostId);
    if (host == null)
    {
        return Results.NotFound(new { error = "Host not found" });
    }

    var client = clientFactory.CreateClient(host);
    var (success, error) = await client.StopContainerAsync(containerId);

    if (success)
    {
        return Results.Ok(new { success = true, action = "stop", containerId });
    }
    return Results.BadRequest(new { success = false, error });
});

// Restart a container
app.MapPost("/api/containers/{hostId}/{containerId}/restart", async (
    ConfigService config,
    DockerClientFactory clientFactory,
    string hostId,
    string containerId) =>
{
    var host = config.GetHost(hostId);
    if (host == null)
    {
        return Results.NotFound(new { error = "Host not found" });
    }

    var client = clientFactory.CreateClient(host);
    var (success, error) = await client.RestartContainerAsync(containerId);

    if (success)
    {
        return Results.Ok(new { success = true, action = "restart", containerId });
    }
    return Results.BadRequest(new { success = false, error });
});

// Pause a container
app.MapPost("/api/containers/{hostId}/{containerId}/pause", async (
    ConfigService config,
    DockerClientFactory clientFactory,
    string hostId,
    string containerId) =>
{
    var host = config.GetHost(hostId);
    if (host == null)
    {
        return Results.NotFound(new { error = "Host not found" });
    }

    var client = clientFactory.CreateClient(host);
    var (success, error) = await client.PauseContainerAsync(containerId);

    if (success)
    {
        return Results.Ok(new { success = true, action = "pause", containerId });
    }
    return Results.BadRequest(new { success = false, error });
});

// Unpause a container
app.MapPost("/api/containers/{hostId}/{containerId}/unpause", async (
    ConfigService config,
    DockerClientFactory clientFactory,
    string hostId,
    string containerId) =>
{
    var host = config.GetHost(hostId);
    if (host == null)
    {
        return Results.NotFound(new { error = "Host not found" });
    }

    var client = clientFactory.CreateClient(host);
    var (success, error) = await client.UnpauseContainerAsync(containerId);

    if (success)
    {
        return Results.Ok(new { success = true, action = "unpause", containerId });
    }
    return Results.BadRequest(new { success = false, error });
});

// =====================
// Debug Endpoints
// =====================

// Get store stats (for debugging)
app.MapGet("/api/stats", (MetricsStore store, ConfigService config) =>
{
    var containers = store.GetKnownContainers().ToList();
    var containersByHost = containers
        .GroupBy(c => c.HostName)
        .ToDictionary(g => g.Key, g => g.Count());
    var hostCount = store.GetHostMetrics().Count();

    return Results.Ok(new
    {
        hosts = config.GetHosts().Count,
        containers = containers.Count,
        containersByHost,
        hostMetricsCount = hostCount,
        timestamp = DateTimeOffset.UtcNow
    });
});

Console.WriteLine($"Docker Metrics Collector starting...");
Console.WriteLine($"Config file: {configPath}");
Console.WriteLine($"API available at: http://localhost:5000");

app.Run("http://0.0.0.0:5000");

// =====================
// Request DTOs
// =====================

public record AddHostRequest(string? Name, string? Url, bool? Enabled);
public record UpdateHostRequest(string? Name, string? Url, bool? Enabled);
