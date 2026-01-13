using DockerMetricsCollector.Models;

namespace DockerMetricsCollector.Services;

/// <summary>
/// Factory for creating DockerClient instances for each host.
/// </summary>
public class DockerClientFactory
{
    private readonly IHttpClientFactory _httpClientFactory;

    public DockerClientFactory(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
    }

    public DockerClient CreateClient(DockerHostConfig host)
    {
        var httpClient = _httpClientFactory.CreateClient($"docker-{host.Id}");
        return new DockerClient(httpClient, host.Id, host.Name, host.Url);
    }
}
