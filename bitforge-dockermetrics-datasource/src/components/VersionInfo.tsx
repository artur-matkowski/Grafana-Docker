import React from 'react';
import { css } from '@emotion/css';
import { PLUGIN_VERSION } from '../version';

const styles = {
  container: css`
    padding: 8px 0;
    margin-bottom: 8px;
  `,
  title: css`
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 4px;
    color: #3274d9;
  `,
  version: css`
    font-size: 12px;
    color: #888;
  `,
  link: css`
    font-size: 11px;
    color: #3274d9;
    text-decoration: none;
    &:hover {
      text-decoration: underline;
    }
  `,
};

export const VersionInfo: React.FC = () => {
  return (
    <div className={styles.container}>
      <div className={styles.title}>Docker Metrics Data Source</div>
      <div className={styles.version}>Version {PLUGIN_VERSION}</div>
      <a
        className={styles.link}
        href="https://github.com/artur-matkowski/Grafana-Docker/releases"
        target="_blank"
        rel="noopener noreferrer"
      >
        View releases
      </a>
    </div>
  );
};
