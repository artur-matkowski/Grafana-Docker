import React from 'react';
import { css } from '@emotion/css';
import { AVAILABLE_METRICS } from '../types';

interface MetricSelectorProps {
  selectedMetrics: string[];
  onChange: (metrics: string[]) => void;
}

const styles = {
  container: css`
    padding: 8px 0;
  `,
  header: css`
    font-size: 11px;
    color: #888;
    margin-bottom: 8px;
  `,
  metricList: css`
    display: flex;
    flex-direction: column;
    gap: 4px;
  `,
  metricItem: css`
    display: flex;
    align-items: center;
    padding: 6px 8px;
    cursor: pointer;
    border-radius: 4px;
    &:hover {
      background: rgba(255, 255, 255, 0.05);
    }
  `,
  metricItemSelected: css`
    background: rgba(50, 116, 217, 0.2);
    &:hover {
      background: rgba(50, 116, 217, 0.3);
    }
  `,
  checkbox: css`
    margin-right: 8px;
    width: 14px;
    height: 14px;
    cursor: pointer;
  `,
  colorDot: css`
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-right: 8px;
  `,
  metricLabel: css`
    flex: 1;
    font-size: 12px;
  `,
  metricUnit: css`
    font-size: 10px;
    color: #888;
    margin-left: 8px;
  `,
  actions: css`
    display: flex;
    gap: 12px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  `,
  actionLink: css`
    font-size: 11px;
    color: #3274d9;
    cursor: pointer;
    &:hover {
      text-decoration: underline;
    }
  `,
  selectedCount: css`
    font-size: 11px;
    color: #888;
    margin-left: auto;
  `,
};

export const MetricSelector: React.FC<MetricSelectorProps> = ({ selectedMetrics, onChange }) => {
  const toggleMetric = (key: string) => {
    if (selectedMetrics.includes(key)) {
      onChange(selectedMetrics.filter((k) => k !== key));
    } else {
      onChange([...selectedMetrics, key]);
    }
  };

  const selectAll = () => {
    onChange(AVAILABLE_METRICS.map((m) => m.key));
  };

  const selectNone = () => {
    onChange([]);
  };

  const selectDefaults = () => {
    onChange(['cpuPercent', 'memoryBytes']);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        Select metrics to display for each container
      </div>

      <div className={styles.metricList}>
        {AVAILABLE_METRICS.map((metric) => {
          const isSelected = selectedMetrics.includes(metric.key);
          return (
            <div
              key={metric.key}
              className={`${styles.metricItem} ${isSelected ? styles.metricItemSelected : ''}`}
              onClick={() => toggleMetric(metric.key)}
            >
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={isSelected}
                onChange={() => toggleMetric(metric.key)}
                onClick={(e) => e.stopPropagation()}
              />
              <span className={styles.colorDot} style={{ background: metric.color }} />
              <span className={styles.metricLabel}>{metric.label}</span>
              <span className={styles.metricUnit}>{metric.unit}</span>
            </div>
          );
        })}
      </div>

      <div className={styles.actions}>
        <span className={styles.actionLink} onClick={selectAll}>
          Select all
        </span>
        <span className={styles.actionLink} onClick={selectNone}>
          Clear
        </span>
        <span className={styles.actionLink} onClick={selectDefaults}>
          Defaults
        </span>
        <span className={styles.selectedCount}>
          {selectedMetrics.length} selected
        </span>
      </div>
    </div>
  );
};
