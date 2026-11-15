import { useState, type ReactNode } from 'react';
import { CheckCircleFilled, RightOutlined } from '@ant-design/icons';
import { Alert, AutoComplete, Button, Checkbox, Col, Collapse, Divider, Flex, Grid, Row, Select, Space, Tag, Typography } from 'antd';
import {
  CEILING_TYPES,
  FURNITURE_BY_ROOM,
  PLUMBING_ITEMS,
  copyRoomFinishes,
  createRoomFinishes,
  doorOptions,
  findConflicts,
  finishedRoomCount,
  floorOptions,
  hasAnyFinish,
  isWetRoom,
  moldingsAvailable,
  roomFinishMissing,
  roomFinishesOf,
  roomHasWindow,
  roomNeedsDoor,
  wallOptions,
  type CurtainColor,
  type DrywallShape,
  type FixtureColor,
  type ProjectDraft,
  type Room,
  type RoomFinishes,
  type SocketColor,
  type StretchFinish,
  type StretchJoint,
  type PanelMaterial,
} from '@air/domain';
import { Field } from '../../../components/Field';
import { IssuesList } from '../../../components/IssuesList';
import { PictureChoice, type PictureOption } from '../../../components/PictureChoice';
import {
  CEILING_LABELS,
  CURTAIN_COLORS,
  DOOR_LABELS,
  DRYWALL_SHAPE_LABELS,
  FIXTURE_COLORS,
  FLOOR_LABELS,
  FURNITURE_LABELS,
  MAIN_LIGHT_LABELS,
  PANEL_LABELS,
  PLUMBING_LABELS,
  SOCKET_BRANDS,
  SOCKET_COLORS,
  STRETCH_FINISH_LABELS,
  STRETCH_JOINT_LABELS,
  WALL_FINISH_LABELS,
} from '../../../finishLabels';
import { FinishPicture } from '../../finishes/FinishPicture';
import { PlanCanvas } from '../../plan/PlanCanvas';
import { useDraft } from '../useDraft';

/** Опции карточек из словаря подписей + иллюстрация по ключу `${section}:${value}`. */
function cards<T extends string>(section: string, values: readonly T[], labels: Record<T, { title: string; hint?: string }>): PictureOption<T>[] {
  return values.map((v) => ({ value: v, ...labels[v], picture: <FinishPicture id={`${section}:${v}`} /> }));
}

const Swatch = ({ hex }: { hex: string }) => (
  <svg viewBox="0 0 120 50" width="100%" style={{ display: 'block', borderRadius: 6 }} aria-hidden>
    <rect width={120} height={50} fill="#fafafa" />
    <rect x={40} y={8} width={40} height={34} rx={6} fill={hex} stroke="#8c8c8c" strokeWidth={1.5} />
  </svg>
);

const colorCards = <T extends string>(map: Record<T, { title: string; hex: string }>): PictureOption<T>[] =>
  (Object.keys(map) as T[]).map((v) => ({ value: v, title: map[v].title, picture: <Swatch hex={map[v].hex} /> }));

/**
 * Раздел отделки. На широком экране — заголовок-разделитель; на телефоне — сворачиваемая
 * панель: готовые разделы свёрнуты, чтобы комната не растягивалась на много экранов.
 */
const Section = ({ title, done, open, mobile, children }: {
  title: string; done?: boolean; open?: boolean; mobile?: boolean; children: ReactNode;
}) => {
  const label = (
    <Typography.Text strong style={{ fontSize: 15 }}>
      {done && <CheckCircleFilled style={{ color: '#52c41a', marginRight: 6 }} />}
      {title}
    </Typography.Text>
  );
  if (mobile) {
    return (
      // key: при переходе к следующему незаполненному разделу панель пересоздаётся и раскрывается сама
      <Collapse key={open ? 'open' : 'closed'} size="small" style={{ marginTop: 10 }} defaultActiveKey={open ? ['s'] : []}
        items={[{ key: 's', label, children }]} />
    );
  }
  return (
    <>
      <Divider titlePlacement="start" style={{ margin: '8px 0 12px' }}>{label}</Divider>
      {children}
    </>
  );
};

