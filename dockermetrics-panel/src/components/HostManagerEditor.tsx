import React from 'react';
import { StandardEditorProps } from '@grafana/data';
import { SimpleOptions } from '../types';
import { HostManager } from './HostManager';

export const HostManagerEditor: React.FC<StandardEditorProps<any, any, SimpleOptions>> = ({ context }) => {
  return <HostManager apiUrl={context.options.apiUrl} />;
};
