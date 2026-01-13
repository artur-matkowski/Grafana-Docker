import React, { useEffect, useState, useMemo } from 'react';
import { PanelProps } from '@grafana/data';
import { SimpleOptions, ContainerMetricSnapshot, ContainerInfo } from 'types';
import { css, cx } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';

interface Props extends PanelProps<SimpleOptions> {}

const getStyles = () => {
  return {
    wrapper: css`
      position: relative;
      overflow: auto;
      padding: 10px;
    `,
    error: css`
      color: #ff5555;
      padding: 10px;
    `,
    info: css`
      font-size: 12px;
      margin-bottom: 10px;
    `,
    loading: css`
      padding: 10px;
      color: #888;
    `,
    hostSection: css`
      margin-bottom: 16px;
      &:last-child {
        margin-bottom: 0;
      }
    `,
    hostHeader: css`
      font-size: 13px;
      font-weight: 600;
      padding: 8px 12px;
      margin-bottom: 8px;
      background: rgba(50, 116, 217, 0.15);
      border-left: 3px solid #3274d9;
      border-radius: 0 4px 4px 0;
      display: flex;
      align-items: center;
      gap: 8px;
    `,
    hostHealthDot: css`
      width: 8px;
      height: 8px;
      border-radius: 50%;
    `,
    containerCount: css`
      font-size: 11px;
      color: #888;
      font-weight: normal;
      margin-left: auto;
    `,
    containersGrid: css`
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 12px;
      padding: 0 4px;
    `,
    containerCard: css`
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 6px;
      padding: 12px;
    `,
    containerHeader: css`
      display: flex;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    `,
    containerName: css`
      font-size: 13px;
      font-weight: 500;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `,
    containerStatus: css`
      font-size: 11px;
      margin-left: 8px;
    `,
    metricsRow: css`
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    `,
    metric: css`
      flex: 1;
      min-width: 70px;
    `,
    metricLabel: css`
      font-size: 10px;
      color: #888;
      margin-bottom: 2px;
    `,
    metricValue: css`
      font-size: 16px;
      font-weight: 600;
    `,
    metricUnit: css`
      font-size: 10px;
      color: #888;
      margin-left: 2px;
    `,
    sparkline: css`
      margin-top: 8px;
      height: 24px;
    `,
    emptyState: css`
      color: #888;
      font-size: 13px;
      text-align: center;
      padding: 40px 20px;
    `,
    summary: css`
      font-size: 11px;
      color: #888;
      padding: 4px 8px;
      margin-bottom: 12px;
      display: flex;
      gap: 16px;
    `,
  };
};

const Sparkline: React.FC<{ data: number[]; color: string; height?: number }> = ({
  data,
  color,
  height = 24,
}) => {
  if (data.length < 2) {
    return null;
  }

  const width = 100;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
    </svg>
  );
};

interface ContainerWithMetrics {
  containerId: string;
  containerName: string;
  hostId: string;
  hostName: string;
  metrics: ContainerMetricSnapshot[];
  latest: ContainerMetricSnapshot | null;
}