export function FinishesStep() {
  const { draft, update } = useDraft();
  const screens = Grid.useBreakpoint();
  const mobile = !screens.lg;
  const rooms = draft.geometry.rooms;
  /** Последнее копирование — для кнопки «Отменить». */
  const [undo, setUndo] = useState<{ roomId: string; prev?: RoomFinishes; fromName: string }>();
  const ctx = { geometry: draft.geometry, styles: draft.wishes.styles };
  const isDone = (r: Room) => roomFinishMissing(r, roomFinishesOf(draft.finishes, r), ctx).length === 0;

  const [roomId, setRoomId] = useState(() => (rooms.find((r) => !isDone(r)) ?? rooms[0])?.id);
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  const conflicts = findConflicts(draft).filter((c) => c.step === 'finishes');
  const done = finishedRoomCount(draft.finishes, ctx);

  if (!room) return <Alert type="warning" showIcon title="На плане нет помещений — сначала нужен план." />;

  const f = roomFinishesOf(draft.finishes, room);
  const missing = roomFinishMissing(room, f, ctx);
  const nextRoom = rooms.find((r) => r.id !== room.id && !isDone(r));

  /** Изменить отделку текущей комнаты. */
  const set = (recipe: (rf: RoomFinishes, d: ProjectDraft) => void) =>
    update((d) => {
      const rf = (d.finishes.rooms[room.id] ??= createRoomFinishes(room.kind));
      recipe(rf, d);
    });

  const copyFrom = (fromId: string) => {
    const from = rooms.find((r) => r.id === fromId);
    if (!from) return;
    setUndo({ roomId: room.id, prev: draft.finishes.rooms[room.id], fromName: from.name });
    update((d) => void (d.finishes.rooms[room.id] = copyRoomFinishes(roomFinishesOf(d.finishes, from), room, ctx)));
  };
  const undoCopy = () => {
    if (!undo) return;
    update((d) => {
      if (undo.prev) d.finishes.rooms[undo.roomId] = undo.prev;
      else delete d.finishes.rooms[undo.roomId];
    });
    setUndo(undefined);
  };
  const selectRoom = (id: string) => {
    setRoomId(id);
    setUndo(undefined);
  };
  // Копировать можно только из комнат, где уже что-то выбрано
  const copySources = rooms.filter((r) => r.id !== room.id && hasAnyFinish(draft.finishes.rooms[r.id]));

  const sectionDone = {
    ceiling: Boolean(f.ceiling && (f.ceiling === 'drywall' ? f.drywallShape : f.stretchFinish && f.stretchJoint)),
    light: Boolean(f.mainLight),
    walls: Boolean(f.walls && (f.walls !== 'panels' || f.panelMaterial)),
    floor: Boolean(f.floor),
    door: Boolean(f.door),
    plumbing: f.plumbing.length > 0,
    furniture: f.furniture.length > 0,
    curtains: Boolean(f.curtainColor),
    electric: Boolean(draft.finishes.socketColor),
  };
  const tagStyle = { padding: mobile ? '10px 14px' : '3px 10px', fontSize: 14 };
  /** На телефоне раскрыт только первый незаполненный раздел — после выбора открывается следующий. */
  const order: [keyof typeof sectionDone, boolean][] = [
    ['ceiling', true],
    ['light', true],
    ['walls', true],
    ['floor', true],
    ['door', roomNeedsDoor(draft.geometry, room)],
    ['plumbing', isWetRoom(room.kind)],
    ['curtains', roomHasWindow(draft.geometry, room)],
    ['electric', true],
  ];
  const firstOpen = mobile ? order.find(([k, applies]) => applies && !sectionDone[k])?.[0] : undefined;

  const classic = draft.wishes.styles.includes('classic');

  return (
    <Row gutter={[24, 16]}>
      <Col xs={24} lg={9}>
        <div style={mobile ? undefined : { position: 'sticky', top: 16 }}>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
            Выберите комнату на плане или в списке. Готово комнат: <b>{done} из {rooms.length}</b>
          </Typography.Paragraph>
          {mobile ? (
            <Collapse size="small" items={[{
              key: 'plan', label: 'Показать план',
              children: <PlanCanvas geometry={draft.geometry} selectedRoomId={room.id} onRoomClick={(r) => selectRoom(r.id)}
                roomFill={(r) => (isDone(r) ? '#d9f7be' : undefined)} />,
            }]} />
          ) : (
            <PlanCanvas
              geometry={draft.geometry}
              selectedRoomId={room.id}
              onRoomClick={(r) => selectRoom(r.id)}
              roomFill={(r) => (isDone(r) ? '#d9f7be' : undefined)}
            />
          )}
          <Space wrap style={{ marginTop: 8 }}>
            {rooms.map((r) => (
              <Tag.CheckableTag key={r.id} checked={r.id === room.id} onChange={() => selectRoom(r.id)} style={tagStyle}>
                {isDone(r) && <CheckCircleFilled style={{ color: r.id === room.id ? '#fff' : '#52c41a', marginRight: 4 }} />}
                {r.name}
              </Tag.CheckableTag>
            ))}
          </Space>
          {draft.geometry.source === 'demo' && (
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
              Комнаты, окна и двери взяты с демо-плана.
            </Typography.Paragraph>
          )}
        </div>
      </Col>

      {/* key: при смене комнаты разделы открываются заново под её состояние */}
      <Col key={room.id} xs={24} lg={15}>
        <Flex justify="space-between" align="center" wrap gap={8} style={{ marginBottom: 4 }}>
          <Typography.Title level={4} style={{ margin: 0 }}>{room.name}</Typography.Title>
          {copySources.length > 0 && (
            <Select
              aria-label="Скопировать отделку из другой комнаты"
              placeholder="Скопировать из…"
              size={mobile ? 'large' : 'middle'}
              style={{ width: mobile ? '100%' : 200 }}
              value={null}
              onChange={(v: string) => copyFrom(v)}
              options={copySources.map((r) => ({ value: r.id, label: `Как в: ${r.name}` }))}
            />
          )}
        </Flex>
        {undo?.roomId === room.id && (
          <Alert style={{ margin: '8px 0' }} type="success" showIcon
            title={`Отделка скопирована из комнаты «${undo.fromName}»`}
            action={<Button size="small" onClick={undoCopy}>Отменить</Button>} closable={{ onClose: () => setUndo(undefined) }} />
        )}
        <Typography.Text type={missing.length ? 'secondary' : 'success'}>
          {missing.length ? `Осталось выбрать: ${missing.join(', ')}` : 'Отделка комнаты выбрана'}
        </Typography.Text>

        <Section title="1. Потолок" done={sectionDone.ceiling} open={firstOpen === 'ceiling'} mobile={mobile}>
          <Field id="ceiling" label="Тип потолка" required>
            <PictureChoice labelledBy="ceiling-label" value={f.ceiling} options={cards('ceiling', CEILING_TYPES, CEILING_LABELS)}
              onChange={(v) => set((rf) => {
                rf.ceiling = v;
                rf.perimeterBox = v === 'combined' ? true : undefined;
                if (v === 'drywall') { rf.stretchFinish = undefined; rf.stretchJoint = undefined; } else rf.drywallShape = undefined;
              })} />
          </Field>
          {(f.ceiling === 'stretch' || f.ceiling === 'combined') && (
            <>
              <Field id="stretch-finish" label="Фактура полотна" required>
                <PictureChoice<StretchFinish> labelledBy="stretch-finish-label" value={f.stretchFinish}
                  options={cards('stretchFinish', ['gloss', 'satin', 'matte'], STRETCH_FINISH_LABELS)}
                  onChange={(v) => set((rf) => void (rf.stretchFinish = v))} />
              </Field>
              <Field id="stretch-joint" label="Примыкание к стене" required>
                <PictureChoice<StretchJoint> labelledBy="stretch-joint-label" value={f.stretchJoint}
                  options={cards('stretchJoint', ['straight', 'shadow'], STRETCH_JOINT_LABELS)}
                  onChange={(v) => set((rf) => void (rf.stretchJoint = v))} />
              </Field>
            </>
          )}
          {f.ceiling === 'drywall' && (
            <Field id="drywall-shape" label="Форма" required>
              <PictureChoice<DrywallShape> labelledBy="drywall-shape-label" value={f.drywallShape}
                options={cards('drywallShape', ['flat', 'complex'], DRYWALL_SHAPE_LABELS)}
                onChange={(v) => set((rf) => void (rf.drywallShape = v))} />
            </Field>
          )}
        </Section>

        <Section title="2. Освещение" done={sectionDone.light} open={firstOpen === 'light'} mobile={mobile}>
          <Field id="main-light" label="Основной свет" required hint="точное расположение светильников подберёт система на визуализации">
            <PictureChoice labelledBy="main-light-label" value={f.mainLight}
              options={cards('mainLight', ['chandelier', 'chandelier_spots', 'spots'] as const, MAIN_LIGHT_LABELS)}
              onChange={(v) => set((rf) => void (rf.mainLight = v))} />
          </Field>
          <Space wrap>
            <Checkbox checked={Boolean(f.wallLighting)} onChange={(e) => set((rf) => void (rf.wallLighting = e.target.checked))}>
              Подсветка стен
            </Checkbox>
            <Checkbox checked={Boolean(f.ceilingLighting)} onChange={(e) => set((rf) => void (rf.ceilingLighting = e.target.checked))}>
              Подсветка потолка
            </Checkbox>
          </Space>
        </Section>

        <Section title="3. Стены" done={sectionDone.walls} open={firstOpen === 'walls'} mobile={mobile}>
          <Field id="walls-finish" label="Отделка стен" required hint={isWetRoom(room.kind) ? 'в санузле — краска или плитка' : undefined}>
            <PictureChoice labelledBy="walls-finish-label" value={f.walls} options={cards('walls', wallOptions(room.kind), WALL_FINISH_LABELS)}
              onChange={(v) => set((rf) => {
                rf.walls = v;
                if (v !== 'panels') rf.panelMaterial = undefined;
              })} />
          </Field>
          {f.walls === 'panels' && (
            <Field id="panel" label="Материал панелей" required>
              <PictureChoice<PanelMaterial> labelledBy="panel-label" value={f.panelMaterial}
                options={cards('panel', ['bamboo', 'chipboard', 'mdf_painted'], PANEL_LABELS)}
                onChange={(v) => set((rf) => void (rf.panelMaterial = v))} />
            </Field>
          )}
          {moldingsAvailable(draft.wishes.styles, room.kind) && (
            <Field id="moldings" label="Рамки (молдинги) на стенах" hint="характерно для классики">
              <PictureChoice<'yes' | 'no'> labelledBy="moldings-label" value={f.moldings === undefined ? undefined : f.moldings ? 'yes' : 'no'}
                options={cards('moldings', ['yes', 'no'], { yes: { title: 'С рамками' }, no: { title: 'Без рамок' } })}
                onChange={(v) => set((rf) => void (rf.moldings = v === 'yes'))} />
            </Field>
          )}
        </Section>

        <Section title="4. Пол" done={sectionDone.floor} open={firstOpen === 'floor'} mobile={mobile}>
          <Field id="floor" label="Покрытие пола" required
            hint={isWetRoom(room.kind) ? 'в санузле пол только из плитки' : 'микроцемент и сложные дизайны — индивидуально, обсудим отдельно'}>
            <PictureChoice labelledBy="floor-label" value={f.floor} options={cards('floor', floorOptions(room.kind), FLOOR_LABELS)}
              onChange={(v) => set((rf) => void (rf.floor = v))} />
          </Field>
        </Section>

        {roomNeedsDoor(draft.geometry, room) && (
          <Section title="5. Двери" done={sectionDone.door} open={firstOpen === 'door'} mobile={mobile}>
            <Field id="door" label="Межкомнатная дверь" required
              hint={classic ? 'для классики предлагаем двери с наличниками — скрытые под этот стиль не ставят' : 'варианты зависят от стиля'}>
              <PictureChoice labelledBy="door-label" value={f.door} options={cards('door', doorOptions(draft.wishes.styles), DOOR_LABELS)}
                onChange={(v) => set((rf) => void (rf.door = v))} />
            </Field>
          </Section>
        )}

        {isWetRoom(room.kind) && (
          <Section title="Сантехника" done={sectionDone.plumbing} open={firstOpen === 'plumbing'} mobile={mobile}>
            <Field id="plumbing" label="Что будет в санузле" required hint="можно выбрать несколько">
              <PictureChoice multiple labelledBy="plumbing-label" value={f.plumbing}
                options={PLUMBING_ITEMS.map((v) => ({ value: v, title: PLUMBING_LABELS[v], picture: <FinishPicture id={`plumbing:${v}`} /> }))}
                onChange={(v) => set((rf) => void (rf.plumbing = v))} />
            </Field>
          </Section>
        )}

        <Section title="Мебель и техника" done={sectionDone.furniture} mobile={mobile}>
          <Field id="furniture" label="Что должно быть в комнате" hint="по желанию; модели и расстановку подберём на визуализации">
            <Space wrap role="group" aria-labelledby="furniture-label">
              {FURNITURE_BY_ROOM[room.kind].map((item) => (
                <Tag.CheckableTag key={item} checked={f.furniture.includes(item)} style={tagStyle}
                  onChange={(on) => set((rf) => void (rf.furniture = on ? [...rf.furniture, item] : rf.furniture.filter((x) => x !== item)))}>
                  {FURNITURE_LABELS[item]}
                </Tag.CheckableTag>
              ))}
            </Space>
          </Field>
        </Section>

        {roomHasWindow(draft.geometry, room) && (
          <Section title="Шторы" done={sectionDone.curtains} open={firstOpen === 'curtains'} mobile={mobile}>
            <Field id="curtains" label="Цвет штор" required hint="материал подберём сами — достаточно цвета">
              <PictureChoice<CurtainColor> labelledBy="curtains-label" value={f.curtainColor}
                options={(Object.keys(CURTAIN_COLORS) as CurtainColor[]).map((c) => ({
                  value: c,
                  title: CURTAIN_COLORS[c].title,
                  picture: <FinishPicture id="curtain" curtainHex={CURTAIN_COLORS[c].hex} />,
                }))}
                onChange={(v) => set((rf) => void (rf.curtainColor = v))} />
            </Field>
            <Checkbox checked={f.tulle !== false} onChange={(e) => set((rf) => void (rf.tulle = e.target.checked))}>
              Тюль (белый)
            </Checkbox>
          </Section>
        )}

        <Flex justify="end" style={{ marginTop: 16 }}>
          {nextRoom && (
            <Button type={missing.length ? 'default' : 'primary'} size={mobile ? 'large' : 'middle'} block={mobile}
              onClick={() => { selectRoom(nextRoom.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
              Следующая комната: {nextRoom.name} <RightOutlined />
            </Button>
          )}
        </Flex>

        <Section title="Для всей квартиры: электрика" done={sectionDone.electric} open={firstOpen === 'electric'} mobile={mobile}>
          <Field id="socket-color" label="Цвет розеток и выключателей" required>
            <PictureChoice<SocketColor> labelledBy="socket-color-label" value={draft.finishes.socketColor} options={colorCards(SOCKET_COLORS)}
              onChange={(v) => update((d) => void (d.finishes.socketColor = v))} />
          </Field>
          <Field id="socket-brand" label="Производитель розеток" hint="если есть предпочтения; можно вписать свой">
            <AutoComplete id="socket-brand" style={{ width: 260 }} placeholder="Например, Schneider Electric" allowClear
              value={draft.finishes.socketBrand} options={SOCKET_BRANDS.map((b) => ({ value: b }))}
              filterOption={(input, o) => String(o?.value).toLowerCase().includes(input.toLowerCase())}
              onChange={(v?: string) => update((d) => void (d.finishes.socketBrand = v?.trim() ? v : undefined))} />
          </Field>
          <Field id="fixture-color" label="Цвет светильников" hint="по желанию">
            <PictureChoice<FixtureColor> labelledBy="fixture-color-label" value={draft.finishes.fixtureColor} options={colorCards(FIXTURE_COLORS)}
              onChange={(v) => update((d) => void (d.finishes.fixtureColor = v))} />
          </Field>
        </Section>

        <IssuesList conflicts={conflicts} title={conflicts.length ? 'Проверка отделки' : undefined} />
        <Alert style={{ marginTop: 12 }} type="info" showIcon title="Что будет с выбором"
          description="По вашему выбору система подберёт материалы и расставит светильники, розетки и мебель на визуализации. Сама визуализация — следующий этап разработки; сейчас выбор сохраняется в проекте. Картинки на карточках — схемы, фото материалов появятся с каталогом поставщиков." />
      </Col>
    </Row>
  );
}
