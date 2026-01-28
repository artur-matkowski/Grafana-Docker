import React, { useState, useEffect, useCallback } from 'react';
import { css } from '@emotion/css';
import { ContainerInfo, DataSourceConfig } from '../types';
import { fetchContainersViaDataSource } from '../utils/datasource';

interface ContainerSelectorProps {
  dataSourceConfig: DataSourceConfig;
  selectedContainerIds: string[];
  blacklistedContainerIds: string[];
  showAllContainers: boolean;
  onSelectionChange: (containerIds: string[]) => void;
  onBlacklistChange: (containerIds: string[]) => void;
  onShowAllChange: (showAll: boolean) => void;
}

const styles = {
  container: css`
    padding: 8px 0;
  `,
  allContainersToggle: css`
    display: flex;
    align-items: center;
    padding: 10px 8px;
    margin-bottom: 8px;
    background: rgba(50, 116, 217, 0.1);
    border: 1px solid rgba(50, 116, 217, 0.3);
    border-radius: 4px;
    cursor: pointer;
    &:hover {
      background: rgba(50, 116, 217, 0.15);
    }
  `,
  allContainersToggleActive: css`
    background: rgba(50, 116, 217, 0.25);
    border-color: rgba(50, 116, 217, 0.5);
  `,
  checkbox: css`
    margin-right: 8px;
    width: 16px;
    height: 16px;
    cursor: pointer;
  `,
  allContainersLabel: css`
    font-size: 13px;
    font-weight: 500;
  `,
  allContainersDescription: css`
    font-size: 11px;
    color: #888;
    margin-left: auto;
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
    display: flex;
    align-items: center;
    font-size: 11px;
    color: #888;
    margin-bottom: 4px;
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 4px;
  `,
  hostName: css`
    flex: 1;
  `,
  selectAllHost: css`
    font-size: 10px;
    color: #3274d9;
    cursor: pointer;
    &:hover {
      text-decoration: underline;
    }
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
    color: #ff5555;
    font-size: 12px;
    padding: 8px;
  `,
  emptyState: css`
    color: #888;
    font-size: 12px;
    padding: 8px;
    text-align: center;
  `,
  selectedCount: css`
    font-size: 11px;
    color: #888;
    padding: 4px 8px;
    margin-bottom: 8px;
  `,
};

