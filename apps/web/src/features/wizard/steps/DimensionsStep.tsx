import { useState } from 'react';
import { Alert, Checkbox, Col, Flex, Input, Row, Select, Typography } from 'antd';
import { createRoomFinishes, roomNetAreaM2, type RoomKind } from '@air/domain';
import { PlanCanvas } from '../../plan/PlanCanvas';
import { PlanLegend } from '../../plan/PlanLegend';
import { PlanRecognizer } from '../../plan/PlanRecognizer';
import { ROOM_KIND_LABELS } from '../../../labels';
import { useProjects } from '../../../store/projectsStore';
import { useDraft } from '../useDraft';

const KIND_OPTIONS = (Object.keys(ROOM_KIND_LABELS) as RoomKind[]).map((k) => ({ value: k, label: ROOM_KIND_LABELS[k] }));

export function DimensionsStep() {
  const { draft, update } = useDraft();
  const previewUrl = useProjects((s) => s.planPreviewUrl);
  const isDemo = draft.geometry.source === 'demo';
  const rec = draft.plan.recognition;
  const [notes, setNotes] = useState('');
  const canRerun = Boolean(draft.plan.fileName) || (draft.plan.description?.trim().length ?? 0) >= 20;
  const fileMode = Boolean(draft.plan.fileName) && draft.plan.source !== 'manual';

  return (
    <>
      {isDemo && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          title="Это демо-план, а не ваша квартира"
          description={
            canRerun ? (
              <Flex vertical gap={8}>
                <span>Постройте план по вашему {fileMode ? 'файлу' : 'описанию'} — тогда здесь будет ваша квартира.</span>
                <PlanRecognizer mode={fileMode ? 'file' : 'text'} label={fileMode ? 'Распознать мой план' : 'Построить план'} />
              </Flex>
            ) : (
              'Загрузите план или опишите квартиру словами на шаге «План» — тогда здесь будет ваша квартира.'
            )
          }
        />
      )}
      {!isDemo && rec && (rec.uncertain.length > 0 || rec.issues.length > 0) && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          title="Сверьте с оригиналом — здесь ИИ не уверен"
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {[...rec.uncertain, ...rec.issues].map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          }
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

      {!isDemo && (
        <div style={{ marginTop: 16 }}>
          <Typography.Title level={5} style={{ marginTop: 0 }}>Помещения</Typography.Title>
          <Flex vertical gap={8}>
            {draft.geometry.rooms.map((room, i) => (
              <Flex key={room.id} gap={8} align="center" wrap>
                <Input
                  style={{ width: 200 }}
                  value={room.name}
                  aria-label="Название помещения"
                  onChange={(e) => update((d) => void (d.geometry.rooms[i]!.name = e.target.value))}
                />
                <Select
                  style={{ width: 150 }}
                  value={room.kind}
                  options={KIND_OPTIONS}
                  aria-label="Тип помещения"
                  onChange={(kind) =>
                    update((d) => {
                      d.geometry.rooms[i]!.kind = kind;
                      // Отделка зависит от типа комнаты (санузел — плитка и сантехника)
                      d.finishes.rooms[room.id] = createRoomFinishes(kind);
                    })
                  }
                />
                <Typography.Text type="secondary">{roomNetAreaM2(room.polygon).toFixed(1)} м²</Typography.Text>
              </Flex>
            ))}
          </Flex>

          {canRerun && (
            <div style={{ marginTop: 16 }}>
              <Typography.Title level={5}>Что-то распознано неверно?</Typography.Title>
              <Input.TextArea
                rows={3}
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Например: ширина кухни 3,40, а не 3,04; между коридором и спальней есть дверь; кладовая — это гардеробная без двери"
              />
              <div style={{ marginTop: 8 }}>
                <PlanRecognizer
                  mode={fileMode ? 'file' : 'text'}
                  notes={notes}
                  label="Исправить по уточнениям"
                  secondary
                />
              </div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                План распознаётся заново с вашими уточнениями. Отмеченные стены и инженерные точки при этом сбрасываются.
              </Typography.Text>
            </div>
          )}
        </div>
      )}

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
