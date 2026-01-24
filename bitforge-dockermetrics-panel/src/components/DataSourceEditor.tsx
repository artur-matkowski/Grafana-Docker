import React, { useMemo } from 'react';
import { StandardEditorProps, SelectableValue } from '@grafana/data';
import { Select, InlineField, Alert } from '@grafana/ui';
import { getDataSourceSrv } from '@grafana/runtime';

interface DataSourceOption {
  useDataSource: boolean;
  dataSourceUid?: string;
}

export const DataSourceEditor: React.FC<StandardEditorProps<DataSourceOption>> = ({ value, onChange, context }) => {
  // Get all Docker Metrics data sources
  const dataSourceOptions = useMemo(() => {
    const srv = getDataSourceSrv();
    const list = srv.getList({ pluginId: 'bitforge-dockermetrics-datasource' });

    const options: Array<SelectableValue<string>> = [
      { label: 'None (use panel proxy)', value: '' },
    ];

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
  const useDataSource = value?.useDataSource ?? false;

  const handleChange = (selected: SelectableValue<string>) => {
    const uid = selected?.value || '';
    onChange({
      useDataSource: uid !== '',
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

      {useDataSource && (
        <Alert title="Data Source Mode" severity="info" style={{ marginTop: 8 }}>
          Metrics will be fetched via the data source. Container controls are disabled in this mode.
          This enables the panel to work on public dashboards.
        </Alert>
      )}

      {dataSourceOptions.length === 1 && (
        <Alert title="No Data Sources" severity="warning" style={{ marginTop: 8 }}>
          No Docker Metrics data sources found. Install and configure the &quot;bitforge-dockermetrics-datasource&quot;
          plugin to enable public dashboard support.
        </Alert>
      )}
    </div>
  );
};
