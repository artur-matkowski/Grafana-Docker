import React from 'react';
import { StandardEditorProps } from '@grafana/data';
import { SimpleOptions, DEFAULT_HOSTS } from '../types';
import { ContainerSelector } from './ContainerSelector';

export const ContainerSelectorEditor: React.FC<StandardEditorProps<string[], any, SimpleOptions>> = ({
  value,
  onChange,
  context,
}) => {
  const handleShowAllChange = (showAll: boolean) => {
    if (context.options && typeof (context as any).onOptionsChange === 'function') {
      (context as any).onOptionsChange({ ...context.options, showAllContainers: showAll });
    }
  };

  return (
    <ContainerSelector
      hosts={context.options?.hosts || DEFAULT_HOSTS}
      selectedContainerIds={value || []}
      showAllContainers={context.options?.showAllContainers || false}
      onSelectionChange={(containerIds) => onChange(containerIds)}
      onShowAllChange={handleShowAllChange}
    />
  );
};
