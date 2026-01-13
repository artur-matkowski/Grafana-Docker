import React, { useEffect, useState, useMemo } from 'react';
import { PanelProps } from '@grafana/data';
import { SimpleOptions, ContainerMetricSnapshot, ContainerInfo, AVAILABLE_METRICS, MetricDefinition, DEFAULT_METRICS } from 'types';
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
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
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
    metricsGrid: css`
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 10px;
    `,
    metric: css`
      background: rgba(0, 0, 0, 0.15);
      border-radius: 4px;
      padding: 8px;
    `,
    metricHeader: css`
      display: flex;
      align-items: center;
      margin-bottom: 4px;
    `,
    metricColorDot: css`
      width: 6px;
      height: 6px;
      border-radius: 50%;
      margin-right: 6px;
    `,
    metricLabel: css`
      font-size: 10px;
      color: #888;
    `,
    metricValue: css`
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 4px;
    `,
    metricUnit: css`
      font-size: 10px;
      color: #888;
      margin-left: 2px;
    `,
    sparklineContainer: css`
      position: relative;
      height: 40px;
      margin-top: 4px;
    `,
    sparklineSvg: css`
      display: block;
    `,
    scaleLabels: css`
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      font-size: 8px;
      color: #666;
      text-align: right;
      pointer-events: none;
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

interface SparklineProps {
  data: number[];
  color: string;
  height?: number;
  formatValue: (v: number) => string;
}

const Sparkline: React.FC<SparklineProps> = ({ data, color, height = 40, formatValue }) => {
  if (data.length < 2) {
    return null;
  }

  const width = 100;
  const padding = 2;
  const chartHeight = height - padding * 2;
  const chartWidth = width - 28; // Leave space for scale labels

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * chartWidth;
      const y = padding + chartHeight - ((value - min) / range) * chartHeight;
      return `${x},${y}`;
    })
    .join(' ');

  // Calculate nice scale values
  const scaleMax = formatValue(max);
  const scaleMin = formatValue(min);

  return (
    <div style={{ position: 'relative', height }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ display: 'block' }}
      >
        {/* Grid lines */}
        <line x1="0" y1={padding} x2={chartWidth} y2={padding} stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
        <line
          x1="0"
          y1={padding + chartHeight / 2}
          x2={chartWidth}
          y2={padding + chartHeight / 2}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="0.5"
        />
        <line
          x1="0"
          y1={padding + chartHeight}
          x2={chartWidth}
          y2={padding + chartHeight}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="0.5"
        />

        {/* Data line */}
        <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />

        {/* Scale labels */}
        <text x={width - 2} y={padding + 3} fontSize="7" fill="#666" textAnchor="end">
          {scaleMax}
        </text>
        <text x={width - 2} y={height - padding} fontSize="7" fill="#666" textAnchor="end">
          {scaleMin}
        </text>
      </svg>
    </div>
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

  // Get selected metric definitions
  const selectedMetricDefs = useMemo(() => {
    const selected = options.selectedMetrics || DEFAULT_METRICS;
    return AVAILABLE_METRICS.filter((m) => selected.includes(m.key));
  }, [options.selectedMetrics]);

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
        // Ignore errors
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

    for (const container of byContainer.values()) {
      if (container.metrics.length > 0) {
        container.metrics.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        container.latest = container.metrics[container.metrics.length - 1];
      }
    }

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

    for (const host of byHost.values()) {
      host.containers.sort((a, b) => a.containerName.localeCompare(b.containerName));
    }

    return Array.from(byHost.values()).sort((a, b) => a.hostName.localeCompare(b.hostName));
  }, [containers, allMetrics, options.showAllContainers, options.containerIds]);

  const totalContainers = containersByHost.reduce((sum, h) => sum + h.containers.length, 0);
  const totalHosts = containersByHost.length;

  // Render metric for a container
  const renderMetric = (container: ContainerWithMetrics, metricDef: MetricDefinition) => {
    const latest = container.latest;
    const rawValue = latest ? metricDef.getValue(latest) : null;

    if (rawValue === null || rawValue === undefined) {
      return null; // Skip metrics with null values (e.g., pressure metrics not available)
    }

    const data = container.metrics
      .map((m) => metricDef.getValue(m))
      .filter((v): v is number => v !== null && v !== undefined);

    return (
      <div key={metricDef.key} className={styles.metric}>
        <div className={styles.metricHeader}>
          <span className={styles.metricColorDot} style={{ background: metricDef.color }} />
          <span className={styles.metricLabel}>{metricDef.label}</span>
        </div>
        <div className={styles.metricValue}>
          {metricDef.format(rawValue)}
          <span className={styles.metricUnit}>{metricDef.unit}</span>
        </div>
        {data.length > 1 && (
          <Sparkline data={data} color={metricDef.color} formatValue={metricDef.format} />
        )}
      </div>
    );
  };

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

  if (loading && allMetrics.length === 0 && targetContainerIds.length > 0) {
    return (
      <div className={cx(styles.wrapper, css`width: ${width}px; height: ${height}px;`)}>
        <div className={styles.loading}>Loading metrics for {targetContainerIds.length} containers...</div>
      </div>
    );
  }

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

  if (selectedMetricDefs.length === 0) {
    return (
      <div className={cx(styles.wrapper, css`width: ${width}px; height: ${height}px;`)}>
        <div className={styles.emptyState}>
          No metrics selected.
          <br />
          <span style={{ fontSize: '11px' }}>
            Select metrics to display in panel options under "Display".
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={cx(styles.wrapper, css`width: ${width}px; height: ${height}px;`)}>
      <div className={styles.summary}>
        <span>
          {totalHosts} host{totalHosts !== 1 ? 's' : ''}
        </span>
        <span>
          {totalContainers} container{totalContainers !== 1 ? 's' : ''}
        </span>
        <span>{selectedMetricDefs.length} metrics</span>
        <span>{allMetrics.length} samples</span>
      </div>

      {containersByHost.map((host) => (
        <div key={host.hostId} className={styles.hostSection}>
          <div className={styles.hostHeader}>
            <span className={styles.hostHealthDot} style={{ background: '#73BF69' }} />
            {host.hostName}
            <span className={styles.containerCount}>
              {host.containers.length} container{host.containers.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className={styles.containersGrid}>
            {host.containers.map((container) => (
              <div key={container.containerId} className={styles.containerCard}>
                <div className={styles.containerHeader}>
                  <span className={styles.containerName} title={container.containerName}>
                    {container.containerName.replace(/^\//, '')}
                  </span>
                  <span
                    className={styles.containerStatus}
                    style={{ color: container.latest?.isRunning ? '#73BF69' : '#FF5555' }}
                  >
                    {container.latest?.isRunning ? '● Running' : '● Stopped'}
                  </span>
                </div>

                <div className={styles.metricsGrid}>
                  {selectedMetricDefs.map((metricDef) => renderMetric(container, metricDef))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
