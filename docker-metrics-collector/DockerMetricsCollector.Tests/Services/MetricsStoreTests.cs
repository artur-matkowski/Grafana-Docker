namespace DockerMetricsCollector.Tests.Services;

using DockerMetricsCollector.Models;
using DockerMetricsCollector.Services;

public class MetricsStoreTests
{
    private static ContainerMetricSnapshot CreateContainerSnapshot(
        string containerId,
        DateTimeOffset timestamp,
        double cpuPercent = 10.0)
    {
        return new ContainerMetricSnapshot(
            containerId, $"/{containerId}", timestamp, cpuPercent,
            1000, 5.0, 100, 100, 100, 100, 60, true,
            null, null, null, null, null, null
        );
    }

    private static HostMetricSnapshot CreateHostSnapshot(
        DateTimeOffset timestamp,
        double cpuPercent = 20.0)
    {
        return new HostMetricSnapshot(
            "test-host", timestamp, cpuPercent, 3000.0,
            4_000_000_000, 50.0, 3600, true
        );
    }

    #region Container Metrics Tests

    [Fact]
    public void AddContainerSnapshot_CanBeRetrieved()
    {
        // Arrange
        var store = new MetricsStore();
        var snapshot = CreateContainerSnapshot("container1", DateTimeOffset.UtcNow);

        // Act
        store.AddContainerSnapshot(snapshot);
        var results = store.GetContainerMetrics("container1");

        // Assert
        Assert.Single(results);
        Assert.Equal(snapshot, results.First());
    }

    [Fact]
    public void GetContainerMetrics_FiltersByContainerId()
    {
        // Arrange
        var store = new MetricsStore();
        var now = DateTimeOffset.UtcNow;
        store.AddContainerSnapshot(CreateContainerSnapshot("container1", now));
        store.AddContainerSnapshot(CreateContainerSnapshot("container2", now));
        store.AddContainerSnapshot(CreateContainerSnapshot("container1", now.AddSeconds(10)));

        // Act
        var results = store.GetContainerMetrics("container1");

        // Assert
        Assert.Equal(2, results.Count());
        Assert.All(results, s => Assert.Equal("container1", s.ContainerId));
    }

    [Fact]
    public void GetContainerMetrics_FiltersByTimeRange()
    {
        // Arrange
        var store = new MetricsStore();
        var baseTime = DateTimeOffset.UtcNow;
        store.AddContainerSnapshot(CreateContainerSnapshot("c1", baseTime.AddMinutes(-30)));
        store.AddContainerSnapshot(CreateContainerSnapshot("c1", baseTime.AddMinutes(-10)));
        store.AddContainerSnapshot(CreateContainerSnapshot("c1", baseTime));

        // Act - get only last 15 minutes
        var from = baseTime.AddMinutes(-15);
        var to = baseTime.AddMinutes(1);
        var results = store.GetContainerMetrics("c1", from, to);

        // Assert
        Assert.Equal(2, results.Count());
    }

    [Fact]
    public void GetContainerMetrics_ReturnsEmptyForUnknownContainer()
    {
        // Arrange
        var store = new MetricsStore();
        store.AddContainerSnapshot(CreateContainerSnapshot("container1", DateTimeOffset.UtcNow));

        // Act
        var results = store.GetContainerMetrics("unknown-container");

        // Assert
        Assert.Empty(results);
    }

    [Fact]
    public void GetKnownContainerIds_ReturnsAllContainerIds()
    {
        // Arrange
        var store = new MetricsStore();
        var now = DateTimeOffset.UtcNow;
        store.AddContainerSnapshot(CreateContainerSnapshot("container1", now));
        store.AddContainerSnapshot(CreateContainerSnapshot("container2", now));
        store.AddContainerSnapshot(CreateContainerSnapshot("container1", now.AddSeconds(10)));

        // Act
        var ids = store.GetKnownContainerIds();

        // Assert
        Assert.Equal(2, ids.Count());
        Assert.Contains("container1", ids);
        Assert.Contains("container2", ids);
    }

    #endregion

    #region Host Metrics Tests

    [Fact]
    public void AddHostSnapshot_CanBeRetrieved()
    {
        // Arrange
        var store = new MetricsStore();
        var snapshot = CreateHostSnapshot(DateTimeOffset.UtcNow);

        // Act
        store.AddHostSnapshot(snapshot);
        var results = store.GetHostMetrics();

        // Assert
        Assert.Single(results);
        Assert.Equal(snapshot, results.First());
    }

    [Fact]
    public void GetHostMetrics_FiltersByTimeRange()
    {
        // Arrange
        var store = new MetricsStore();
        var baseTime = DateTimeOffset.UtcNow;
        store.AddHostSnapshot(CreateHostSnapshot(baseTime.AddHours(-2)));
        store.AddHostSnapshot(CreateHostSnapshot(baseTime.AddMinutes(-30)));
        store.AddHostSnapshot(CreateHostSnapshot(baseTime));

        // Act - get only last hour
        var from = baseTime.AddHours(-1);
        var to = baseTime.AddMinutes(1);
        var results = store.GetHostMetrics(from, to);

        // Assert
        Assert.Equal(2, results.Count());
    }

    #endregion

    #region Retention Tests

    [Fact]
    public void Trim_RemovesContainerSnapshotsOlderThan24Hours()
    {
        // Arrange
        var store = new MetricsStore();
        var now = DateTimeOffset.UtcNow;
        store.AddContainerSnapshot(CreateContainerSnapshot("c1", now.AddHours(-25))); // Old
        store.AddContainerSnapshot(CreateContainerSnapshot("c1", now.AddHours(-23))); // Recent
        store.AddContainerSnapshot(CreateContainerSnapshot("c1", now));                // Now

        // Act
        store.Trim();
        var results = store.GetContainerMetrics("c1");

        // Assert
        Assert.Equal(2, results.Count());
        Assert.All(results, s => Assert.True(s.Timestamp > now.AddHours(-24)));
    }

    [Fact]
    public void Trim_RemovesHostSnapshotsOlderThan24Hours()
    {
        // Arrange
        var store = new MetricsStore();
        var now = DateTimeOffset.UtcNow;
        store.AddHostSnapshot(CreateHostSnapshot(now.AddHours(-25)));
        store.AddHostSnapshot(CreateHostSnapshot(now.AddHours(-23)));
        store.AddHostSnapshot(CreateHostSnapshot(now));

        // Act
        store.Trim();
        var results = store.GetHostMetrics();

        // Assert
        Assert.Equal(2, results.Count());
    }

    #endregion

    #region Thread Safety Tests

    [Fact]
    public async Task ConcurrentAddAndRead_DoesNotThrow()
    {
        // Arrange
        var store = new MetricsStore();
        var tasks = new List<Task>();

        // Act - simulate concurrent writes and reads
        for (int i = 0; i < 100; i++)
        {
            var containerId = $"container{i % 5}";
            tasks.Add(Task.Run(() =>
            {
                store.AddContainerSnapshot(CreateContainerSnapshot(containerId, DateTimeOffset.UtcNow));
            }));
            tasks.Add(Task.Run(() =>
            {
                store.AddHostSnapshot(CreateHostSnapshot(DateTimeOffset.UtcNow));
            }));
            tasks.Add(Task.Run(() =>
            {
                _ = store.GetContainerMetrics(containerId).ToList();
            }));
            tasks.Add(Task.Run(() =>
            {
                _ = store.GetHostMetrics().ToList();
            }));
        }

        // Assert - should complete without exceptions
        await Task.WhenAll(tasks);
        Assert.True(store.GetKnownContainerIds().Any());
    }

    #endregion
}
