import { Space, Typography } from 'antd';
import type { WallStatus } from '@air/domain';
import { WALL_STATUS_COLORS, WALL_STATUS_LABELS } from '../../labels';

const STATUSES: WallStatus[] = ['load_bearing', 'partition', 'unknown'];

/** Легенда цветов стен — показывается под каждым планом. */
export function PlanLegend({ counts }: { counts?: Partial<Record<WallStatus, number>> }) {
  return (
    <Space wrap size="middle" style={{ marginTop: 6 }}>
      {STATUSES.map((s) => (
        <Typography.Text key={s} style={{ fontSize: 12 }}>
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 22,
              height: 0,
              borderTop: `5px ${s === 'unknown' ? 'dashed' : 'solid'} ${WALL_STATUS_COLORS[s]}`,
              verticalAlign: 'middle',
              marginRight: 6,
            }}
          />
          {WALL_STATUS_LABELS[s]}
          {counts?.[s] !== undefined && `: ${counts[s]}`}
        </Typography.Text>
      ))}
    </Space>
  );
}
