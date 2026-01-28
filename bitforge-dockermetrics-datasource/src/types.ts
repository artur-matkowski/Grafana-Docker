import { DataSourceJsonData, DataQuery } from '@grafana/data';

/**
 * Query types supported by the data source
 */
export type QueryType = 'metrics' | 'containers';

/**
 * Docker Metrics query model
 */
export interface DockerMetricsQuery extends DataQuery {
  queryType: QueryType;

  // For metrics queries
  containerIds?: string[];        // Empty = all containers from all hosts
  containerNamePattern?: string;  // Regex filter for container names
  metrics?: string[];             // Metrics to fetch: ['cpuPercent', 'memoryBytes', ...]
  hostIds?: string[];             // Filter by specific hosts (empty = all)

  // For container list queries (used by variables)
  // No additional params needed - returns all containers from all configured hosts
}

/**
 * Host configuration for Docker Metrics Collector agents
 */
export interface HostConfig {
  id: string;
  name: string;
  url: string;      // e.g., http://192.168.74.202:5000
  enabled: boolean;
}

/**
 * Data source instance settings (stored in Grafana)
 */
export interface DockerMetricsDataSourceOptions extends DataSourceJsonData {
  hosts?: HostConfig[];
}

/**
 * Secure JSON data (stored encrypted)
 */
export interface DockerMetricsSecureJsonData {
  // Reserved for future use (e.g., API keys for agents)
}

/**
 * Available metrics that can be queried
 */
export const AVAILABLE_METRICS = [
  { value: 'cpuPercent', label: 'CPU %' },
  { value: 'memoryBytes', label: 'Memory (MB)' },
  { value: 'memoryPercent', label: 'Memory %' },
  { value: 'networkRxBytes', label: 'Network RX (MB)' },
  { value: 'networkTxBytes', label: 'Network TX (MB)' },
  { value: 'diskReadBytes', label: 'Disk Read (MB)' },
  { value: 'diskWriteBytes', label: 'Disk Write (MB)' },
  { value: 'uptimeSeconds', label: 'Uptime (seconds)' },
  { value: 'cpuPressureSome', label: 'CPU Pressure' },
  { value: 'cpuPressureFull', label: 'CPU Pressure (full)' },
  { value: 'memoryPressureSome', label: 'Memory Pressure' },
  { value: 'memoryPressureFull', label: 'Memory Pressure (full)' },
  { value: 'ioPressureSome', label: 'I/O Pressure' },
  { value: 'ioPressureFull', label: 'I/O Pressure (full)' },
] as const;

/**
 * Default metrics to query when none specified
 */
export const DEFAULT_METRICS = ['cpuPercent', 'memoryBytes'];

/**
 * Default query
 */
export const DEFAULT_QUERY: Partial<DockerMetricsQuery> = {
  queryType: 'metrics',
  metrics: DEFAULT_METRICS,
};
