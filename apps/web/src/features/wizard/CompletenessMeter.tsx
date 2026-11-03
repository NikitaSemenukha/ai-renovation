import { CheckCircleFilled, MinusCircleOutlined, WarningFilled } from '@ant-design/icons';
import { Popover, Progress, Space, Typography } from 'antd';
import {
  CONTRADICTION_PENALTY,
  completenessBreakdown,
  completenessPercent,
  contradictionCount,
  type ProjectDraft,
} from '@air/domain';

/**
 * «Полнота данных» — сколько надёжной информации собрано.
 * Это не точность результата: демо-план не засчитывается, противоречия снижают оценку.
 */
export function CompletenessMeter({ draft }: { draft: ProjectDraft }) {
  const percent = completenessPercent(draft);
  const items = completenessBreakdown(draft);
  const contradictions = contradictionCount(draft);

  const content = (
    <Space orientation="vertical" size={4} style={{ minWidth: 280 }}>
      {items.map((i) => (
        <Space key={i.label} style={{ justifyContent: 'space-between', width: '100%' }}>
          <span>
            {i.done ? <CheckCircleFilled style={{ color: '#52c41a' }} /> : <MinusCircleOutlined style={{ color: '#bfbfbf' }} />}{' '}
            {i.label}
          </span>
          <Typography.Text type="secondary">+{i.weight}%</Typography.Text>
        </Space>
      ))}
      {contradictions > 0 && (
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <span>
            <WarningFilled style={{ color: '#ff4d4f' }} /> Противоречия: {contradictions}
          </span>
          <Typography.Text type="danger">−{contradictions * CONTRADICTION_PENALTY}%</Typography.Text>
        </Space>
      )}
      {draft.geometry.source === 'demo' && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Демо-план не засчитывается как ваша геометрия.
        </Typography.Text>
      )}
    </Space>
  );

  return (
    <Popover content={content} title="Полнота данных проекта" placement="bottomRight" trigger={['hover', 'click']}>
      <button
        type="button"
        style={{ minWidth: 200, cursor: 'help', background: 'none', border: 0, padding: 0, textAlign: 'left' }}
        aria-label={`Полнота данных ${percent}%. Подробнее`}
      >
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Полнота данных: {percent}%
        </Typography.Text>
        <Progress percent={percent} showInfo={false} size="small" status={contradictions > 0 ? 'exception' : 'normal'} />
      </button>
    </Popover>
  );
}
