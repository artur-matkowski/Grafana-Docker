import React, { useCallback } from 'react';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { InlineField, Select, MultiSelect, Input } from '@grafana/ui';
import { DockerMetricsDataSource } from '../datasource';
import {
  DockerMetricsQuery,
  DockerMetricsDataSourceOptions,
  QueryType,
  AVAILABLE_METRICS,
  DEFAULT_METRICS,
} from '../types';

type Props = QueryEditorProps<DockerMetricsDataSource, DockerMetricsQuery, DockerMetricsDataSourceOptions>;

const QUERY_TYPE_OPTIONS: Array<SelectableValue<QueryType>> = [
  { label: 'Metrics', value: 'metrics', description: 'Fetch container metrics over time' },
  { label: 'Containers', value: 'containers', description: 'List containers (for variables)' },
];

const METRIC_OPTIONS: Array<SelectableValue<string>> = AVAILABLE_METRICS.map((m) => ({
  label: m.label,
  value: m.value,
}));

export function QueryEditor({ query, onChange, onRunQuery }: Props) {
  const queryType = query.queryType || 'metrics';
  const selectedMetrics = query.metrics || DEFAULT_METRICS;

  const onQueryTypeChange = useCallback(
    (value: SelectableValue<QueryType>) => {
      onChange({ ...query, queryType: value.value || 'metrics' });
      onRunQuery();
    },
    [query, onChange, onRunQuery]
  );

  const onMetricsChange = useCallback(
    (values: Array<SelectableValue<string>>) => {
      onChange({ ...query, metrics: values.map((v) => v.value || '') });
      onRunQuery();
    },
    [query, onChange, onRunQuery]
  );

  const onContainerPatternChange = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => {
      onChange({ ...query, containerNamePattern: e.currentTarget.value });
    },
    [query, onChange]
  );

  const onContainerPatternBlur = useCallback(() => {
    onRunQuery();
  }, [onRunQuery]);

  return (
    <div>
      <InlineField label="Query Type" labelWidth={14}>
        <Select<QueryType>
          options={QUERY_TYPE_OPTIONS}
          value={QUERY_TYPE_OPTIONS.find((o) => o.value === queryType)}
          onChange={onQueryTypeChange}
          width={25}
        />
      </InlineField>

      {queryType === 'metrics' && (
        <>
          <InlineField
            label="Metrics"
            labelWidth={14}
            tooltip="Select which metrics to fetch for each container"
          >
            <MultiSelect<string>
              options={METRIC_OPTIONS}
              value={selectedMetrics.map((m) => METRIC_OPTIONS.find((o) => o.value === m) || { value: m, label: m })}
              onChange={onMetricsChange}
              placeholder="Select metrics..."
              width={50}
            />
          </InlineField>

          <InlineField
            label="Container Filter"
            labelWidth={14}
            tooltip="Regex pattern to filter containers by name (leave empty for all)"
          >
            <Input
              value={query.containerNamePattern || ''}
              onChange={onContainerPatternChange}
              onBlur={onContainerPatternBlur}
              placeholder="e.g., nginx|redis|postgres"
              width={50}
            />
          </InlineField>
        </>
      )}

      {queryType === 'containers' && (
        <p style={{ color: '#888', fontSize: '12px', marginTop: '8px' }}>
          This query returns a list of all containers from configured hosts.
          Use this with dashboard variables to create container selectors.
        </p>
      )}
    </div>
  );
}
