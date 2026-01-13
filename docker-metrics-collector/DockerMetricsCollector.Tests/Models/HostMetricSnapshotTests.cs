namespace DockerMetricsCollector.Tests.Models;

using DockerMetricsCollector.Models;

public class HostMetricSnapshotTests
{
    [Fact]
    public void CanCreateSnapshotWithAllFields()
    {
        // Arrange & Act
        var snapshot = new HostMetricSnapshot(
            Hostname: "docker-host-01",
            Timestamp: DateTimeOffset.UtcNow,
            CpuPercent: 45.5,
            CpuFrequencyMhz: 3600.0,
            MemoryBytes: 8_000_000_000,
            MemoryPercent: 62.5,
            UptimeSeconds: 86400,
            IsUp: true
        );

        // Assert
        Assert.Equal("docker-host-01", snapshot.Hostname);
        Assert.Equal(45.5, snapshot.CpuPercent);
        Assert.Equal(3600.0, snapshot.CpuFrequencyMhz);
        Assert.Equal(8_000_000_000, snapshot.MemoryBytes);
        Assert.Equal(62.5, snapshot.MemoryPercent);
        Assert.Equal(86400, snapshot.UptimeSeconds);
        Assert.True(snapshot.IsUp);
    }

    [Fact]
    public void TwoSnapshotsWithSameValuesAreEqual()
    {
        // Arrange
        var timestamp = DateTimeOffset.UtcNow;

        var snapshot1 = new HostMetricSnapshot(
            "host1", timestamp, 50.0, 3200.0, 4_000_000_000, 50.0, 3600, true
        );

        var snapshot2 = new HostMetricSnapshot(
            "host1", timestamp, 50.0, 3200.0, 4_000_000_000, 50.0, 3600, true
        );

        // Assert
        Assert.Equal(snapshot1, snapshot2);
        Assert.True(snapshot1 == snapshot2);
    }

    [Fact]
    public void TwoSnapshotsWithDifferentValuesAreNotEqual()
    {
        // Arrange
        var timestamp = DateTimeOffset.UtcNow;

        var snapshot1 = new HostMetricSnapshot(
            "host1", timestamp, 50.0, 3200.0, 4_000_000_000, 50.0, 3600, true
        );

        var snapshot2 = new HostMetricSnapshot(
            "host1", timestamp, 75.0, 3200.0, 4_000_000_000, 50.0, 3600, true  // Different CPU
        );

        // Assert
        Assert.NotEqual(snapshot1, snapshot2);
    }

    [Fact]
    public void ToStringContainsHostnameAndMetrics()
    {
        // Arrange
        var snapshot = new HostMetricSnapshot(
            "my-server", DateTimeOffset.UtcNow, 25.0, 2800.5, 16_000_000_000, 80.0, 172800, true
        );

        // Act
        var output = snapshot.ToString();

        // Assert
        Assert.Contains("HostMetricSnapshot", output);
        Assert.Contains("my-server", output);
        Assert.Contains("2800.5", output);  // CPU frequency should appear
    }
}
