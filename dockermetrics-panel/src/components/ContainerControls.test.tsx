import '@testing-library/jest-dom';

import { ContainerAction, PendingAction, PENDING_ACTION_LABELS } from '../types';

describe('PendingAction types', () => {
  it('should have correct pending action labels', () => {
    expect(PENDING_ACTION_LABELS.pause).toBe('Pausing...');
    expect(PENDING_ACTION_LABELS.unpause).toBe('Resuming...');
    expect(PENDING_ACTION_LABELS.start).toBe('Starting...');
    expect(PENDING_ACTION_LABELS.stop).toBe('Stopping...');
    expect(PENDING_ACTION_LABELS.restart).toBe('Restarting...');
  });

  it('should create valid PendingAction objects', () => {
    const pendingAction: PendingAction = {
      action: 'pause',
      startTime: Date.now(),
    };
    expect(pendingAction.action).toBe('pause');
    expect(typeof pendingAction.startTime).toBe('number');
  });
});

describe('Pending action state management', () => {
  // Helper to determine status display based on actual status and pending action
  function getStatusDisplay(
    isRunning: boolean,
    isPaused: boolean,
    pendingAction: PendingAction | null
  ): { label: string; color: string } {
    // If there's a pending action, show pending state
    if (pendingAction) {
      return {
        label: `⏳ ${PENDING_ACTION_LABELS[pendingAction.action]}`,
        color: '#FF9830', // amber for pending
      };
    }

    // Otherwise show actual state
    if (isPaused) {
      return { label: '● Paused', color: '#FF9830' };
    }
    if (isRunning) {
      return { label: '● Running', color: '#73BF69' };
    }
    return { label: '● Stopped', color: '#FF5555' };
  }

  it('should show running status when no pending action', () => {
    const status = getStatusDisplay(true, false, null);
    expect(status.label).toBe('● Running');
    expect(status.color).toBe('#73BF69');
  });

  it('should show paused status when no pending action', () => {
    const status = getStatusDisplay(true, true, null);
    expect(status.label).toBe('● Paused');
    expect(status.color).toBe('#FF9830');
  });

  it('should show stopped status when no pending action', () => {
    const status = getStatusDisplay(false, false, null);
    expect(status.label).toBe('● Stopped');
    expect(status.color).toBe('#FF5555');
  });

  it('should show pending pause status regardless of actual state', () => {
    const pendingAction: PendingAction = { action: 'pause', startTime: Date.now() };

    // Even if actual state is running, should show "Pausing..."
    const status = getStatusDisplay(true, false, pendingAction);
    expect(status.label).toBe('⏳ Pausing...');
    expect(status.color).toBe('#FF9830');
  });

  it('should show pending start status regardless of actual state', () => {
    const pendingAction: PendingAction = { action: 'start', startTime: Date.now() };

    // Even if actual state is stopped, should show "Starting..."
    const status = getStatusDisplay(false, false, pendingAction);
    expect(status.label).toBe('⏳ Starting...');
    expect(status.color).toBe('#FF9830');
  });

  it('should show pending stop status regardless of actual state', () => {
    const pendingAction: PendingAction = { action: 'stop', startTime: Date.now() };

    // Even if actual state is running, should show "Stopping..."
    const status = getStatusDisplay(true, false, pendingAction);
    expect(status.label).toBe('⏳ Stopping...');
    expect(status.color).toBe('#FF9830');
  });

  it('should show pending unpause status regardless of actual state', () => {
    const pendingAction: PendingAction = { action: 'unpause', startTime: Date.now() };

    // Even if actual state is paused, should show "Resuming..."
    const status = getStatusDisplay(true, true, pendingAction);
    expect(status.label).toBe('⏳ Resuming...');
    expect(status.color).toBe('#FF9830');
  });

  it('should show pending restart status regardless of actual state', () => {
    const pendingAction: PendingAction = { action: 'restart', startTime: Date.now() };

    const status = getStatusDisplay(true, false, pendingAction);
    expect(status.label).toBe('⏳ Restarting...');
    expect(status.color).toBe('#FF9830');
  });
});

describe('Pending action timeout', () => {
  const PENDING_ACTION_TIMEOUT_MS = 15000;

  function isPendingActionExpired(pendingAction: PendingAction): boolean {
    return Date.now() - pendingAction.startTime > PENDING_ACTION_TIMEOUT_MS;
  }

  it('should not be expired immediately after creation', () => {
    const pendingAction: PendingAction = { action: 'pause', startTime: Date.now() };
    expect(isPendingActionExpired(pendingAction)).toBe(false);
  });

  it('should be expired after timeout', () => {
    const pendingAction: PendingAction = {
      action: 'pause',
      startTime: Date.now() - PENDING_ACTION_TIMEOUT_MS - 1
    };
    expect(isPendingActionExpired(pendingAction)).toBe(true);
  });

  it('should not be expired just before timeout', () => {
    const pendingAction: PendingAction = {
      action: 'pause',
      startTime: Date.now() - PENDING_ACTION_TIMEOUT_MS + 1000
    };
    expect(isPendingActionExpired(pendingAction)).toBe(false);
  });
});

describe('Expected state matching', () => {
  // Helper to check if actual status matches expected state for an action
  function doesStatusMatchExpected(
    action: ContainerAction,
    isRunning: boolean,
    isPaused: boolean
  ): boolean {
    switch (action) {
      case 'start':
        return isRunning && !isPaused;
      case 'stop':
        return !isRunning && !isPaused;
      case 'restart':
        return isRunning && !isPaused;
      case 'pause':
        return isRunning && isPaused;
      case 'unpause':
        return isRunning && !isPaused;
      default:
        return false;
    }
  }

  it('should match for completed pause action', () => {
    expect(doesStatusMatchExpected('pause', true, true)).toBe(true);
    expect(doesStatusMatchExpected('pause', true, false)).toBe(false);
    expect(doesStatusMatchExpected('pause', false, false)).toBe(false);
  });

  it('should match for completed unpause action', () => {
    expect(doesStatusMatchExpected('unpause', true, false)).toBe(true);
    expect(doesStatusMatchExpected('unpause', true, true)).toBe(false);
  });

  it('should match for completed start action', () => {
    expect(doesStatusMatchExpected('start', true, false)).toBe(true);
    expect(doesStatusMatchExpected('start', false, false)).toBe(false);
  });

  it('should match for completed stop action', () => {
    expect(doesStatusMatchExpected('stop', false, false)).toBe(true);
    expect(doesStatusMatchExpected('stop', true, false)).toBe(false);
  });

  it('should match for completed restart action', () => {
    expect(doesStatusMatchExpected('restart', true, false)).toBe(true);
    expect(doesStatusMatchExpected('restart', false, false)).toBe(false);
  });
});
