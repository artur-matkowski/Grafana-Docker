import { ContainerState, ContainerHealthStatus, VALID_CONTAINER_STATES, VALID_HEALTH_STATUSES, isStateRunning, isStatePaused, isHealthUnhealthy } from '../types';

// Re-export helper functions from types for use in SimplePanel and ContainerSelectorEditor
export { isStateRunning, isStatePaused, isHealthUnhealthy };

/**
 * Validate and normalize container state from API response.
 * Handles case mismatches and invalid values.
 */
export function normalizeContainerState(rawState: unknown): ContainerState {
  if (rawState === undefined || rawState === null || rawState === '') {
    return 'undefined';
  }
  const normalizedState = typeof rawState === 'string' ? rawState.toLowerCase() : String(rawState);
  if (VALID_CONTAINER_STATES.includes(normalizedState as ContainerState)) {
    return normalizedState as ContainerState;
  }
  return 'invalid';
}

/**
 * Validate and normalize container health status from API response.
 * Handles case mismatches and missing values.
 */
export function normalizeHealthStatus(rawStatus: unknown): ContainerHealthStatus {
  if (rawStatus === undefined || rawStatus === null || rawStatus === '') {
    return 'none';
  }
  const normalized = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : String(rawStatus);
  if (VALID_HEALTH_STATUSES.includes(normalized as ContainerHealthStatus)) {
    return normalized as ContainerHealthStatus;
  }
  return 'none';
}
