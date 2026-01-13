import React, { useState, useEffect, useCallback } from 'react';
import { css } from '@emotion/css';
import { DockerHostStatus } from '../types';

interface HostManagerProps {
  apiUrl: string;
  onHostsChanged?: () => void;
}

const styles = {
  container: css`
    padding: 8px 0;
  `,
  hostList: css`
    margin-bottom: 12px;
  `,
  hostItem: css`
    display: flex;
    align-items: center;
    padding: 8px;
    margin-bottom: 4px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
  `,
  healthIndicator: css`
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 8px;
  `,
  healthy: css`
    background-color: #73BF69;
  `,
  unhealthy: css`
    background-color: #FF5555;
  `,
  unknown: css`
    background-color: #888;
  `,
  hostInfo: css`
    flex: 1;
    min-width: 0;
  `,
  hostName: css`
    font-weight: 500;
    margin-bottom: 2px;
  `,
  hostUrl: css`
    font-size: 11px;
    color: #888;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  hostMeta: css`
    font-size: 11px;
    color: #888;
    margin-left: 8px;
  `,
  removeButton: css`
    background: none;
    border: none;
    color: #FF5555;
    cursor: pointer;
    padding: 4px 8px;
    font-size: 14px;
    &:hover {
      color: #FF7777;
    }
  `,
  addForm: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 4px;
  `,
  input: css`
    padding: 6px 8px;
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
  buttonRow: css`
    display: flex;
    gap: 8px;
  `,
  addButton: css`
    padding: 6px 12px;
    background: #3274D9;
    border: none;
    border-radius: 4px;
    color: white;
    cursor: pointer;
    font-size: 13px;
    &:hover {
      background: #4285EA;
    }
    &:disabled {
      background: #555;
      cursor: not-allowed;
    }
  `,
  cancelButton: css`
    padding: 6px 12px;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    color: inherit;
    cursor: pointer;
    font-size: 13px;
    &:hover {
      background: rgba(255, 255, 255, 0.05);
    }
  `,
  showFormButton: css`
    padding: 6px 12px;
    background: transparent;
    border: 1px dashed rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    color: #888;
    cursor: pointer;
    font-size: 13px;
    width: 100%;
    &:hover {
      background: rgba(255, 255, 255, 0.05);
      color: inherit;
    }
  `,
  error: css`
    color: #FF5555;
    font-size: 12px;
    padding: 4px 0;
  `,
  loading: css`
    color: #888;
    font-size: 12px;
    padding: 8px 0;
  `,
  emptyState: css`
    color: #888;
    font-size: 12px;
    padding: 8px 0;
    text-align: center;
  `,
};

export const HostManager: React.FC<HostManagerProps> = ({ apiUrl, onHostsChanged }) => {
  const [hosts, setHosts] = useState<DockerHostStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newHostName, setNewHostName] = useState('');
  const [newHostUrl, setNewHostUrl] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchHosts = useCallback(async () => {
    if (!apiUrl) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiUrl}/api/hosts`);
      if (!response.ok) {
        throw new Error(`Failed to fetch hosts: ${response.status}`);
      }
      const data: DockerHostStatus[] = await response.json();
      setHosts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch hosts');
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchHosts();
    const interval = setInterval(fetchHosts, 10000);
    return () => clearInterval(interval);
  }, [fetchHosts]);

  const addHost = async () => {
    if (!newHostName.trim() || !newHostUrl.trim()) return;

    setAdding(true);
    setError(null);

    try {
      const response = await fetch(`${apiUrl}/api/config/hosts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newHostName.trim(),
          url: newHostUrl.trim(),
          enabled: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to add host: ${response.status}`);
      }

      setNewHostName('');
      setNewHostUrl('');
      setShowAddForm(false);
      await fetchHosts();
      onHostsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add host');
    } finally {
      setAdding(false);
    }
  };

  const removeHost = async (hostId: string) => {
    try {
      const response = await fetch(`${apiUrl}/api/config/hosts/${hostId}`, {
        method: 'DELETE',
      });

      if (!response.ok && response.status !== 204) {
        throw new Error(`Failed to remove host: ${response.status}`);
      }

      await fetchHosts();
      onHostsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove host');
    }
  };

  const getHealthClass = (host: DockerHostStatus) => {
    if (!host.lastSeen) return styles.unknown;
    return host.isHealthy ? styles.healthy : styles.unhealthy;
  };

  if (!apiUrl) {
    return <div className={styles.emptyState}>Configure API URL first</div>;
  }

  return (
    <div className={styles.container}>
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.hostList}>
        {loading && hosts.length === 0 && (
          <div className={styles.loading}>Loading hosts...</div>
        )}

        {!loading && hosts.length === 0 && (
          <div className={styles.emptyState}>No Docker hosts configured</div>
        )}

        {hosts.map((host) => (
          <div key={host.id} className={styles.hostItem}>
            <div className={`${styles.healthIndicator} ${getHealthClass(host)}`} />
            <div className={styles.hostInfo}>
              <div className={styles.hostName}>{host.name}</div>
              <div className={styles.hostUrl}>{host.url}</div>
            </div>
            <div className={styles.hostMeta}>
              {host.containerCount} containers
            </div>
            <button
              className={styles.removeButton}
              onClick={() => removeHost(host.id)}
              title="Remove host"
            >
              x
            </button>
          </div>
        ))}
      </div>

      {showAddForm ? (
        <div className={styles.addForm}>
          <input
            className={styles.input}
            type="text"
            placeholder="Host name (e.g., Production Server)"
            value={newHostName}
            onChange={(e) => setNewHostName(e.target.value)}
          />
          <input
            className={styles.input}
            type="text"
            placeholder="Docker API URL (e.g., http://192.168.1.10:2375)"
            value={newHostUrl}
            onChange={(e) => setNewHostUrl(e.target.value)}
          />
          <div className={styles.buttonRow}>
            <button
              className={styles.addButton}
              onClick={addHost}
              disabled={adding || !newHostName.trim() || !newHostUrl.trim()}
            >
              {adding ? 'Adding...' : 'Add Host'}
            </button>
            <button
              className={styles.cancelButton}
              onClick={() => {
                setShowAddForm(false);
                setNewHostName('');
                setNewHostUrl('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className={styles.showFormButton} onClick={() => setShowAddForm(true)}>
          + Add Docker Host
        </button>
      )}
    </div>
  );
};
