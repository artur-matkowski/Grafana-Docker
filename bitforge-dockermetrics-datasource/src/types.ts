import { DataSourceJsonData, DataQuery } from '@grafana/data';

/**
 * Container control actions
 */
export type ControlAction = 'start' | 'stop' | 'restart' | 'pause' | 'unpause';

/**
 * All valid control actions
 */
export const ALL_CONTROL_ACTIONS: ControlAction[] = ['start', 'stop', 'restart', 'pause', 'unpause'];

/**
 * Host selection mode for container filtering
 */
export type HostSelectionMode = 'whitelist' | 'blacklist';

/**
 * Per-host container selection configuration
 */
export interface HostSelection {
  hostId: string;
  mode: HostSelectionMode;
  // Whitelist: only these containers shown
  // Blacklist: these containers excluded
  containerIds: string[];
  // Per-container metric overrides (whitelist mode only)
  containerMetrics: Record<string, string[]>;
  // Metrics to fetch (blacklist mode - applies to all included containers)
  metrics: string[];
}

/**
 * Docker Metrics query model
 */
export interface DockerMetricsQuery extends DataQuery {
  // New matrix-based selection
  hostSelections?: Record<string, HostSelection>;

  // Global default metrics for new containers
  defaultContainerMetrics?: string[];

  // Legacy fields (kept for backward compatibility)
  metrics?: string[];
  containerNamePattern?: string;
  containerIds?: string[];
  hostIds?: string[];
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
  enableContainerControls?: boolean;
  allowedControlActions?: ControlAction[];
}

/**
 * Secure JSON data (stored encrypted)
 */
export interface DockerMetricsSecureJsonData {
  // Reserved for future use (e.g., API keys for agents)
}

/**
 * All available metrics
 */
export const ALL_METRICS = [
  'cpuPercent', 'memoryBytes', 'memoryPercent',
  'networkRxBytes', 'networkTxBytes',
  'diskReadBytes', 'diskWriteBytes',
  'uptimeSeconds',
  'cpuPressureSome', 'cpuPressureFull',
  'memoryPressureSome', 'memoryPressureFull',
  'ioPressureSome', 'ioPressureFull',
];

/**
 * Default metrics to query when none specified
 */
export const DEFAULT_METRICS = ['cpuPercent', 'memoryBytes'];

/**
 * Default query
 */
export const DEFAULT_QUERY: Partial<DockerMetricsQuery> = {
  metrics: DEFAULT_METRICS,
  defaultContainerMetrics: DEFAULT_METRICS,
};
