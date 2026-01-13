namespace DockerMetricsCollector.Tests.Models;

using DockerMetricsCollector.Models;

public class ContainerMetricSnapshotTests
{
    [Fact]
    public void CanCreateSnapshotWithAllFields()
    {
        // Arrange & Act
        var snapshot = new ContainerMetricSnapshot(
            ContainerId: "abc123def456",
            ContainerName: "/my-container",
            Timestamp: DateTimeOffset.UtcNow,
            CpuPercent: 25.5,
            MemoryBytes: 1024000,
            MemoryPercent: 10.0,
            NetworkRxBytes: 5000,
            NetworkTxBytes: 3000,
            DiskReadBytes: 10000,
            DiskWriteBytes: 2000,
            UptimeSeconds: 3600,
            IsRunning: true,
            CpuPressureSome: 1.5,
            CpuPressureFull: 0.2,
            MemoryPressureSome: 0.5,
            MemoryPressureFull: 0.1,
            IoPressureSome: 3.0,
            IoPressureFull: 0.5
        );

        // Assert
        Assert.Equal("abc123def456", snapshot.ContainerId);
        Assert.Equal("/my-container", snapshot.ContainerName);
        Assert.Equal(25.5, snapshot.CpuPercent);
        Assert.Equal(1024000, snapshot.MemoryBytes);
        Assert.True(snapshot.IsRunning);
        Assert.Equal(1.5, snapshot.CpuPressureSome);
    }

    [Fact]
    public void PsiFieldsCanBeNull()
    {
        // Arrange & Act - PSI metrics are nullable for systems that don't support them
        var snapshot = new ContainerMetricSnapshot(
            ContainerId: "abc123",
            ContainerName: "/test",
            Timestamp: DateTimeOffset.UtcNow,
            CpuPercent: 10.0,
            MemoryBytes: 1000,
            MemoryPercent: 5.0,
            NetworkRxBytes: 100,
            NetworkTxBytes: 100,
            DiskReadBytes: 100,
            DiskWriteBytes: 100,
            UptimeSeconds: 60,
            IsRunning: true,
            CpuPressureSome: null,      // Not available
            CpuPressureFull: null,
            MemoryPressureSome: null,
            MemoryPressureFull: null,
            IoPressureSome: null,
            IoPressureFull: null
        );

        // Assert
        Assert.Null(snapshot.CpuPressureSome);
        Assert.Null(snapshot.IoPressureFull);
    }

    [Fact]
    public void TwoSnapshotsWithSameValuesAreEqual()
    {
        // Arrange - Records have value-based equality
        var timestamp = DateTimeOffset.UtcNow;

        var snapshot1 = new ContainerMetricSnapshot(
            "id1", "name1", timestamp, 10.0, 1000, 5.0, 100, 100, 100, 100, 60, true,
            null, null, null, null, null, null
        );

        var snapshot2 = new ContainerMetricSnapshot(
            "id1", "name1", timestamp, 10.0, 1000, 5.0, 100, 100, 100, 100, 60, true,
            null, null, null, null, null, null
        );

        // Assert
        Assert.Equal(snapshot1, snapshot2);
        Assert.True(snapshot1 == snapshot2);
    }

    [Fact]
    public void ToStringProvidesUsefulOutput()
    {
        // Arrange
        var snapshot = new ContainerMetricSnapshot(
            "container123", "/web-app", DateTimeOffset.UtcNow, 50.0, 2048000, 25.0,
            1000, 500, 200, 100, 7200, true, 2.0, 0.5, 1.0, 0.2, 3.0, 1.0
        );

        // Act
        var output = snapshot.ToString();

        // Assert - Records auto-generate a useful ToString()
        Assert.Contains("ContainerMetricSnapshot", output);
        Assert.Contains("container123", output);
        Assert.Contains("web-app", output);
    }
}
