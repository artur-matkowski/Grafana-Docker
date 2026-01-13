export interface SimpleOptions {
  apiUrl: string;
  containerId: string;
  selectedHostId: string;
  showMemory: boolean;
  showCpu: boolean;
  showNetwork: boolean;
}

// Docker Host Configuration
export interface DockerHostConfig {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

// Docker Host with runtime status
export interface DockerHostStatus {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  lastSeen: string | null;
  isHealthy: boolean;
  lastError: string | null;
  containerCount: number;
}

// Collector Configuration
export interface CollectorConfig {
  hosts: DockerHostConfig[];
  settings: CollectorSettings;
}

export interface CollectorSettings {
  pollIntervalSeconds: number;
  retentionHours: number;
}

// Container info for listing
export interface ContainerInfo {
  hostId: string;
  hostName: string;
  containerId: string;
  containerName: string;
}

// Types matching the C# API responses
export interface ContainerMetricSnapshot {
  hostId: string;
  hostName: string;
  containerId: string;
  containerName: string;
  timestamp: string;
  cpuPercent: number;
  memoryBytes: number;
  memoryPercent: number;
  networkRxBytes: number;
  networkTxBytes: number;
  diskReadBytes: number;
  diskWriteBytes: number;
  uptimeSeconds: number;
  isRunning: boolean;
  cpuPressureSome: number | null;
  cpuPressureFull: number | null;
  memoryPressureSome: number | null;
  memoryPressureFull: number | null;
  ioPressureSome: number | null;
  ioPressureFull: number | null;
}

export interface HostMetricSnapshot {
  hostname: string;
  timestamp: string;
  cpuPercent: number;
  cpuFrequencyMhz: number;
  memoryBytes: number;
  memoryPercent: number;
  uptimeSeconds: number;
  isUp: boolean;
}
