namespace DockerMetricsAgent.Services;

using DockerMetricsAgent.Models;

/// <summary>
/// Reads PSI (Pressure Stall Information) metrics from cgroup v2 filesystem.
/// </summary>
public class PsiReader
{
    private readonly ILogger<PsiReader> _logger;
    private readonly string _cgroupBasePath;
    private bool _psiSupported = true;

    public PsiReader(ILogger<PsiReader> logger)
    {
        _logger = logger;

        // Determine cgroup base path
        // Docker typically uses /sys/fs/cgroup/system.slice/docker-{id}.scope
        // or /sys/fs/cgroup/docker/{id} depending on configuration
        _cgroupBasePath = DetectCgroupBasePath();

        _logger.LogInformation("PSI Reader initialized. Cgroup base path: {Path}", _cgroupBasePath);
    }

    public bool IsPsiSupported => _psiSupported;

    private string DetectCgroupBasePath()
    {
        // Check common cgroup v2 paths
        var possiblePaths = new[]
        {
            "/sys/fs/cgroup/system.slice",
            "/sys/fs/cgroup/docker",
            "/sys/fs/cgroup"
        };

        foreach (var path in possiblePaths)
        {
            if (Directory.Exists(path))
            {
                // Check if PSI files exist
                var cpuPressure = Path.Combine(path, "cpu.pressure");
                if (File.Exists(cpuPressure))
                {
                    _logger.LogInformation("Found PSI support at {Path}", path);
                    return path;
                }
            }
        }

        _psiSupported = false;
        _logger.LogWarning("PSI not supported - no cgroup v2 pressure files found");
        return "/sys/fs/cgroup";
    }

    /// <summary>
    /// Get PSI metrics for a container by its ID.
    /// </summary>
    public (PsiMetrics? Cpu, PsiMetrics? Memory, PsiMetrics? Io) GetContainerPsi(string containerId)
    {
        if (!_psiSupported)
        {
            return (null, null, null);
        }

        try
        {
            // Try different cgroup path patterns
            var cgroupPath = FindContainerCgroupPath(containerId);
            if (cgroupPath == null)
            {
                return (null, null, null);
            }

            var cpu = ReadPsiFile(Path.Combine(cgroupPath, "cpu.pressure"));
            var memory = ReadPsiFile(Path.Combine(cgroupPath, "memory.pressure"));
            var io = ReadPsiFile(Path.Combine(cgroupPath, "io.pressure"));

            return (cpu, memory, io);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to read PSI for container {ContainerId}", containerId);
            return (null, null, null);
        }
    }

    private string? FindContainerCgroupPath(string containerId)
    {
        // Docker container cgroup paths vary by configuration:
        // - systemd: /sys/fs/cgroup/system.slice/docker-{full-id}.scope
        // - cgroupfs: /sys/fs/cgroup/docker/{full-id}

        var patterns = new[]
        {
            Path.Combine(_cgroupBasePath, $"docker-{containerId}.scope"),
            Path.Combine(_cgroupBasePath, "docker", containerId),
            Path.Combine("/sys/fs/cgroup/system.slice", $"docker-{containerId}.scope"),
            Path.Combine("/sys/fs/cgroup/docker", containerId),
        };

        foreach (var path in patterns)
        {
            if (Directory.Exists(path))
            {
                return path;
            }
        }

        // Try to find by partial ID match
        try
        {
            var systemSlice = "/sys/fs/cgroup/system.slice";
            if (Directory.Exists(systemSlice))
            {
                var matches = Directory.GetDirectories(systemSlice, $"docker-{containerId}*");
                if (matches.Length > 0)
                {
                    return matches[0];
                }
            }

            var dockerCgroup = "/sys/fs/cgroup/docker";
            if (Directory.Exists(dockerCgroup))
            {
                var matches = Directory.GetDirectories(dockerCgroup, $"{containerId}*");
                if (matches.Length > 0)
                {
                    return matches[0];
                }
            }
        }
        catch
        {
            // Ignore search errors
        }

        return null;
    }

    private PsiMetrics? ReadPsiFile(string path)
    {
        if (!File.Exists(path))
        {
            return null;
        }

        try
        {
            var content = File.ReadAllText(path);
            return ParsePsiContent(content);
        }
        catch
        {
            return null;
        }
    }

    private PsiMetrics? ParsePsiContent(string content)
    {
        // PSI file format:
        // some avg10=0.00 avg60=0.00 avg300=0.00 total=0
        // full avg10=0.00 avg60=0.00 avg300=0.00 total=0

        double some10 = 0, some60 = 0, some300 = 0;
        double full10 = 0, full60 = 0, full300 = 0;

        foreach (var line in content.Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 4)
                continue;

            var isSome = parts[0] == "some";
            var isFull = parts[0] == "full";

            if (!isSome && !isFull)
                continue;

            foreach (var part in parts.Skip(1))
            {
                var kv = part.Split('=');
                if (kv.Length != 2)
                    continue;

                if (!double.TryParse(kv[1], System.Globalization.NumberStyles.Float,
                    System.Globalization.CultureInfo.InvariantCulture, out var value))
                    continue;

                switch (kv[0])
                {
                    case "avg10":
                        if (isSome) some10 = value;
                        else full10 = value;
                        break;
                    case "avg60":
                        if (isSome) some60 = value;
                        else full60 = value;
                        break;
                    case "avg300":
                        if (isSome) some300 = value;
                        else full300 = value;
                        break;
                }
            }
        }

        return new PsiMetrics(some10, some60, some300, full10, full60, full300);
    }
}
