import React, { useState, useEffect, useCallback } from 'react';
import { css } from '@emotion/css';
import { ContainerInfo } from '../types';

interface ContainerSelectorProps {
  apiUrl: string;
  selectedContainerId: string;
  onSelect: (containerId: string) => void;
}

const styles = {
  container: css`
    padding: 8px 0;
  `,
  search: css`
    width: 100%;
    padding: 8px;
    margin-bottom: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.2);
    color: inherit;
    font-size: 13px;
    &:focus {
      outline: none;
      border-color: rgba(255, 255, 255, 0.3);
    }
  `,
  hostGroup: css`
    margin-bottom: 12px;
  `,
  hostHeader: css`
    font-size: 11px;
    color: #888;
    margin-bottom: 4px;
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 4px;
  `,
  containerList: css`
    max-height: 300px;
    overflow-y: auto;
  `,
  containerItem: css`
    display: flex;
    align-items: center;
    padding: 8px;
    cursor: pointer;
    border-radius: 4px;
    &:hover {
      background: rgba(255, 255, 255, 0.05);
    }
  `,
  containerItemSelected: css`
    background: rgba(50, 116, 217, 0.2);
    &:hover {
      background: rgba(50, 116, 217, 0.3);
    }
  `,
  containerName: css`
    flex: 1;
    font-size: 13px;
  `,
  containerId: css`
    font-size: 11px;
    color: #888;
    font-family: monospace;
  `,
  loading: css`
    color: #888;
    font-size: 12px;
    padding: 8px;
  `,
  error: css`
    color: #FF5555;
    font-size: 12px;
    padding: 8px;
  `,
  emptyState: css`
    color: #888;
    font-size: 12px;
    padding: 8px;
    text-align: center;
  `,
};

export const ContainerSelector: React.FC<ContainerSelectorProps> = ({
  apiUrl,
  selectedContainerId,
  onSelect,
}) => {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchContainers = useCallback(async () => {
    if (!apiUrl) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiUrl}/api/containers`);
      if (!response.ok) {
        throw new Error(`Failed to fetch containers: ${response.status}`);
      }
      const data: ContainerInfo[] = await response.json();
      setContainers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch containers');
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchContainers();
    const interval = setInterval(fetchContainers, 30000);
    return () => clearInterval(interval);
  }, [fetchContainers]);

  // Filter containers by search term
  const filteredContainers = containers.filter((c) => {
    const searchLower = search.toLowerCase();
    return (
      c.containerName.toLowerCase().includes(searchLower) ||
      c.containerId.toLowerCase().includes(searchLower) ||
      c.hostName.toLowerCase().includes(searchLower)
    );
  });

  // Group containers by host
  const containersByHost = filteredContainers.reduce((acc, container) => {
    const hostKey = `${container.hostId}:${container.hostName}`;
    if (!acc[hostKey]) {
      acc[hostKey] = [];
    }
    acc[hostKey].push(container);
    return acc;
  }, {} as Record<string, ContainerInfo[]>);

  if (!apiUrl) {
    return <div className={styles.emptyState}>Configure API URL first</div>;
  }

  return (
    <div className={styles.container}>
      <input
        className={styles.search}
        type="text"
        placeholder="Search containers..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {error && <div className={styles.error}>{error}</div>}

      {loading && containers.length === 0 && (
        <div className={styles.loading}>Loading containers...</div>
      )}

      {!loading && containers.length === 0 && (
        <div className={styles.emptyState}>No containers found</div>
      )}

      <div className={styles.containerList}>
        {Object.entries(containersByHost).map(([hostKey, hostContainers]) => {
          const hostName = hostKey.split(':')[1];
          return (
            <div key={hostKey} className={styles.hostGroup}>
              <div className={styles.hostHeader}>
                {hostName} ({hostContainers.length} containers)
              </div>
              {hostContainers.map((container) => (
                <div
                  key={container.containerId}
                  className={`${styles.containerItem} ${
                    selectedContainerId === container.containerId
                      ? styles.containerItemSelected
                      : ''
                  }`}
                  onClick={() => onSelect(container.containerId)}
                >
                  <div className={styles.containerName}>
                    {container.containerName.replace(/^\//, '')}
                  </div>
                  <div className={styles.containerId}>
                    {container.containerId.substring(0, 12)}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};
