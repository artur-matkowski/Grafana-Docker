import { useState, useCallback } from 'react';
import { getBackendSrv } from '@grafana/runtime';
import { ControlAction } from '../types';

export interface ControlState {
  loading: boolean;
  error: string | null;
  lastResult: ControlResult | null;
}

export interface ControlResult {
  success: boolean;
  action: string;
  containerId: string;
  error: string;
}

interface ControlQueryResponse {
  results: {
    [key: string]: {
      frames?: Array<{
        schema?: {
          fields?: Array<{
            name: string;
          }>;
        };
        data?: {
          values?: unknown[][];
        };
      }>;
      error?: string;
    };
  };
}

export function useContainerControl() {
  const [state, setState] = useState<ControlState>({
    loading: false,
    error: null,
    lastResult: null,
  });

  const executeAction = useCallback(
    async (
      action: ControlAction,
      containerId: string,
      hostId: string,
      datasourceUid: string
    ): Promise<ControlResult> => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const response = await getBackendSrv().fetch<ControlQueryResponse>({
          url: '/api/ds/query',
          method: 'POST',
          data: {
            queries: [
              {
                refId: 'control',
                datasource: { uid: datasourceUid },
                queryType: 'control',
                controlAction: action,
                targetContainer: containerId,
                targetHost: hostId,
              },
            ],
            from: 'now-1h',
            to: 'now',
          },
        }).toPromise();

        if (!response?.data?.results?.control) {
          throw new Error('Invalid response from control query');
        }

        const queryResult = response.data.results.control;

        if (queryResult.error) {
          throw new Error(queryResult.error);
        }

        const frame = queryResult.frames?.[0];
        if (!frame?.data?.values) {
          throw new Error('No data in control response');
        }

        const fields = frame.schema?.fields || [];
        const values = frame.data.values;

        const getFieldValue = (name: string): unknown => {
          const idx = fields.findIndex((f) => f.name === name);
          return idx >= 0 && values[idx] ? values[idx][0] : undefined;
        };

        const result: ControlResult = {
          success: getFieldValue('success') as boolean,
          action: getFieldValue('action') as string,
          containerId: getFieldValue('containerId') as string,
          error: (getFieldValue('error') as string) || '',
        };

        setState({ loading: false, error: null, lastResult: result });
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setState({ loading: false, error: errorMessage, lastResult: null });
        throw err;
      }
    },
    []
  );

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    executeAction,
    clearError,
    ...state,
  };
}
