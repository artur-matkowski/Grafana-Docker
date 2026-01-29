import React, { useState, useCallback } from 'react';
import { css } from '@emotion/css';
import { IconButton, Modal, Button, HorizontalGroup, Spinner } from '@grafana/ui';
import { ControlAction, ContainerState, ALL_CONTROL_ACTIONS } from '../types';

interface ContainerControlsProps {
  containerId: string;
  containerName: string;
  hostId: string;
  state: ContainerState;
  allowedActions: ControlAction[];
  confirmDangerousActions: boolean;
  onAction: (action: ControlAction, containerId: string, hostId: string) => Promise<void>;
  loading?: boolean;
}

const styles = {
  controls: css`
    display: flex;
    gap: 2px;
    margin-left: 8px;
    flex-shrink: 0;
  `,
  controlButton: css`
    width: 24px;
    height: 24px;
    padding: 0;

    & svg {
      width: 14px;
      height: 14px;
    }
  `,
  modalContent: css`
    padding: 16px 0;
  `,
  warningText: css`
    color: #ff9830;
    margin-bottom: 16px;
  `,
};

const dangerousActions: ControlAction[] = ['stop', 'restart'];

interface ActionConfig {
  icon: string;
  tooltip: string;
  showWhen: (state: ContainerState) => boolean;
  variant?: 'default' | 'destructive' | 'primary' | 'secondary';
}

const actionConfigs: Record<ControlAction, ActionConfig> = {
  start: {
    icon: 'play',
    tooltip: 'Start container',
    showWhen: (state) => state === 'exited' || state === 'created' || state === 'dead',
    variant: 'primary',
  },
  stop: {
    icon: 'square-shape',
    tooltip: 'Stop container',
    showWhen: (state) => state === 'running' || state === 'paused',
    variant: 'destructive',
  },
  restart: {
    icon: 'sync',
    tooltip: 'Restart container',
    showWhen: (state) => state === 'running' || state === 'paused' || state === 'exited',
    variant: 'secondary',
  },
  pause: {
    icon: 'pause',
    tooltip: 'Pause container',
    showWhen: (state) => state === 'running',
    variant: 'secondary',
  },
  unpause: {
    icon: 'play',
    tooltip: 'Unpause container',
    showWhen: (state) => state === 'paused',
    variant: 'primary',
  },
};

export const ContainerControls: React.FC<ContainerControlsProps> = ({
  containerId,
  containerName,
  hostId,
  state,
  allowedActions,
  confirmDangerousActions,
  onAction,
  loading = false,
}) => {
  const [confirmAction, setConfirmAction] = useState<ControlAction | null>(null);
  const [executing, setExecuting] = useState(false);

  const handleAction = useCallback(
    async (action: ControlAction) => {
      if (confirmDangerousActions && dangerousActions.includes(action)) {
        setConfirmAction(action);
        return;
      }

      setExecuting(true);
      try {
        await onAction(action, containerId, hostId);
      } finally {
        setExecuting(false);
      }
    },
    [confirmDangerousActions, onAction, containerId, hostId]
  );

  const handleConfirm = useCallback(async () => {
    if (!confirmAction) {
      return;
    }

    setExecuting(true);
    try {
      await onAction(confirmAction, containerId, hostId);
    } finally {
      setExecuting(false);
      setConfirmAction(null);
    }
  }, [confirmAction, onAction, containerId, hostId]);

  const handleCancel = useCallback(() => {
    setConfirmAction(null);
  }, []);

  // Filter actions based on allowed list and container state
  const visibleActions = ALL_CONTROL_ACTIONS.filter((action) => {
    if (!allowedActions.includes(action)) {
      return false;
    }
    const config = actionConfigs[action];
    return config.showWhen(state);
  });

  if (visibleActions.length === 0) {
    return null;
  }

  const isLoading = loading || executing;

  return (
    <>
      <div className={styles.controls}>
        {isLoading ? (
          <Spinner size="sm" />
        ) : (
          visibleActions.map((action) => {
            const config = actionConfigs[action];
            return (
              <IconButton
                key={action}
                name={config.icon as any}
                tooltip={config.tooltip}
                onClick={() => handleAction(action)}
                className={styles.controlButton}
                variant={config.variant}
                size="sm"
              />
            );
          })
        )}
      </div>

      {confirmAction && (
        <Modal
          title={`Confirm ${confirmAction}`}
          isOpen={true}
          onDismiss={handleCancel}
        >
          <div className={styles.modalContent}>
            <p className={styles.warningText}>
              Are you sure you want to {confirmAction} container &quot;{containerName}&quot;?
            </p>
            {confirmAction === 'stop' && (
              <p>This will stop the container and any running processes inside it.</p>
            )}
            {confirmAction === 'restart' && (
              <p>This will stop and restart the container, which may briefly interrupt services.</p>
            )}
          </div>
          <HorizontalGroup justify="flex-end">
            <Button variant="secondary" onClick={handleCancel} disabled={executing}>
              Cancel
            </Button>
            <Button
              variant={confirmAction === 'stop' ? 'destructive' : 'primary'}
              onClick={handleConfirm}
              disabled={executing}
            >
              {executing ? <Spinner inline={true} /> : `Yes, ${confirmAction}`}
            </Button>
          </HorizontalGroup>
        </Modal>
      )}
    </>
  );
};
