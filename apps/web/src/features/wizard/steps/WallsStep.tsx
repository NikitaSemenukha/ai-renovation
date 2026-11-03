import { useState } from 'react';
import { Alert, App, Button, Card, Col, Descriptions, Row, Segmented, Select, Space, Typography } from 'antd';
import {
  contradictsSuggestion,
  setWallStatus,
  suggestWallStatus,
  type Wall,
  type WallStatus,
  type WallStatusSource,
} from '@air/domain';
import { PlanCanvas } from '../../plan/PlanCanvas';
import { PlanLegend } from '../../plan/PlanLegend';
import { WALL_SOURCE_LABELS, WALL_STATUS_COLORS, WALL_STATUS_LABELS } from '../../../labels';
import { useDraft } from '../useDraft';

const STATUSES: WallStatus[] = ['load_bearing', 'partition', 'unknown'];
const MANUAL_SOURCES: WallStatusSource[] = ['document', 'owner_knowledge', 'guess'];
type Brush = WallStatus | 'view';

export function WallsStep() {
  const { draft, update } = useDraft();
  const { message, modal } = App.useApp();
  // По умолчанию «Просмотр»: случайный клик не должен менять статус стены
  const [brush, setBrush] = useState<Brush>('view');
  const [source, setSource] = useState<WallStatusSource>('owner_knowledge');
  const [selectedId, setSelectedId] = useState<string>();

  const walls = draft.geometry.walls;
  const buildingType = draft.property.buildingType ?? 'unknown';
  const selected = walls.find((w) => w.id === selectedId);

  const apply = (wall: Wall, status: WallStatus) =>
    update((d) => {
      d.geometry.walls = setWallStatus(d.geometry.walls, wall.id, status, source);
      d.wallsReviewed = true;
    });

  const tryApply = (wall: Wall, status: WallStatus) => {
    if (wall.status === status) return;
    if (wall.isExterior && status !== 'load_bearing') {
      message.warning('Наружная стена всегда считается несущей');
      return;
    }
    const conflict = contradictsSuggestion(wall, status, buildingType);
    if (!conflict) {
      apply(wall, status);
      return;
    }
    modal.confirm({
      title: `Отметить как «${WALL_STATUS_LABELS[status]}»?`,
      content: (
        <>
          <p>Система считает иначе: {conflict.reason.toLowerCase()}.</p>
          {status === 'partition' && (
            <p>
              Если стена окажется несущей, её снос опасен и незаконен. Отмечайте «Перегородка» только если это
              подтверждено документом или специалистом.
            </p>
          )}
          <p>Источник: «{WALL_SOURCE_LABELS[source]}».</p>
        </>
      ),
      okText: 'Да, отметить',
      cancelText: 'Отмена',
      onOk: () => apply(wall, status),
    });
  };

  const onWallClick = (wall: Wall) => {
    setSelectedId(wall.id);
    if (brush !== 'view') tryApply(wall, brush);
  };

  const acceptSuggestions = () =>
    update((d) => {
      for (const w of d.geometry.walls) {
        if (w.status !== 'unknown') continue;
        const s = suggestWallStatus(w, buildingType);
        if (s) d.geometry.walls = setWallStatus(d.geometry.walls, w.id, s.status, 'guess');
      }
      d.wallsReviewed = true;
    });

  const counts = Object.fromEntries(STATUSES.map((s) => [s, walls.filter((w) => w.status === s).length]));
  const suggestion = selected ? suggestWallStatus(selected, buildingType) : null;

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title="Если не уверены — оставьте стену серой («неизвестно»)"
        description="В основных вариантах AI серые стены не трогает. Варианты «если стена окажется перегородкой» покажем отдельно и с пометкой, что нужна проверка инженера."
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={15}>
          <Space wrap style={{ marginBottom: 8 }}>
            <Typography.Text>Режим:</Typography.Text>
            <Segmented<Brush>
              value={brush}
              onChange={setBrush}
              options={[
                { value: 'view', label: 'Просмотр' },
                ...STATUSES.map((s) => ({
                  value: s,
                  label: <span style={{ color: WALL_STATUS_COLORS[s] }}>■ {WALL_STATUS_LABELS[s]}</span>,
                })),
              ]}
            />
            {brush !== 'view' && brush !== 'unknown' && (
              <Select<WallStatusSource>
                aria-label="Источник статуса"
                value={source}
                onChange={setSource}
                style={{ width: 160 }}
                options={MANUAL_SOURCES.map((s) => ({ value: s, label: WALL_SOURCE_LABELS[s] }))}
              />
            )}
          </Space>
          <PlanCanvas geometry={draft.geometry} selectedWallId={selectedId} onWallClick={onWallClick} />
          <PlanLegend counts={counts} />
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Демо-план. {brush === 'view' ? 'Нажмите на стену, чтобы посмотреть её и изменить статус.' : 'Нажимайте на стены — к ним применится выбранный режим.'}
            </Typography.Text>
          </div>
        </Col>
        <Col xs={24} lg={9}>
          <Space orientation="vertical" style={{ width: '100%' }}>
            <Card size="small" title={selected ? 'Выбранная стена' : 'Нажмите на стену'}>
              {selected ? (
                <>
                  <Descriptions
                    size="small"
                    column={1}
                    items={[
                      { key: 't', label: 'Толщина', children: `${selected.thicknessMm} мм` },
                      { key: 's', label: 'Статус', children: WALL_STATUS_LABELS[selected.status] },
                      {
                        key: 'src',
                        label: 'Источник',
                        children: selected.statusSource ? WALL_SOURCE_LABELS[selected.statusSource] : '—',
                      },
                    ]}
                  />
                  {suggestion && (
                    <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                      Подсказка: {suggestion.reason}
                    </Typography.Paragraph>
                  )}
                  {!selected.isExterior && (
                    <Space wrap>
                      {STATUSES.map((s) => (
                        <Button key={s} size="small" disabled={selected.status === s} onClick={() => tryApply(selected, s)}>
                          {WALL_STATUS_LABELS[s]}
                        </Button>
                      ))}
                    </Space>
                  )}
                </>
              ) : (
                <Typography.Text type="secondary">Здесь появятся толщина, подсказка системы и источник статуса.</Typography.Text>
              )}
            </Card>

            <Button block onClick={acceptSuggestions}>
              Принять подсказки системы (как «догадка»)
            </Button>
            <Button block onClick={() => update((d) => void (d.wallsReviewed = true))}>
              Не знаю ни одной — оставить серыми
            </Button>
            <Button block type="dashed" disabled title="Появится вместе с партнёрами-инженерами">
              Проверить стены у инженера (скоро)
            </Button>
          </Space>
        </Col>
      </Row>
    </>
  );
}
