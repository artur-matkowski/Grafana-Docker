import React, { useMemo } from 'react';
import { StandardEditorProps, SelectableValue } from '@grafana/data';
import { Select, InlineField, Alert } from '@grafana/ui';
import { getDataSourceSrv } from '@grafana/runtime';

interface DataSourceOption {
  dataSourceUid?: string;
}

export const DataSourceEditor: React.FC<StandardEditorProps<DataSourceOption>> = ({ value, onChange, context }) => {
  // Get all Docker Metrics data sources
  const dataSourceOptions = useMemo(() => {
    const srv = getDataSourceSrv();
    const list = srv.getList({ pluginId: 'bitforge-dockermetrics-datasource' });

    const options: Array<SelectableValue<string>> = [];

    for (const ds of list) {
      options.push({
        label: ds.name,
        value: ds.uid,
        description: ds.type,
      });
    }

    return options;
  }, []);

  const currentValue = value?.dataSourceUid || '';

  const handleChange = (selected: SelectableValue<string>) => {
    const uid = selected?.value || '';
    onChange({
      dataSourceUid: uid || undefined,
    });
  };

  return (
    <div>
      <InlineField label="Data Source" labelWidth={14} tooltip="Select a Docker Metrics data source to enable public dashboard support">
        <Select
          options={dataSourceOptions}
          value={currentValue}
          onChange={handleChange}
          width={30}
          placeholder="Select data source..."
        />
      </InlineField>

      {currentValue && (
        <Alert title="Data Source Mode" severity="info" style={{ marginTop: 8 }}>
          Metrics will be fetched via the data source. This enables the panel to work on public dashboards.
        </Alert>
      )}

      {dataSourceOptions.length === 0 && (
        <Alert title="No Data Sources" severity="warning" style={{ marginTop: 8 }}>
          No Docker Metrics data sources found. Install and configure the &quot;bitforge-dockermetrics-datasource&quot;
          plugin first.
        </Alert>
      )}
    </div>
  );
};
