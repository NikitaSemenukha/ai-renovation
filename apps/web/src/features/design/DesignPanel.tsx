import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { AimOutlined, BulbOutlined, EditOutlined, ReloadOutlined, ShoppingOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Empty, Flex, Grid, Segmented, Select, Space, Spin, Switch, Tag, Typography } from 'antd';
import {
  assembleFurniturePlan,
  briefHash,
  buildZoneBrief,
  designCost,
  designZones,
  isRoomFinished,
  type Catalog,
  type Project,
  type DesignZone,
  type RoomDesign,
} from '@air/domain';
import { useProjects } from '../../store/projectsStore';
import { DesignRequestError, fetchAiStatus, fetchCatalog, requestRoomDesign, type AiStatus } from './api';
import { FurniturePlanDrawing } from './FurniturePlanDrawing';
import { FurniturePlanView } from './FurniturePlanView';

// three.js тяжёлый — грузим его только когда есть что показать
const RoomScene3D = lazy(() => import('./RoomScene3D'));

const LOW_WALLS_MM = 1200;
/** Вкладка «Вся квартира» — лист «План размещения мебели». */
const ALL = '__all';
const money = (n: number) => n.toLocaleString('ru-RU');

/** Номер варианта по порядку создания и время — не сдвигаются при новых генерациях. */
function variantLabel(d: RoomDesign, index: number, total: number): string {
  const n = d.seq ?? total - index;
  const time = new Date(d.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `Вариант ${n} · ${time}`;
}

export function DesignPanel({ project, onEdit }: { project: Project; onEdit: () => void }) {
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const mobile = !screens.md;
  const addRoomDesign = useProjects((s) => s.addRoomDesign);
  const d = project.data;
  const zones = useMemo(() => designZones(d), [d]);
  // Сначала план расстановки всей квартиры, 3D — потом, по комнатам
  const [zoneId, setZoneId] = useState<string>(ALL);
  const [view, setView] = useState<'plan' | '3d'>('plan');
  const [batch, setBatch] = useState(false);
  const [variant, setVariant] = useState(0);
  const [lowWalls, setLowWalls] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [ai, setAi] = useState<AiStatus>();
  const [catalog, setCatalog] = useState<Catalog>();
  // Генерация привязана к зоне, для которой её запустили: переключение вкладок её не путает
  const [loadingZone, setLoadingZone] = useState<string>();
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string>();
  const abortRef = useRef<AbortController | null>(null);
  const sheet = useMemo(() => assembleFurniturePlan(d, project.designs), [d, project.designs]);

  useEffect(() => {
    void fetchAiStatus().then(setAi);
    void fetchCatalog().then(setCatalog);
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!loadingZone) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [loadingZone]);

  // Свежесть дизайна каждой зоны — для отметок во вкладках
  const hashes = useMemo(() => new Map(zones.filter((z) => !z.blockedReason).map((z) => [z.id, briefHash(buildZoneBrief(d, z))])), [d, zones]);
  const zoneMark = (id: string) => {
    const latest = project.designs?.[id]?.[0];
    if (!latest) return '';
    return latest.inputsHash === hashes.get(id) ? ' ✓' : ' ↻';
  };

  const isAll = zoneId === ALL;
  const zone = isAll ? undefined : (zones.find((z) => z.id === zoneId) ?? zones[0]);
  const brief = useMemo(() => (zone && !zone.blockedReason ? buildZoneBrief(d, zone) : undefined), [d, zone]);
  const designs = zone ? (project.designs?.[zone.id] ?? []) : [];
  const zoneSheet = useMemo(
    () => (zone && designs.length ? assembleFurniturePlan(d, project.designs, { [zone.id]: variant }, [zone]) : undefined),
    [d, project.designs, zone, variant, designs.length],
  );
  const productsById = new Map((catalog?.products ?? []).map((p) => [p.id, p]));

  const runDesign = async (target: DesignZone, signal: AbortSignal) => {
    setLoadingZone(target.id);
    setElapsed(0);
    try {
      const design = await requestRoomDesign(d, target.id, signal);
      addRoomDesign(project.id, design);
      if (design.unresolved.length) message.warning(`Дизайн «${target.name}» готов, но часть замечаний проверки осталась`);
      else message.success(`Дизайн «${target.name}» готов`);
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return false;
      setError(`${target.name}: ${err instanceof DesignRequestError ? err.message : 'не удалось получить дизайн'}`);
      return false;
    } finally {
      setLoadingZone(undefined);
    }
  };

  /** ИИ проектирует все недостающие комнаты по очереди — из них собирается план мебели квартиры. */
  const designMissing = async () => {
    const queue = sheet.missing.map((m) => sheet.zones.find((z) => z.id === m.id)).filter((z): z is DesignZone => Boolean(z && !z.blockedReason));
    setError(undefined);
    setBatch(true);
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    for (const z of queue) {
      if (signal.aborted || !(await runDesign(z, signal))) break;
    }
    setBatch(false);
  };

  const zoneOptions = [{ value: ALL, label: 'Вся квартира' }, ...zones.map((z) => ({ value: z.id, label: `${z.name}${zoneMark(z.id)}` }))];
  const selectZone = (id: string) => {
    setZoneId(id);
    setVariant(0);
    setError(undefined);
  };
  const loadingName = zones.find((z) => z.id === loadingZone)?.name;

  if (isAll || !zone) {
    return (
      <Card
        title={<span><BulbOutlined /> Дизайн от ИИ</span>}
        extra={!mobile && <Typography.Text type="secondary">Claude проектирует, программа проверяет</Typography.Text>}
        styles={mobile ? { body: { padding: 12 } } : undefined}
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          {ai === 'offline' && <Alert type="warning" showIcon title="Сервис дизайна сейчас недоступен" description="Попробуйте обновить страницу чуть позже." />}
          {ai === 'missing_key' && <Alert type="warning" showIcon title="Дизайн от ИИ пока не подключён" description="Обратитесь к администратору сервиса." />}
          {mobile ? (
            <Select size="large" style={{ width: '100%' }} value={ALL} onChange={selectZone} options={zoneOptions} aria-label="Комната" />
          ) : (
            <Segmented block value={ALL} onChange={selectZone} options={zoneOptions} />
          )}
          <Typography.Title level={5} style={{ margin: 0 }}>План размещения мебели</Typography.Title>
          {loadingZone && (
            <Flex gap={8} align="center" wrap>
              <Typography.Text type="secondary">Claude проектирует «{loadingName}»… {elapsed} с</Typography.Text>
              <Button size="small" onClick={() => abortRef.current?.abort()}>Остановить</Button>
            </Flex>
          )}
          {error && <Alert type="error" showIcon title={error} closable={{ onClose: () => setError(undefined) }} />}
          <FurniturePlanView
            title={`План размещения мебели — ${project.name}`}
            sheet={sheet}
            products={productsById}
            designing={batch}
            onDesignMissing={ai === 'configured' && !loadingZone ? () => void designMissing() : undefined}
          />
        </Space>
      </Card>
    );
  }

  const current = designs[Math.min(variant, designs.length - 1)];
  const stale = current && brief ? current.inputsHash !== briefHash(brief) : false;
  const ctx = { geometry: d.geometry, styles: d.wishes.styles };
  const finished = zone.mergedFrom
    ? d.geometry.rooms.filter((r) => r.kind === 'kitchen' || r.kind === 'living').every((r) => isRoomFinished(r, d.finishes, ctx))
    : isRoomFinished(zone.room, d.finishes, ctx);
  const loadingHere = loadingZone === zone.id;
  const canGenerate = ai === 'configured' && !loadingZone && !zone.blockedReason;
  const cost = current ? designCost(current.items, catalog) : undefined;
  const usesDemo = current?.items.some((it) => it.productId && productsById.get(it.productId)?.demo);

  const generate = async () => {
    setError(undefined);
    abortRef.current = new AbortController();
    if (await runDesign(zone, abortRef.current.signal)) {
      setVariant(0);
      setView('plan');
    }
  };

  return (
    <Card
      title={<span><BulbOutlined /> Дизайн от ИИ</span>}
      extra={!mobile && <Typography.Text type="secondary">Claude проектирует, программа проверяет</Typography.Text>}
      styles={mobile ? { body: { padding: 12 } } : undefined}
    >
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        {ai === 'offline' && <Alert type="warning" showIcon title="Сервис дизайна сейчас недоступен" description="Попробуйте обновить страницу чуть позже." />}
        {ai === 'missing_key' && <Alert type="warning" showIcon title="Дизайн от ИИ пока не подключён" description="Обратитесь к администратору сервиса." />}

        {/* На телефоне вкладки не помещаются — выбор зоны списком */}
        {mobile ? (
          <Select size="large" style={{ width: '100%' }} value={zone.id} onChange={selectZone} options={zoneOptions} aria-label="Комната" />
        ) : (
          <Segmented block value={zone.id} onChange={selectZone} options={zoneOptions} />
        )}
        <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: -8 }}>
          ✓ — дизайн актуален, ↻ — отделка изменилась, стоит сгенерировать заново
        </Typography.Text>

        {zone.blockedReason && (
          <Alert type="error" showIcon title={`«${zone.name}» нельзя спроектировать`} description={`Причина: ${zone.blockedReason}.`} />
        )}
        {zone.mergedFrom && !zone.blockedReason && (
          <Alert type="info" showIcon title="Кухня и гостиная проектируются как одна зона"
            description="Перегородка между ними убрана, ИИ разделит пространство на кухонную и гостиную части. Снос возможен только после проверки стены и согласования перепланировки." />
        )}
        {!finished && !zone.blockedReason && (
          <Alert type="info" showIcon title="Отделка выбрана не полностью"
            description="ИИ подберёт недостающее сам, но точнее всего дизайн получается по полностью выбранной отделке."
            action={<Button size="small" icon={<EditOutlined />} onClick={onEdit}>Выбрать</Button>} />
        )}

        <Flex gap={8} wrap align="center">
          <Button type="primary" size={mobile ? 'large' : 'middle'} block={mobile} icon={current ? <ReloadOutlined /> : <BulbOutlined />}
            loading={loadingHere} disabled={!canGenerate} onClick={() => void generate()}>
            {current ? 'Ещё вариант' : 'Сгенерировать дизайн'}
          </Button>
          {loadingZone && (
            <>
              <Typography.Text type="secondary">
                {loadingHere ? 'Claude проектирует…' : `Идёт дизайн «${zones.find((z) => z.id === loadingZone)?.name}»…`} {elapsed} с ({zones.find((z) => z.id === loadingZone)?.mergedFrom ? 'большая зона — до 3 минут' : 'обычно 30–90 с'})
              </Typography.Text>
              <Button size="small" onClick={() => abortRef.current?.abort()}>Отменить</Button>
            </>
          )}
          {!loadingZone && <Typography.Text type="secondary" style={{ fontSize: 12 }}>Каждая генерация — платный запрос к ИИ</Typography.Text>}
        </Flex>

        {error && <Alert type="error" showIcon title={error} closable={{ onClose: () => setError(undefined) }} />}

        {!current && !loadingHere && !zone.blockedReason && <Empty description="Для этой зоны дизайна ещё нет" />}

        {current && brief && (
          <>
            {stale && (
              <Alert type="warning" showIcon title="Отделка или план изменились после генерации"
                description="Этот вариант сделан по старым данным. Сгенерируйте новый, чтобы учесть изменения." />
            )}
            <Flex justify="space-between" align="center" wrap gap={8}>
              {designs.length > 1 ? (
                <Select size="small" value={variant} onChange={setVariant} style={{ minWidth: 190 }}
                  options={designs.map((x, i) => ({ value: i, label: variantLabel(x, i, designs.length) }))} />
              ) : (
                <Typography.Text type="secondary">{variantLabel(current, 0, 1)}</Typography.Text>
              )}
              <Space wrap>
                <Segmented size="small" value={view} onChange={(v) => setView(v as 'plan' | '3d')}
                  options={[{ value: 'plan', label: 'План мебели' }, { value: '3d', label: '3D' }]} />
                {view === '3d' && (
                  <>
                    <Button size="small" icon={<AimOutlined />} onClick={() => setResetSignal((n) => n + 1)}>Вернуть вид</Button>
                    <Space size={6}>
                      <Typography.Text style={{ fontSize: 12 }}>Низкие стены</Typography.Text>
                      <Switch size="small" checked={lowWalls} onChange={setLowWalls} />
                    </Space>
                  </>
                )}
              </Space>
            </Flex>

            {view === 'plan' && zoneSheet ? (
              <>
                <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden', maxWidth: 760 }}>
                  <FurniturePlanDrawing sheet={zoneSheet} focusZoneId={zone.id} />
                </div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Расстановка с размерами: привязки к чистовым стенам и габариты, мм. Проверьте план, затем откройте 3D.
                  Весь план квартиры с экспликацией и спецификацией — во вкладке «Вся квартира».
                </Typography.Text>
              </>
            ) : (
              <>
                <Suspense fallback={<Flex justify="center" align="center" style={{ height: 440 }}><Spin /></Flex>}>
                  {/* key: при смене зоны или варианта камера встаёт в исходный вид */}
                  <RoomScene3D key={`${zone.id}-${current.createdAt}`} brief={brief} design={current}
                    wallHeightMm={lowWalls ? LOW_WALLS_MM : brief.ceilingHeightMm} resetSignal={resetSignal} height={mobile ? 320 : 440} />
                </Suspense>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Вращайте мышью или пальцем, колёсиком или щипком — приближение. Наведите на предмет — увидите подпись. Синие трубы — стояки.
                  Модели упрощённые, размеры и цвета — реальные.
                </Typography.Text>
              </>
            )}

            <Typography.Paragraph style={{ marginBottom: 0 }}>{current.concept}</Typography.Paragraph>

            <Space wrap>
              {Object.entries({ Стены: current.palette.walls, Пол: current.palette.floor, Потолок: current.palette.ceiling, Акцент: current.palette.accent }).map(([k, v]) => (
                <Tag key={k} style={{ padding: '2px 8px' }}>
                  <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: v, border: '1px solid #ccc', marginRight: 6, verticalAlign: -1 }} />
                  {k}
                </Tag>
              ))}
            </Space>

            {/* Обычный список вместо antd List: тот помечен устаревшим и пишет ошибку в консоль */}
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8 }}>
              {current.items.map((it, i) => {
                const prod = it.productId ? productsById.get(it.productId) : undefined;
                const name = prod?.name ?? it.label;
                return (
                  <div key={i} style={{ padding: '8px 16px', borderTop: i ? '1px solid #f0f0f0' : undefined }}>
                    <Flex justify="space-between" style={{ width: '100%' }} gap={8} wrap>
                      <span>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: it.color, marginRight: 8 }} />
                        {prod?.url ? <a href={prod.url} target="_blank" rel="noreferrer">{name}</a> : name}
                        {prod && <Tag icon={<ShoppingOutlined />} color={prod.demo ? 'default' : 'blue'} style={{ marginLeft: 8 }}>{prod.demo ? 'демо-товар' : prod.supplier}</Tag>}
                      </span>
                      <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
                        {Math.round(it.widthMm)}×{Math.round(it.depthMm)}×{Math.round(it.heightMm)} мм
                        {prod?.priceUah !== undefined && ` · ${money(prod.priceUah)} ₴`}
                      </Typography.Text>
                    </Flex>
                  </div>
                );
              })}
            </div>

            {cost && cost.priced > 0 && (
              <Typography.Text strong>
                Товары из каталога: {money(cost.totalUah)} ₴{cost.unpriced > 0 && ` + ещё ${cost.unpriced} предм. без цены`}
              </Typography.Text>
            )}
            {usesDemo && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Сейчас подключён демо-каталог: обезличенные товары с типовыми размерами, без цен. После подключения фида поставщика здесь будут реальные товары, цены и ссылки.
              </Typography.Text>
            )}

            {current.notes.length > 0 && (
              <Alert type="info" showIcon title="Советы дизайнера"
                description={<ul style={{ margin: 0, paddingLeft: 18 }}>{current.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>} />
            )}
            {current.unresolved.length > 0 && (
              <Alert type="warning" showIcon title="Проверка нашла замечания, которые ИИ не исправил"
                description={<ul style={{ margin: 0, paddingLeft: 18 }}>{current.unresolved.map((n, i) => <li key={i}>{n}</li>)}</ul>} />
            )}
          </>
        )}
      </Space>
    </Card>
  );
}
