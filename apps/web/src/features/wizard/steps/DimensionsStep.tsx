import { Alert, Checkbox, Col, Row, Typography } from 'antd';
import { PlanCanvas } from '../../plan/PlanCanvas';
import { PlanLegend } from '../../plan/PlanLegend';
import { useProjects } from '../../../store/projectsStore';
import { useDraft } from '../useDraft';

export function DimensionsStep() {
  const { draft, update } = useDraft();
  const previewUrl = useProjects((s) => s.planPreviewUrl);
  const isDemo = draft.geometry.source === 'demo';

  return (
    <>
      {isDemo && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          title="Это демо-план, а не ваша квартира"
          description="Распознавание вашего файла ещё не подключено. Когда оно появится, здесь будет ваш план с подсветкой спорных размеров («3.40 или 3.04 м?»), и вы сможете их исправить."
        />
      )}
      <Row gutter={16}>
        {previewUrl && (
          <Col xs={24} md={12}>
            <Typography.Text type="secondary">Ваш файл</Typography.Text>
            <img src={previewUrl} alt="Загруженный план" style={{ width: '100%', borderRadius: 8, marginTop: 4 }} />
          </Col>
        )}
        <Col xs={24} md={previewUrl ? 12 : 24}>
          <Typography.Text type="secondary">{isDemo ? 'Демо-план' : 'Распознанный план'}</Typography.Text>
          <div style={{ maxWidth: 720, marginTop: 4 }}>
            <PlanCanvas geometry={draft.geometry} showDimensions />
            <PlanLegend />
          </div>
        </Col>
      </Row>
      <Checkbox
        style={{ marginTop: 16 }}
        checked={draft.plan.dimensionsConfirmed}
        onChange={(e) => update((d) => void (d.plan.dimensionsConfirmed = e.target.checked))}
      >
        {isDemo
          ? 'Понимаю, что дальше используется демо-план, а не план моей квартиры'
          : 'Я проверил: стены и размеры совпадают с моей квартирой'}
      </Checkbox>
      <div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {isDemo
            ? '→ подтверждение демо-плана не повышает полноту данных'
            : '→ без подтверждения дальше нельзя: план — источник истины для 2D, 3D и сметы'}
        </Typography.Text>
      </div>
    </>
  );
}
