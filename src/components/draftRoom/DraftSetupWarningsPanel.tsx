import type { League } from '@/types';
import type { DraftRoomConfig } from '@/types/draft';
import { draftSetupWarnings } from '@/utils/draftSetupWarnings';
import styles from './DraftSetupWarningsPanel.module.css';

interface DraftSetupWarningsPanelProps {
  league: League;
  config: DraftRoomConfig;
  showClean?: boolean;
}

export function DraftSetupWarningsPanel({
  league,
  config,
  showClean = false,
}: DraftSetupWarningsPanelProps) {
  const warnings = draftSetupWarnings(league, config);

  if (warnings.length === 0) {
    return showClean ? (
      <div className={styles.ok} role="status">
        Setup sanity check passed.
      </div>
    ) : null;
  }

  return (
    <section className={styles.panel} role="alert" aria-label="Draft setup warnings">
      <div className={styles.header}>
        <span className={styles.title}>Setup sanity check</span>
        <span className={styles.count}>
          {warnings.length} warning{warnings.length === 1 ? '' : 's'}
        </span>
      </div>
      <ul className={styles.list}>
        {warnings.map(warning => (
          <li key={warning.code} className={styles.item}>
            <span className={styles.itemTitle}>{warning.title}</span>
            <p className={styles.message}>{warning.message}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
