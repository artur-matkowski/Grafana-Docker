using DockerMetricsCollector.Services;

var builder = WebApplication.CreateBuilder(args);

// Load configuration
var dockerBaseUrl = builder.Configuration["DockerApi:BaseUrl"] ?? "http://localhost:2375";

// Register services
builder.Services.AddSingleton<MetricsStore>();
builder.Services.AddSingleton(sp => new HttpClient());
builder.Services.AddSingleton(sp => new DockerClient(
    sp.GetRequiredService<HttpClient>(),
    dockerBaseUrl
));
builder.Services.AddHostedService(sp => new DockerCollectorService(
    sp.GetRequiredService<DockerClient>(),
    sp.GetRequiredService<MetricsStore>(),
    sp.GetRequiredService<ILogger<DockerCollectorService>>()
));

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

// Health check endpoint
app.MapGet("/", () => new
{
    service = "Docker Metrics Collector",
    status = "running",
    timestamp = DateTimeOffset.UtcNow
});

// Get list of known containers
app.MapGet("/api/containers", (MetricsStore store) =>
{
    var containerIds = store.GetKnownContainerIds().ToList();
    return Results.Ok(containerIds);
});

// Get container metrics
app.MapGet("/api/metrics/containers", (
    MetricsStore store,
    string? id,
    DateTimeOffset? from,
    DateTimeOffset? to) =>
{
    if (string.IsNullOrEmpty(id))
    {
        return Results.BadRequest(new { error = "Container ID is required. Use ?id=containerId" });
    }

    var metrics = store.GetContainerMetrics(id, from, to).ToList();
    return Results.Ok(metrics);
});

// Get host metrics
app.MapGet("/api/metrics/hosts", (
    MetricsStore store,
    DateTimeOffset? from,
    DateTimeOffset? to) =>
{
    var metrics = store.GetHostMetrics(from, to).ToList();
    return Results.Ok(metrics);
});

// Get store stats (for debugging)
app.MapGet("/api/stats", (MetricsStore store) =>
{
    var containerIds = store.GetKnownContainerIds().ToList();
    var containerCounts = containerIds.ToDictionary(
        id => id,
        id => store.GetContainerMetrics(id).Count()
    );
    var hostCount = store.GetHostMetrics().Count();

    return Results.Ok(new
    {
        containers = containerCounts,
        hostMetricsCount = hostCount,
        timestamp = DateTimeOffset.UtcNow
    });
});

Console.WriteLine($"Docker Metrics Collector starting...");
Console.WriteLine($"Docker API: {dockerBaseUrl}");
Console.WriteLine($"API available at: http://localhost:5000");

app.Run("http://0.0.0.0:5000");
