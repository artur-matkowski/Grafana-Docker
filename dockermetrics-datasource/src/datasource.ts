import {
  DataSourceInstanceSettings,
  CoreApp,
  DataQueryRequest,
  TestDataSourceResponse,
} from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv } from '@grafana/runtime';

import { DockerMetricsQuery, DockerMetricsDataSourceOptions, DEFAULT_QUERY } from './types';

export class DockerMetricsDataSource extends DataSourceWithBackend<
  DockerMetricsQuery,
  DockerMetricsDataSourceOptions
> {
  constructor(instanceSettings: DataSourceInstanceSettings<DockerMetricsDataSourceOptions>) {
    super(instanceSettings);
  }

  /**
   * Get default query for new panels
   */
  getDefaultQuery(_: CoreApp): Partial<DockerMetricsQuery> {
    return DEFAULT_QUERY;
  }

  /**
   * Apply template variables to queries before sending to backend
   */
  applyTemplateVariables(query: DockerMetricsQuery, scopedVars: Record<string, { value: string }>): DockerMetricsQuery {
    const templateSrv = getTemplateSrv();

    return {
      ...query,
      // Replace template variables in container name pattern
      containerNamePattern: query.containerNamePattern
        ? templateSrv.replace(query.containerNamePattern, scopedVars)
        : undefined,
      // Replace template variables in container IDs (could be a variable like $container)
      containerIds: query.containerIds?.map((id) => templateSrv.replace(id, scopedVars)),
      // Replace template variables in host IDs
      hostIds: query.hostIds?.map((id) => templateSrv.replace(id, scopedVars)),
    };
  }

  /**
   * Execute queries - delegated to backend
   */
  query(request: DataQueryRequest<DockerMetricsQuery>): ReturnType<DataSourceWithBackend<DockerMetricsQuery, DockerMetricsDataSourceOptions>['query']> {
    return super.query(request);
  }

  /**
   * Filter valid queries (skip empty/disabled)
   */
  filterQuery(query: DockerMetricsQuery): boolean {
    // New matrix mode: check if hostSelections has any entries
    if (query.hostSelections && Object.keys(query.hostSelections).length > 0) {
      return true;
    }
    // Legacy mode: ensure at least one metric is selected
    return (query.metrics?.length ?? 0) > 0;
  }

  /**
   * Test data source connection - delegated to backend health check
   */
  async testDatasource(): Promise<TestDataSourceResponse> {
    // The backend health check will verify connectivity to configured hosts
    return super.testDatasource();
  }
}
