import { Alert, Space } from 'antd';
import type { Conflict } from '@air/domain';

/** Список конфликтов планирования: критичные — красным, предупреждения — жёлтым. */
export function IssuesList({ conflicts, title }: { conflicts: Conflict[]; title?: string }) {
  if (conflicts.length === 0) return null;
  const sorted = [...conflicts].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1));
  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      {title && <strong>{title}</strong>}
      {sorted.map((c) => (
        <Alert key={c.id} type={c.severity === 'critical' ? 'error' : 'warning'} showIcon title={c.message} />
      ))}
    </Space>
  );
}
