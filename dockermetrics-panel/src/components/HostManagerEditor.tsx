import React from 'react';
import { StandardEditorProps } from '@grafana/data';
import { SimpleOptions, HostConfig, DEFAULT_HOSTS } from '../types';
import { HostManager } from './HostManager';

export const HostManagerEditor: React.FC<StandardEditorProps<HostConfig[], any, SimpleOptions>> = ({
  value,
  onChange,
}) => {
  return (
    <HostManager
      hosts={value || DEFAULT_HOSTS}
      onHostsChange={(hosts) => onChange(hosts)}
    />
  );
};
