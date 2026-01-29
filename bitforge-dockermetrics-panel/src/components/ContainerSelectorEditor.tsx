import React, { useMemo } from 'react';
import { StandardEditorProps, StandardEditorContext, DataFrame } from '@grafana/data';
import { SimpleOptions, ContainerInfo } from '../types';
import { ContainerSelector } from './ContainerSelector';
import { normalizeContainerState, normalizeHealthStatus, isStateRunning, isStatePaused, isHealthUnhealthy } from '../utils/datasource';

// Extended context type that includes onOptionsChange and data (available at runtime but not in base types)
interface ExtendedEditorContext extends StandardEditorContext<SimpleOptions> {
  onOptionsChange?: (options: SimpleOptions) => void;
  data?: DataFrame[];
}

type ContainerSelectorEditorProps = Omit<StandardEditorProps<string[], unknown, SimpleOptions>, 'context'> & {
  context: ExtendedEditorContext;
};

// Parse containers from DataFrame (from panel's query results)
function parseContainersFromDataFrame(frame: DataFrame): ContainerInfo[] {
  const containers: ContainerInfo[] = [];

  const containerIdField = frame.fields.find((f) => f.name === 'containerId');
  const containerNameField = frame.fields.find((f) => f.name === 'containerName');
  const hostNameField = frame.fields.find((f) => f.name === 'hostName');
  const stateField = frame.fields.find((f) => f.name === 'state');
  const healthStatusField = frame.fields.find((f) => f.name === 'healthStatus');
  const isRunningField = frame.fields.find((f) => f.name === 'isRunning');
  const isPausedField = frame.fields.find((f) => f.name === 'isPaused');
  const isUnhealthyField = frame.fields.find((f) => f.name === 'isUnhealthy');

  if (!containerIdField || !containerNameField) {
    return [];
  }

  for (let i = 0; i < frame.length; i++) {
    const state = normalizeContainerState(stateField?.values[i]);
    const healthStatus = normalizeHealthStatus(healthStatusField?.values[i]);

    containers.push({
      hostId: (hostNameField?.values[i] as string) || 'default',
      hostName: (hostNameField?.values[i] as string) || 'default',
      containerId: containerIdField.values[i] as string,
      containerName: containerNameField.values[i] as string,
      state,
      healthStatus,
      isRunning: (isRunningField?.values[i] as boolean) ?? isStateRunning(state),
      isPaused: (isPausedField?.values[i] as boolean) ?? isStatePaused(state),
      isUnhealthy: (isUnhealthyField?.values[i] as boolean) ?? isHealthUnhealthy(healthStatus),
    });
  }

  return containers;
}

export const ContainerSelectorEditor: React.FC<ContainerSelectorEditorProps> = ({
  value,
  onChange,
  context,
}) => {
  // Parse containers from context.data (panel's query results)
  const containers = useMemo(() => {
    if (!context.data || context.data.length === 0) {
      return [];
    }

    // Find containers query result
    const containersFrame = context.data.find(frame =>
      frame.refId === 'containers' ||
      frame.meta?.custom?.queryType === 'containers' ||
      (frame.fields.some(f => f.name === 'containerId') && frame.fields.some(f => f.name === 'state'))
    );

    if (containersFrame) {
      return parseContainersFromDataFrame(containersFrame);
    }

    return [];
  }, [context.data]);

  const handleShowAllChange = (showAll: boolean) => {
    if (context.options && context.onOptionsChange) {
      context.onOptionsChange({ ...context.options, showAllContainers: showAll });
    }
  };

  const handleBlacklistChange = (containerIds: string[]) => {
    if (context.options && context.onOptionsChange) {
      context.onOptionsChange({ ...context.options, containerBlacklist: containerIds });
    }
  };

  return (
    <ContainerSelector
      containers={containers}
      selectedContainerIds={value || []}
      blacklistedContainerIds={context.options?.containerBlacklist || []}
      showAllContainers={context.options?.showAllContainers || false}
      onSelectionChange={(containerIds) => onChange(containerIds)}
      onBlacklistChange={handleBlacklistChange}
      onShowAllChange={handleShowAllChange}
    />
  );
};
