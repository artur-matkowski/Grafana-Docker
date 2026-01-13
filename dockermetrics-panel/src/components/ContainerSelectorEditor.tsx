import React from 'react';
import { StandardEditorProps } from '@grafana/data';
import { SimpleOptions } from '../types';
import { ContainerSelector } from './ContainerSelector';

export const ContainerSelectorEditor: React.FC<StandardEditorProps<string, any, SimpleOptions>> = ({
  value,
  onChange,
  context,
}) => {
  return (
    <ContainerSelector
      apiUrl={context.options.apiUrl}
      selectedContainerId={value || ''}
      onSelect={(containerId) => onChange(containerId)}
    />
  );
};