export const SimplePanel: React.FC<Props> = ({ width, height, options, timeRange }) => {
  const styles = useStyles2(getStyles);

  const [allMetrics, setAllMetrics] = useState<ContainerMetricSnapshot[]>([]);
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Fetch containers list
  useEffect(() => {
    const fetchContainers = async () => {
      if (!options.apiUrl) return;
      try {
        const response = await fetch(`${options.apiUrl}/api/containers`);
        if (response.ok) {
          const data: ContainerInfo[] = await response.json();
          setContainers(data);
        }
      } catch {
        // Ignore errors, we'll use container info from metrics
      }
    };

    fetchContainers();
    const interval = setInterval(fetchContainers, 30000);
    return () => clearInterval(interval);
  }, [options.apiUrl]);

  // Determine which container IDs to fetch
  const targetContainerIds = useMemo(() => {
    if (options.showAllContainers) {
      return containers.map((c) => c.containerId);
    }
    return options.containerIds || [];
  }, [options.showAllContainers, options.containerIds, containers]);

  // Fetch metrics for selected containers
  useEffect(() => {
    const fetchMetrics = async () => {
      if (!options.apiUrl) {
        setError('Please configure API URL in panel options');
        setAllMetrics([]);
        return;
      }

      if (targetContainerIds.length === 0 && !options.showAllContainers) {
        setError('No containers selected. Enable "Show All Containers" or select specific containers.');
        setAllMetrics([]);
        return;
      }

      if (targetContainerIds.length === 0) {
        setAllMetrics([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const from = timeRange.from.toISOString();
        const to = timeRange.to.toISOString();

        // Fetch metrics for all containers
        const metricsPromises = targetContainerIds.map(async (containerId) => {
          const url = `${options.apiUrl}/api/metrics/containers?id=${containerId}&from=${from}&to=${to}`;
          const response = await fetch(url);
          if (!response.ok) return [];
          return response.json() as Promise<ContainerMetricSnapshot[]>;
        });

        const results = await Promise.all(metricsPromises);
        const combined = results.flat();
        setAllMetrics(combined);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
        setAllMetrics([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10000);
    return () => clearInterval(interval);
  }, [options.apiUrl, targetContainerIds, options.showAllContainers, timeRange.from.valueOf(), timeRange.to.valueOf()]);

  // Group metrics by container and host
  const containersByHost = useMemo(() => {
    const byContainer = new Map<string, ContainerWithMetrics>();

    // Initialize from containers list
    for (const c of containers) {
      if (options.showAllContainers || (options.containerIds || []).includes(c.containerId)) {
        byContainer.set(c.containerId, {
          containerId: c.containerId,
          containerName: c.containerName,
          hostId: c.hostId,
          hostName: c.hostName,
          metrics: [],
          latest: null,
        });
      }
    }

    // Add metrics data
    for (const m of allMetrics) {
      let container = byContainer.get(m.containerId);
      if (!container) {
        container = {
          containerId: m.containerId,
          containerName: m.containerName,
          hostId: m.hostId,
          hostName: m.hostName,
          metrics: [],
          latest: null,
        };
        byContainer.set(m.containerId, container);
      }
      container.metrics.push(m);
    }

    // Set latest metric for each container
    for (const container of byContainer.values()) {
      if (container.metrics.length > 0) {
        container.metrics.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        container.latest = container.metrics[container.metrics.length - 1];
      }
    }

    // Group by host
    const byHost = new Map<string, { hostId: string; hostName: string; containers: ContainerWithMetrics[] }>();
    for (const container of byContainer.values()) {
      const hostKey = container.hostId;
      if (!byHost.has(hostKey)) {
        byHost.set(hostKey, {
          hostId: container.hostId,
          hostName: container.hostName,
          containers: [],
        });
      }
      byHost.get(hostKey)!.containers.push(container);
    }

    // Sort containers by name within each host
    for (const host of byHost.values()) {
      host.containers.sort((a, b) => a.containerName.localeCompare(b.containerName));
    }

    return Array.from(byHost.values()).sort((a, b) => a.hostName.localeCompare(b.hostName));
  }, [containers, allMetrics, options.showAllContainers, options.containerIds]);

  const totalContainers = containersByHost.reduce((sum, h) => sum + h.containers.length, 0);
  const totalHosts = containersByHost.length;

  // Render error state
  if (error) {
    return (
      <div className={cx(styles.wrapper, css`width: ${width}px; height: ${height}px;`)}>
        <div className={styles.error}>
          <strong>Error:</strong> {error}
        </div>
        <div className={styles.info}>
          <p>Configuration:</p>
          <ul>
            <li>API URL: {options.apiUrl || '(not set)'}</li>
            <li>Show All: {options.showAllContainers ? 'Yes' : 'No'}</li>
            <li>Selected: {(options.containerIds || []).length} containers</li>
          </ul>
        </div>
      </div>
    );
  }

  // Render loading state
  if (loading && allMetrics.length === 0 && targetContainerIds.length > 0) {
    return (
      <div className={cx(styles.wrapper, css`width: ${width}px; height: ${height}px;`)}>
        <div className={styles.loading}>Loading metrics for {targetContainerIds.length} containers...</div>
      </div>
    );
  }

  // Render empty state
  if (totalContainers === 0) {
    return (
      <div className={cx(styles.wrapper, css`width: ${width}px; height: ${height}px;`)}>
        <div className={styles.emptyState}>
          No containers to display.
          <br />
          <span style={{ fontSize: '11px' }}>
            {options.showAllContainers
              ? 'Waiting for containers to be discovered...'
              : 'Select containers in panel options or enable "Show All Containers".'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={cx(styles.wrapper, css`width: ${width}px; height: ${height}px;`)}>
      <div className={styles.summary}>
        <span>{totalHosts} host{totalHosts !== 1 ? 's' : ''}</span>
        <span>{totalContainers} container{totalContainers !== 1 ? 's' : ''}</span>
        <span>{allMetrics.length} samples</span>
      </div>

      {containersByHost.map((host) => (
        <div key={host.hostId} className={styles.hostSection}>
          <div className={styles.hostHeader}>
            <span
              className={styles.hostHealthDot}
              style={{ background: '#73BF69' }}
            />
            {host.hostName}
            <span className={styles.containerCount}>
              {host.containers.length} container{host.containers.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className={styles.containersGrid}>
            {host.containers.map((container) => {
              const latest = container.latest;
              const memoryData = container.metrics.map((m) => m.memoryBytes / (1024 * 1024));
              const cpuData = container.metrics.map((m) => m.cpuPercent);

              return (
                <div key={container.containerId} className={styles.containerCard}>
                  <div className={styles.containerHeader}>
                    <span className={styles.containerName} title={container.containerName}>
                      {container.containerName.replace(/^\//, '')}
                    </span>
                    <span
                      className={styles.containerStatus}
                      style={{ color: latest?.isRunning ? '#73BF69' : '#FF5555' }}
                    >
                      {latest?.isRunning ? '● Running' : '● Stopped'}
                    </span>
                  </div>

                  <div className={styles.metricsRow}>
                    {options.showCpu && (
                      <div className={styles.metric}>
                        <div className={styles.metricLabel}>CPU</div>
                        <div className={styles.metricValue}>
                          {latest ? latest.cpuPercent.toFixed(1) : '-'}
                          <span className={styles.metricUnit}>%</span>
                        </div>
                        {cpuData.length > 1 && (
                          <div className={styles.sparkline}>
                            <Sparkline data={cpuData} color="#5794F2" />
                          </div>
                        )}
                      </div>
                    )}

                    {options.showMemory && (
                      <div className={styles.metric}>
                        <div className={styles.metricLabel}>Memory</div>
                        <div className={styles.metricValue}>
                          {latest ? (latest.memoryBytes / (1024 * 1024)).toFixed(0) : '-'}
                          <span className={styles.metricUnit}>MB</span>
                        </div>
                        {memoryData.length > 1 && (
                          <div className={styles.sparkline}>
                            <Sparkline data={memoryData} color="#73BF69" />
                          </div>
                        )}
                      </div>
                    )}

                    {options.showNetwork && latest && (
                      <>
                        <div className={styles.metric}>
                          <div className={styles.metricLabel}>Net RX</div>
                          <div className={styles.metricValue}>
                            {(latest.networkRxBytes / 1024).toFixed(0)}
                            <span className={styles.metricUnit}>KB</span>
                          </div>
                        </div>
                        <div className={styles.metric}>
                          <div className={styles.metricLabel}>Net TX</div>
                          <div className={styles.metricValue}>
                            {(latest.networkTxBytes / 1024).toFixed(0)}
                            <span className={styles.metricUnit}>KB</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
