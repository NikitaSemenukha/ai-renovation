import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { BulbOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Empty, Flex, List, Segmented, Space, Spin, Switch, Tag, Typography } from 'antd';
import { briefHash, buildRoomBrief, isRoomFinished, type Project } from '@air/domain';
import { useProjects } from '../../store/projectsStore';
import { DesignRequestError, fetchAiStatus, requestRoomDesign, type AiStatus } from './api';

// three.js тяжёлый — грузим его только когда есть что показать
const RoomScene3D = lazy(() => import('./RoomScene3D'));

const CUTAWAY_MM = 1200;

export function DesignPanel({ project, onEdit }: { project: Project; onEdit: () => void }) {
  const { message } = App.useApp();
  const addRoomDesign = useProjects((s) => s.addRoomDesign);
  const d = project.data;
  const rooms = d.geometry.rooms;
  const [roomId, setRoomId] = useState(rooms[0]?.id);
  const [variant, setVariant] = useState(0);
  const [fullWalls, setFullWalls] = useState(false);
  const [ai, setAi] = useState<AiStatus>();
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string>();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void fetchAiStatus().then(setAi);
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!loading) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [loading]);

  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  const brief = useMemo(() => (room ? buildRoomBrief(d, room) : undefined), [d, room]);
  if (!room || !brief) return null;

  const designs = project.designs?.[room.id] ?? [];
  const current = designs[Math.min(variant, designs.length - 1)];
  const stale = current ? current.inputsHash !== briefHash(brief) : false;
  const finished = isRoomFinished(room, d.finishes, { geometry: d.geometry, styles: d.wishes.styles });
  const canGenerate = ai === 'configured' && !loading;

  const generate = async () => {
    setError(undefined);
    setLoading(true);
    setElapsed(0);
    abortRef.current = new AbortController();
    try {
      const design = await requestRoomDesign(d, room.id, abortRef.current.signal);
      addRoomDesign(project.id, design);
      setVariant(0);
      if (design.unresolved.length) message.warning('Дизайн готов, но часть замечаний проверки осталась — см. ниже');
      else message.success(`Дизайн комнаты «${room.name}» готов`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof DesignRequestError ? err.message : 'Не удалось получить дизайн');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      title={<span><BulbOutlined /> Дизайн от ИИ</span>}
      extra={<Typography.Text type="secondary">Claude проектирует, программа проверяет</Typography.Text>}
    >
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        {ai === 'offline' && (
          <Alert type="warning" showIcon title="Сервер ИИ не запущен"
            description="Запустите его в отдельном терминале: npm run dev:server" />
        )}
        {ai === 'missing_key' && (
          <Alert type="warning" showIcon title="ИИ не настроен"
            description="Добавьте ANTHROPIC_API_KEY в файл apps/server/.env (образец — .env.example) и перезапустите сервер." />
        )}

        <Segmented block value={room.id} onChange={(v) => { setRoomId(v); setVariant(0); setError(undefined); }}
          options={rooms.map((r) => ({ value: r.id, label: `${r.name}${project.designs?.[r.id]?.length ? ' ✓' : ''}` }))} />

        {!finished && (
          <Alert type="info" showIcon title="Отделка комнаты выбрана не полностью"
            description="ИИ подберёт недостающее сам, но точнее всего дизайн получается по полностью выбранной отделке."
            action={<Button size="small" icon={<EditOutlined />} onClick={onEdit}>Выбрать отделку</Button>} />
        )}

        <Flex gap={8} wrap align="center">
          <Button type="primary" icon={current ? <ReloadOutlined /> : <BulbOutlined />} loading={loading} disabled={!canGenerate}
            onClick={() => void generate()}>
            {current ? 'Ещё вариант' : 'Сгенерировать дизайн'}
          </Button>
          {loading && (
            <>
              <Typography.Text type="secondary">Claude проектирует комнату… {elapsed} с (обычно 1–2 минуты)</Typography.Text>
              <Button size="small" onClick={() => abortRef.current?.abort()}>Отменить</Button>
            </>
          )}
          {!loading && <Typography.Text type="secondary" style={{ fontSize: 12 }}>Каждая генерация — платный запрос к Claude</Typography.Text>}
        </Flex>

        {error && <Alert type="error" showIcon title={error} closable={{ onClose: () => setError(undefined) }} />}

        {!current && !loading && <Empty description="Для этой комнаты дизайна ещё нет" />}

        {current && (
          <>
            {stale && (
              <Alert type="warning" showIcon title="Отделка или план изменились после генерации"
                description="Этот вариант сделан по старым данным. Сгенерируйте новый, чтобы учесть изменения." />
            )}
            <Flex justify="space-between" align="center" wrap gap={8}>
              {designs.length > 1 ? (
                <Segmented size="small" value={variant} onChange={setVariant}
                  options={designs.map((_, i) => ({ value: i, label: `Вариант ${i + 1}` }))} />
              ) : <span />}
              <Space>
                <Typography.Text style={{ fontSize: 12 }}>Стены в полную высоту</Typography.Text>
                <Switch size="small" checked={fullWalls} onChange={setFullWalls} />
              </Space>
            </Flex>

            <Suspense fallback={<Flex justify="center" align="center" style={{ height: 420 }}><Spin /></Flex>}>
              <RoomScene3D brief={brief} design={current} wallHeightMm={fullWalls ? brief.ceilingHeightMm : CUTAWAY_MM} />
            </Suspense>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Схематичная 3D-модель: мебель показана блоками в реальных размерах и цветах. Вращайте мышью или пальцем, наведите на
              предмет — увидите подпись. Синие трубы — стояки, к ним оставлен доступ.
            </Typography.Text>

            <Typography.Paragraph style={{ marginBottom: 0 }}>{current.concept}</Typography.Paragraph>

            <Space wrap>
              {Object.entries({ Стены: current.palette.walls, Пол: current.palette.floor, Потолок: current.palette.ceiling, Акцент: current.palette.accent }).map(([k, v]) => (
                <Tag key={k} style={{ padding: '2px 8px' }}>
                  <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: v, border: '1px solid #ccc', marginRight: 6, verticalAlign: -1 }} />
                  {k}
                </Tag>
              ))}
            </Space>

            <List size="small" bordered dataSource={current.items}
              renderItem={(it) => (
                <List.Item>
                  <Flex justify="space-between" style={{ width: '100%' }} gap={8}>
                    <span>
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: it.color, marginRight: 8 }} />
                      {it.label}
                    </span>
                    <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
                      {Math.round(it.widthMm)}×{Math.round(it.depthMm)}×{Math.round(it.heightMm)} мм
                    </Typography.Text>
                  </Flex>
                </List.Item>
              )} />

            {current.notes.length > 0 && (
              <Alert type="info" showIcon title="Советы дизайнера"
                description={<ul style={{ margin: 0, paddingLeft: 18 }}>{current.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>} />
            )}
            {current.unresolved.length > 0 && (
              <Alert type="warning" showIcon title="Проверка нашла замечания, которые ИИ не исправил"
                description={<ul style={{ margin: 0, paddingLeft: 18 }}>{current.unresolved.map((n, i) => <li key={i}>{n}</li>)}</ul>} />
            )}
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {current.model} · {new Date(current.createdAt).toLocaleString('ru-RU')}
            </Typography.Text>
          </>
        )}
      </Space>
    </Card>
  );
}
