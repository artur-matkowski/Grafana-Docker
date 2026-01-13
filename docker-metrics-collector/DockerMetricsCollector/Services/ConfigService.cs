using System.Text.Json;
using DockerMetricsCollector.Models;

namespace DockerMetricsCollector.Services;

/// <summary>
/// Manages collector configuration with file persistence.
/// </summary>
public class ConfigService
{
    private readonly string _configPath;
    private readonly ILogger<ConfigService> _logger;
    private readonly object _lock = new();
    private readonly HttpClient _httpClient;

    private CollectorConfig _config;

    public event EventHandler<ConfigChangedEventArgs>? ConfigChanged;

    public ConfigService(string configPath, ILogger<ConfigService> logger, HttpClient httpClient)
    {
        _configPath = configPath;
        _logger = logger;
        _httpClient = httpClient;
        _config = LoadOrCreateDefault();
    }

    public CollectorConfig GetConfig()
    {
        lock (_lock)
        {
            return _config with { Hosts = new List<DockerHostConfig>(_config.Hosts) };
        }
    }

    public List<DockerHostConfig> GetHosts()
    {
        lock (_lock)
        {
            return new List<DockerHostConfig>(_config.Hosts);
        }
    }

    public DockerHostConfig? GetHost(string id)
    {
        lock (_lock)
        {
            return _config.Hosts.FirstOrDefault(h => h.Id == id);
        }
    }

    public DockerHostConfig AddHost(string name, string url, bool enabled = true)
    {
        var host = new DockerHostConfig(
            Id: Guid.NewGuid().ToString(),
            Name: name,
            Url: url.TrimEnd('/'),
            Enabled: enabled
        );

        lock (_lock)
        {
            _config = _config with { Hosts = new List<DockerHostConfig>(_config.Hosts) { host } };
            Save();
        }

        _logger.LogInformation("Added Docker host: {Name} ({Url})", host.Name, host.Url);
        ConfigChanged?.Invoke(this, new ConfigChangedEventArgs { AddedHosts = new List<DockerHostConfig> { host } });

        return host;
    }

    public bool UpdateHost(string id, string? name = null, string? url = null, bool? enabled = null)
    {
        lock (_lock)
        {
            var index = _config.Hosts.FindIndex(h => h.Id == id);
            if (index < 0) return false;

            var existing = _config.Hosts[index];
            var updated = existing with
            {
                Name = name ?? existing.Name,
                Url = url?.TrimEnd('/') ?? existing.Url,
                Enabled = enabled ?? existing.Enabled
            };

            var hosts = new List<DockerHostConfig>(_config.Hosts);
            hosts[index] = updated;
            _config = _config with { Hosts = hosts };
            Save();

            _logger.LogInformation("Updated Docker host: {Name} ({Id})", updated.Name, updated.Id);
            ConfigChanged?.Invoke(this, new ConfigChangedEventArgs { UpdatedHosts = new List<DockerHostConfig> { updated } });

            return true;
        }
    }

    public bool RemoveHost(string id)
    {
        DockerHostConfig? removed;

        lock (_lock)
        {
            removed = _config.Hosts.FirstOrDefault(h => h.Id == id);
            if (removed == null) return false;

            var hosts = new List<DockerHostConfig>(_config.Hosts);
            hosts.RemoveAll(h => h.Id == id);
            _config = _config with { Hosts = hosts };
            Save();
        }

        _logger.LogInformation("Removed Docker host: {Name} ({Id})", removed.Name, removed.Id);
        ConfigChanged?.Invoke(this, new ConfigChangedEventArgs { RemovedHosts = new List<DockerHostConfig> { removed } });

        return true;
    }

    private CollectorConfig LoadOrCreateDefault()
    {
        if (File.Exists(_configPath))
        {
            try
            {
                var json = File.ReadAllText(_configPath);
                var config = JsonSerializer.Deserialize<CollectorConfig>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                if (config != null)
                {
                    _logger.LogInformation("Loaded config with {Count} hosts from {Path}", config.Hosts.Count, _configPath);
                    return config;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to load config from {Path}, creating default", _configPath);
            }
        }

        // Create default config
        var defaultConfig = CollectorConfig.CreateDefault();

        // Try to add localhost if reachable
        if (TryCheckLocalDocker())
        {
            var localHost = new DockerHostConfig(
                Id: Guid.NewGuid().ToString(),
                Name: "Local Docker",
                Url: "http://localhost:2375",
                Enabled: true
            );
            defaultConfig = defaultConfig with { Hosts = new List<DockerHostConfig> { localHost } };
            _logger.LogInformation("Auto-detected local Docker at localhost:2375");
        }
        else
        {
            _logger.LogInformation("No local Docker detected, starting with empty config");
        }

        SaveConfig(defaultConfig);
        return defaultConfig;
    }

    private bool TryCheckLocalDocker()
    {
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
            var response = _httpClient.GetAsync("http://localhost:2375/_ping", cts.Token).Result;
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private void Save()
    {
        SaveConfig(_config);
    }

    private void SaveConfig(CollectorConfig config)
    {
        try
        {
            var json = JsonSerializer.Serialize(config, new JsonSerializerOptions
            {
                WriteIndented = true,
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            });
            File.WriteAllText(_configPath, json);
            _logger.LogDebug("Saved config to {Path}", _configPath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save config to {Path}", _configPath);
        }
    }
}

public class ConfigChangedEventArgs : EventArgs
{
    public List<DockerHostConfig> AddedHosts { get; init; } = new();
    public List<DockerHostConfig> RemovedHosts { get; init; } = new();
    public List<DockerHostConfig> UpdatedHosts { get; init; } = new();
}