export const ContainerSelector: React.FC<ContainerSelectorProps> = ({
  dataSourceConfig,
  selectedContainerIds,
  blacklistedContainerIds,
  showAllContainers,
  onSelectionChange,
  onBlacklistChange,
  onShowAllChange,
}) => {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const dataSourceUid = dataSourceConfig?.dataSourceUid || '';

  const fetchContainers = useCallback(async () => {
    if (!dataSourceUid) {
      setContainers([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await fetchContainersViaDataSource(dataSourceUid);
      setContainers(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch containers');
    } finally {
      setLoading(false);
    }
  }, [dataSourceUid]);

  useEffect(() => {
    fetchContainers();
    const interval = setInterval(fetchContainers, 30000);
    return () => clearInterval(interval);
  }, [fetchContainers]);

  const filteredContainers = containers.filter((c) => {
    const searchLower = search.toLowerCase();
    return (
      c.containerName.toLowerCase().includes(searchLower) ||
      c.containerId.toLowerCase().includes(searchLower) ||
      c.hostName.toLowerCase().includes(searchLower)
    );
  });

  const containersByHost = filteredContainers.reduce((acc, container) => {
    const hostKey = `${container.hostId}:${container.hostName}`;
    if (!acc[hostKey]) {
      acc[hostKey] = [];
    }
    acc[hostKey].push(container);
    return acc;
  }, {} as Record<string, ContainerInfo[]>);

  const toggleContainer = (containerId: string) => {
    if (showAllContainers) {
      const newBlacklist = blacklistedContainerIds.includes(containerId)
        ? blacklistedContainerIds.filter((id) => id !== containerId)
        : [...blacklistedContainerIds, containerId];
      onBlacklistChange(newBlacklist);
    } else {
      const newSelection = selectedContainerIds.includes(containerId)
        ? selectedContainerIds.filter((id) => id !== containerId)
        : [...selectedContainerIds, containerId];
      onSelectionChange(newSelection);
    }
  };

  const selectAllInHost = (hostContainers: ContainerInfo[]) => {
    const hostContainerIds = hostContainers.map((c) => c.containerId);

    if (showAllContainers) {
      const allBlacklisted = hostContainerIds.every((id) => blacklistedContainerIds.includes(id));
      if (allBlacklisted) {
        onBlacklistChange(blacklistedContainerIds.filter((id) => !hostContainerIds.includes(id)));
      } else {
        const newBlacklist = [...new Set([...blacklistedContainerIds, ...hostContainerIds])];
        onBlacklistChange(newBlacklist);
      }
    } else {
      const allSelected = hostContainerIds.every((id) => selectedContainerIds.includes(id));
      if (allSelected) {
        onSelectionChange(selectedContainerIds.filter((id) => !hostContainerIds.includes(id)));
      } else {
        const newSelection = [...new Set([...selectedContainerIds, ...hostContainerIds])];
        onSelectionChange(newSelection);
      }
    }
  };

  if (!dataSourceUid) {
    return <div className={styles.emptyState}>Configure a data source first in the Data Source section</div>;
  }

  return (
    <div className={styles.container}>
      <div
        className={`${styles.allContainersToggle} ${showAllContainers ? styles.allContainersToggleActive : ''}`}
        onClick={() => onShowAllChange(!showAllContainers)}
      >
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={showAllContainers}
          onChange={(e) => onShowAllChange(e.target.checked)}
          onClick={(e) => e.stopPropagation()}
        />
        <span className={styles.allContainersLabel}>All Containers</span>
        <span className={styles.allContainersDescription}>Auto-include new containers</span>
      </div>

      <div className={styles.selectedCount}>
        {showAllContainers
          ? `${blacklistedContainerIds.length} container${blacklistedContainerIds.length !== 1 ? 's' : ''} excluded`
          : `${selectedContainerIds.length} container${selectedContainerIds.length !== 1 ? 's' : ''} selected`
        }
      </div>

      <input
        className={styles.search}
        type="text"
        placeholder={showAllContainers ? "Search to exclude containers..." : "Search containers..."}
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
          const [, hostName] = hostKey.split(':');
          const allHostSelected = showAllContainers
            ? hostContainers.every((c) => blacklistedContainerIds.includes(c.containerId))
            : hostContainers.every((c) => selectedContainerIds.includes(c.containerId));
          return (
            <div key={hostKey} className={styles.hostGroup}>
              <div className={styles.hostHeader}>
                <span className={styles.hostName}>
                  {hostName} ({hostContainers.length})
                </span>
                <span
                  className={styles.selectAllHost}
                  onClick={() => selectAllInHost(hostContainers)}
                >
                  {showAllContainers
                    ? (allHostSelected ? 'Include all' : 'Exclude all')
                    : (allHostSelected ? 'Deselect all' : 'Select all')
                  }
                </span>
              </div>
              {hostContainers.map((container) => {
                const isSelected = selectedContainerIds.includes(container.containerId);
                const isBlacklisted = blacklistedContainerIds.includes(container.containerId);
                const isChecked = showAllContainers ? !isBlacklisted : isSelected;
                return (
                  <div
                    key={container.containerId}
                    className={`${styles.containerItem} ${isChecked ? styles.containerItemSelected : ''}`}
                    onClick={() => toggleContainer(container.containerId)}
                  >
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={isChecked}
                      onChange={() => toggleContainer(container.containerId)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className={styles.containerName}>
                      {container.containerName.replace(/^\//, '')}
                    </div>
                    <div className={styles.containerId}>
                      {container.containerId.substring(0, 12)}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
