namespace DockerMetricsCollector.Models;

/// <summary>
/// Configuration for the metrics collector, persisted to config.json.
/// </summary>
public record CollectorConfig(
    List<DockerHostConfig> Hosts,
    CollectorSettings Settings
)
{
    public static CollectorConfig CreateDefault() => new(
        Hosts: new List<DockerHostConfig>(),
        Settings: new CollectorSettings(
            PollIntervalSeconds: 10,
            RetentionHours: 24
        )
    );
}

public record CollectorSettings(
    int PollIntervalSeconds,
    int RetentionHours
);
