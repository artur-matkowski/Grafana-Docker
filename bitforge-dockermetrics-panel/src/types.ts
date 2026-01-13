export interface SimpleOptions {
  apiUrl: string;
  containerId: string;
  showMemory: boolean;
  showCpu: boolean;
  showNetwork: boolean;
}

// Types matching the C# API responses
export interface ContainerMetricSnapshot {
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
