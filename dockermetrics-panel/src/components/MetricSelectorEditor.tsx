import React from 'react';
import { StandardEditorProps } from '@grafana/data';
import { SimpleOptions } from '../types';
import { MetricSelector } from './MetricSelector';

export const MetricSelectorEditor: React.FC<StandardEditorProps<string[], any, SimpleOptions>> = ({
  value,
  onChange,
}) => {
  return (
    <MetricSelector
      selectedMetrics={value || ['cpuPercent', 'memoryBytes']}
      onChange={onChange}
    />
  );
};
