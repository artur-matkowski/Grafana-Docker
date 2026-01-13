import React, { useEffect, useState } from 'react';
import { PanelProps } from '@grafana/data';
import { SimpleOptions, ContainerMetricSnapshot } from 'types';
import { css, cx } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';

interface Props extends PanelProps<SimpleOptions> {}

const getStyles = () => {
  return {
    wrapper: css`
      position: relative;
      overflow: hidden;
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
    metricsGrid: css`
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
    `,
    metricCard: css`
      background: rgba(255, 255, 255, 0.05);
      border-radius: 4px;
      padding: 10px;
    `,
    metricLabel: css`
      font-size: 11px;
      color: #888;
      margin-bottom: 4px;
    `,
    metricValue: css`
      font-size: 24px;
      font-weight: bold;
    `,
    metricUnit: css`
      font-size: 12px;
      color: #888;
      margin-left: 4px;
    `,
    sparkline: css`
      margin-top: 8px;
      height: 30px;
    `,
  };
};

// Simple sparkline component using SVG
const Sparkline: React.FC<{ data: number[]; color: string; height?: number }> = ({
  data,
  color,
  height = 30
}) => {
  if (data.length < 2) {
    return null;
  }

  const width = 150;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        points={points}
      />
    </svg>
  );
};

export const SimplePanel: React.FC<Props> = ({ width, height, options, timeRange }) => {
  const styles = useStyles2(getStyles);

  const [metrics, setMetrics] = useState<ContainerMetricSnapshot[]>([]);
  const [containerName, setContainerName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Fetch metrics when options or time range changes
  useEffect(() => {
    const fetchMetrics = async () => {
      if (!options.apiUrl || !options.containerId) {
        setError('Please configure API URL and Container ID in panel options');
        setMetrics([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const from = timeRange.from.toISOString();
        const to = timeRange.to.toISOString();
        const url = `${options.apiUrl}/api/metrics/containers?id=${options.containerId}&from=${from}&to=${to}`;

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`API returned ${response.status}: ${response.statusText}`);
        }

        const data: ContainerMetricSnapshot[] = await response.json();
        setMetrics(data);

        if (data.length > 0) {
          setContainerName(data[0].containerName);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
        setMetrics([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10000);
    return () => clearInterval(interval);
  }, [options.apiUrl, options.containerId, timeRange.from.valueOf(), timeRange.to.valueOf()]);

  // Calculate latest and average values
  const getLatestMetrics = () => {
    if (metrics.length === 0) {
      return null;
    }

    const latest = metrics[metrics.length - 1];
    const memoryMB = latest.memoryBytes / (1024 * 1024);

    return {
      memoryMB: memoryMB.toFixed(1),
      memoryPercent: latest.memoryPercent.toFixed(1),
      cpuPercent: latest.cpuPercent.toFixed(2),
      networkRxKB: (latest.networkRxBytes / 1024).toFixed(1),
      networkTxKB: (latest.networkTxBytes / 1024).toFixed(1),
      diskReadMB: (latest.diskReadBytes / (1024 * 1024)).toFixed(1),
      diskWriteMB: (latest.diskWriteBytes / (1024 * 1024)).toFixed(1),
      isRunning: latest.isRunning,
    };
  };

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
            <li>Container ID: {options.containerId ? options.containerId.substring(0, 12) + '...' : '(not set)'}</li>
          </ul>
        </div>
      </div>
    );
  }

  // Render loading state
  if (loading && metrics.length === 0) {
    return (
      <div className={cx(styles.wrapper, css`width: ${width}px; height: ${height}px;`)}>
        <div className={styles.loading}>Loading metrics...</div>
      </div>
    );
  }

  // Render empty state
  if (metrics.length === 0) {
    return (
      <div className={cx(styles.wrapper, css`width: ${width}px; height: ${height}px;`)}>
        <div className={styles.info}>
          No metrics found for the selected time range.
          <br />
          Container: {options.containerId ? options.containerId.substring(0, 12) + '...' : '(not configured)'}
        </div>
      </div>
    );
  }

  const latest = getLatestMetrics();
  const memoryData = metrics.map(m => m.memoryBytes / (1024 * 1024));
  const cpuData = metrics.map(m => m.cpuPercent);
  const rxData = metrics.map(m => m.networkRxBytes / 1024);
  const txData = metrics.map(m => m.networkTxBytes / 1024);

  return (
    <div className={cx(styles.wrapper, css`width: ${width}px; height: ${height}px; overflow: auto;`)}>
      <div className={styles.info}>
        <strong>{containerName}</strong>
        <span style={{ color: latest?.isRunning ? '#73BF69' : '#FF5555', marginLeft: '8px' }}>
          {latest?.isRunning ? '● Running' : '● Stopped'}
        </span>
        <span style={{ color: '#888', marginLeft: '8px' }}>
          | {metrics.length} samples
        </span>
      </div>

      <div className={styles.metricsGrid}>
        {options.showMemory && (
          <div className={styles.metricCard}>
            <div className={styles.metricLabel}>Memory Usage</div>
            <div className={styles.metricValue}>
              {latest?.memoryMB}
              <span className={styles.metricUnit}>MB</span>
            </div>
            <div style={{ fontSize: '11px', color: '#888' }}>
              {latest?.memoryPercent}% of limit
            </div>
            <div className={styles.sparkline}>
              <Sparkline data={memoryData} color="#73BF69" />
            </div>
          </div>
        )}

        {options.showCpu && (
          <div className={styles.metricCard}>
            <div className={styles.metricLabel}>CPU Usage</div>
            <div className={styles.metricValue}>
              {latest?.cpuPercent}
              <span className={styles.metricUnit}>%</span>
            </div>
            <div className={styles.sparkline}>
              <Sparkline data={cpuData} color="#5794F2" />
            </div>
          </div>
        )}

        {options.showNetwork && (
          <>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Network RX</div>
              <div className={styles.metricValue}>
                {latest?.networkRxKB}
                <span className={styles.metricUnit}>KB</span>
              </div>
              <div className={styles.sparkline}>
                <Sparkline data={rxData} color="#FF9830" />
              </div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Network TX</div>
              <div className={styles.metricValue}>
                {latest?.networkTxKB}
                <span className={styles.metricUnit}>KB</span>
              </div>
              <div className={styles.sparkline}>
                <Sparkline data={txData} color="#F2495C" />
              </div>
            </div>
          </>
        )}

        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Disk Read</div>
          <div className={styles.metricValue}>
            {latest?.diskReadMB}
            <span className={styles.metricUnit}>MB</span>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Disk Write</div>
          <div className={styles.metricValue}>
            {latest?.diskWriteMB}
            <span className={styles.metricUnit}>MB</span>
          </div>
        </div>
      </div>
    </div>
  );
};
