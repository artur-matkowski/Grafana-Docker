import { DataSourcePlugin } from '@grafana/data';
import { DockerMetricsDataSource } from './datasource';
import { ConfigEditor } from './components/ConfigEditor';
import { QueryEditor } from './components/QueryEditor';
import { DockerMetricsQuery, DockerMetricsDataSourceOptions } from './types';

export const plugin = new DataSourcePlugin<DockerMetricsDataSource, DockerMetricsQuery, DockerMetricsDataSourceOptions>(
  DockerMetricsDataSource
)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor);
