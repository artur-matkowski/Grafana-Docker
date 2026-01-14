import React, { useState, useEffect, useCallback } from 'react';
import { css } from '@emotion/css';
import { HostConfig, HostStatus, AgentInfo } from '../types';

interface HostManagerProps {
  hosts: HostConfig[];
  onHostsChange: (hosts: HostConfig[]) => void;
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
    flex-shrink: 0;
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
    text-align: right;
    min-width: 80px;
  `,
  hostVersion: css`
    font-size: 10px;
    color: #666;
  `,
  enabledToggle: css`
    margin-left: 8px;
    cursor: pointer;
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
  emptyState: css`
    color: #888;
    font-size: 12px;
    padding: 8px 0;
    text-align: center;
  `,
};

// Generate a simple UUID
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const HostManager: React.FC<HostManagerProps> = ({ hosts, onHostsChange }) => {
  const [hostStatuses, setHostStatuses] = useState<Map<string, HostStatus>>(new Map());
  const [showAddForm, setShowAddForm] = useState(false);
  const [newHostName, setNewHostName] = useState('');
  const [newHostUrl, setNewHostUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Check health of all hosts periodically
  const checkHostsHealth = useCallback(async () => {
    const newStatuses = new Map<string, HostStatus>();

    await Promise.all(
      hosts.map(async (host) => {
        const status: HostStatus = {
          ...host,
          isHealthy: false,
          lastError: null,
          hostname: null,
          agentVersion: null,
          dockerVersion: null,
          psiSupported: false,
          containerCount: 0,
        };

        try {
          const response = await fetch(`${host.url}/api/info`, {
            signal: AbortSignal.timeout(15000)
          });

          if (response.ok) {
            const info: AgentInfo = await response.json();
            status.isHealthy = info.dockerConnected;
            status.hostname = info.hostname;
            status.agentVersion = info.agentVersion;
            status.dockerVersion = info.dockerVersion;
            status.psiSupported = info.psiSupported;
            // Skip container count fetch - too slow on Docker Desktop/WSL
            // ContainerSelector will show container count instead
          } else {
            status.lastError = `HTTP ${response.status}`;
          }
        } catch (err) {
          status.lastError = err instanceof Error ? err.message : 'Connection failed';
        }

        newStatuses.set(host.id, status);
      })
    );

    setHostStatuses(newStatuses);
  }, [hosts]);

  useEffect(() => {
    checkHostsHealth();
    const interval = setInterval(checkHostsHealth, 60000); // 60s - reduced for slow Docker Desktop/WSL
    return () => clearInterval(interval);
  }, [checkHostsHealth]);

  const addHost = () => {
    if (!newHostName.trim() || !newHostUrl.trim()) return;

    // Normalize URL (remove trailing slash)
    let url = newHostUrl.trim();
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }

    // Check for duplicate URLs
    if (hosts.some((h) => h.url.toLowerCase() === url.toLowerCase())) {
      setError('A host with this URL already exists');
      return;
    }

    const newHost: HostConfig = {
      id: generateId(),
      name: newHostName.trim(),
      url,
      enabled: true,
    };

    onHostsChange([...hosts, newHost]);
    setNewHostName('');
    setNewHostUrl('');
    setShowAddForm(false);
    setError(null);
  };

  const removeHost = (hostId: string) => {
    onHostsChange(hosts.filter((h) => h.id !== hostId));
  };

  const toggleHost = (hostId: string) => {
    onHostsChange(
      hosts.map((h) => (h.id === hostId ? { ...h, enabled: !h.enabled } : h))
    );
  };

  const getHealthClass = (hostId: string) => {
    const status = hostStatuses.get(hostId);
    if (!status) return styles.unknown;
    return status.isHealthy ? styles.healthy : styles.unhealthy;
  };

  const getStatusInfo = (hostId: string) => {
    const status = hostStatuses.get(hostId);
    if (!status) return { containers: '-', version: 'Checking...' };
    if (status.lastError) return { containers: '-', version: status.lastError };
    return {
      containers: `${status.containerCount} containers`,
      version: status.agentVersion ? `v${status.agentVersion}` : '',
    };
  };

  return (
    <div className={styles.container}>
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.hostList}>
        {hosts.length === 0 && (
          <div className={styles.emptyState}>
            No agents configured. Add a Docker Metrics Agent to get started.
          </div>
        )}

        {hosts.map((host) => {
          const statusInfo = getStatusInfo(host.id);
          return (
            <div key={host.id} className={styles.hostItem}>
              <div className={`${styles.healthIndicator} ${getHealthClass(host.id)}`} />
              <div className={styles.hostInfo}>
                <div className={styles.hostName}>
                  {host.name}
                  {!host.enabled && ' (disabled)'}
                </div>
                <div className={styles.hostUrl}>{host.url}</div>
              </div>
              <div className={styles.hostMeta}>
                <div>{statusInfo.containers}</div>
                <div className={styles.hostVersion}>{statusInfo.version}</div>
              </div>
              <input
                type="checkbox"
                className={styles.enabledToggle}
                checked={host.enabled}
                onChange={() => toggleHost(host.id)}
                title={host.enabled ? 'Disable host' : 'Enable host'}
              />
              <button
                className={styles.removeButton}
                onClick={() => removeHost(host.id)}
                title="Remove host"
              >
                ×
              </button>
            </div>
          );
        })}
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
            placeholder="Agent URL (e.g., http://192.168.1.10:5000)"
            value={newHostUrl}
            onChange={(e) => setNewHostUrl(e.target.value)}
          />
          <div className={styles.buttonRow}>
            <button
              className={styles.addButton}
              onClick={addHost}
              disabled={!newHostName.trim() || !newHostUrl.trim()}
            >
              Add Agent
            </button>
            <button
              className={styles.cancelButton}
              onClick={() => {
                setShowAddForm(false);
                setNewHostName('');
                setNewHostUrl('');
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className={styles.showFormButton} onClick={() => setShowAddForm(true)}>
          + Add Docker Metrics Agent
        </button>
      )}
    </div>
  );
};
