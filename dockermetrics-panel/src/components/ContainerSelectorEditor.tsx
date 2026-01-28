import React from 'react';
import { StandardEditorProps, StandardEditorContext } from '@grafana/data';
import { SimpleOptions } from '../types';
import { ContainerSelector } from './ContainerSelector';

// Extended context type that includes onOptionsChange (available at runtime but not in base types)
interface ExtendedEditorContext extends StandardEditorContext<SimpleOptions> {
  onOptionsChange?: (options: SimpleOptions) => void;
}

type ContainerSelectorEditorProps = Omit<StandardEditorProps<string[], unknown, SimpleOptions>, 'context'> & {
  context: ExtendedEditorContext;
};

export const ContainerSelectorEditor: React.FC<ContainerSelectorEditorProps> = ({
  value,
  onChange,
  context,
}) => {
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
      dataSourceConfig={context.options?.dataSourceConfig || { useDataSource: false }}
      selectedContainerIds={value || []}
      blacklistedContainerIds={context.options?.containerBlacklist || []}
      showAllContainers={context.options?.showAllContainers || false}
      onSelectionChange={(containerIds) => onChange(containerIds)}
      onBlacklistChange={handleBlacklistChange}
      onShowAllChange={handleShowAllChange}
    />
  );
};
