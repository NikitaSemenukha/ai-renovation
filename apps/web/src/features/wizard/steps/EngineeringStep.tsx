import { useState } from 'react';
import { Alert, Button, Col, Row, Segmented, Space, Typography } from 'antd';
import { findConflicts, type EngineeringPointType } from '@air/domain';
import { IssuesList } from '../../../components/IssuesList';
import { PlanCanvas } from '../../plan/PlanCanvas';
import { ENGINEERING_LABELS } from '../../../labels';
import { useDraft } from '../useDraft';

const TYPES = Object.keys(ENGINEERING_LABELS) as EngineeringPointType[];

export function EngineeringStep() {
  const { draft, update } = useDraft();
  const [tool, setTool] = useState<EngineeringPointType>('riser');
  const conflicts = findConflicts(draft).filter((c) => c.step === 'engineering');

  return (
    <Row gutter={16}>
      <Col xs={24} lg={15}>
        <Space wrap style={{ marginBottom: 8 }}>
          <Typography.Text>Что ставим:</Typography.Text>
          <Segmented<EngineeringPointType>
            value={tool}
            onChange={setTool}
            options={TYPES.map((t) => ({
              value: t,
              label: <span style={{ color: ENGINEERING_LABELS[t].color }}>● {ENGINEERING_LABELS[t].title}</span>,
            }))}
          />
        </Space>
        <PlanCanvas
          geometry={draft.geometry}
          engineering={draft.engineering}
          onCanvasClick={(position) =>
            update((d) => {
              d.engineering.push({ id: crypto.randomUUID(), type: tool, position });
              d.engineeringReviewed = true;
            })
          }
          onPointClick={(p) => update((d) => void (d.engineering = d.engineering.filter((x) => x.id !== p.id)))}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Нажмите на план, чтобы поставить точку. Нажмите на точку, чтобы удалить.
        </Typography.Text>
        <div style={{ marginTop: 12 }}>
          <IssuesList conflicts={conflicts} />
        </div>
      </Col>
      <Col xs={24} lg={9}>
        <Alert
          type="warning"
          showIcon
          title="Почему это важно"
          description={
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              <li>Стояки и вентканалы — общее имущество дома, их нельзя переносить или демонтировать.</li>
              <li>Кухню с газом обычно нельзя открыто объединять с жилой комнатой.</li>
              <li>Мокрые зоны обычно нельзя размещать над жилыми комнатами соседей снизу.</li>
              <li>Точные правила зависят от страны — уточняются для рынка запуска.</li>
            </ul>
          }
        />
        <Button block style={{ marginTop: 12 }} onClick={() => update((d) => void (d.engineeringReviewed = true))}>
          Не знаю, где точки
        </Button>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
          Тогда система будет считать санузел и кухню непереносимыми зонами.
        </Typography.Paragraph>
      </Col>
    </Row>
  );
}
