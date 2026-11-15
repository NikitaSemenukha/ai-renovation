import { Card, Descriptions, Typography } from 'antd';
import { finishedRoomCount, roomFinishesOf, roomHasWindow, type ProjectDraft, type RoomFinishes } from '@air/domain';
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
  SOCKET_COLORS,
  STRETCH_FINISH_LABELS,
  STRETCH_JOINT_LABELS,
  WALL_FINISH_LABELS,
} from '../../finishLabels';

function describe(f: RoomFinishes, hasWindow: boolean): string[] {
  const parts: string[] = [];
  if (f.ceiling) {
    const extra = [
      f.stretchFinish && STRETCH_FINISH_LABELS[f.stretchFinish].title.toLowerCase(),
      f.stretchJoint && STRETCH_JOINT_LABELS[f.stretchJoint].title.toLowerCase(),
      f.drywallShape && DRYWALL_SHAPE_LABELS[f.drywallShape].title.toLowerCase(),
    ].filter(Boolean);
    parts.push(`Потолок: ${CEILING_LABELS[f.ceiling].title.toLowerCase()}${extra.length ? ` (${extra.join(', ')})` : ''}`);
  }
  if (f.mainLight) {
    const extra = [f.wallLighting && 'подсветка стен', f.ceilingLighting && 'подсветка потолка'].filter(Boolean);
    parts.push(`Свет: ${MAIN_LIGHT_LABELS[f.mainLight].title.toLowerCase()}${extra.length ? `, ${extra.join(', ')}` : ''}`);
  }
  if (f.walls) {
    const panel = f.panelMaterial ? ` (${PANEL_LABELS[f.panelMaterial].title})` : '';
    parts.push(`Стены: ${WALL_FINISH_LABELS[f.walls].title.toLowerCase()}${panel}${f.moldings ? ', с рамками' : ''}`);
  }
  if (f.floor) parts.push(`Пол: ${FLOOR_LABELS[f.floor].title.toLowerCase()}`);
  if (f.door) parts.push(`Двери: ${DOOR_LABELS[f.door].title.toLowerCase()}`);
  if (f.plumbing.length) parts.push(`Сантехника: ${f.plumbing.map((p) => PLUMBING_LABELS[p].toLowerCase()).join(', ')}`);
  if (f.furniture.length) parts.push(`Мебель: ${f.furniture.map((p) => FURNITURE_LABELS[p].toLowerCase()).join(', ')}`);
  if (hasWindow && f.curtainColor) {
    parts.push(`Шторы: ${CURTAIN_COLORS[f.curtainColor].title.toLowerCase()}${f.tulle !== false ? ', белый тюль' : ''}`);
  }
  return parts;
}

/** Сводка выбранной отделки — на странице проекта. */
export function FinishesSummary({ draft }: { draft: ProjectDraft }) {
  const ctx = { geometry: draft.geometry, styles: draft.wishes.styles };
  const fin = draft.finishes;
  const done = finishedRoomCount(fin, ctx);
  const total = draft.geometry.rooms.length;

  return (
    <Card title="Отделка по комнатам" size="small" extra={<Typography.Text type="secondary">готово {done} из {total}</Typography.Text>}>
      <Descriptions
        size="small"
        column={1}
        items={[
          ...draft.geometry.rooms.map((r) => {
            const parts = describe(roomFinishesOf(fin, r), roomHasWindow(draft.geometry, r));
            return { key: r.id, label: r.name, children: parts.length ? parts.join('; ') : 'не выбрана' };
          }),
          {
            key: 'electric',
            label: 'Электрика',
            children:
              [
                fin.socketColor && `розетки ${SOCKET_COLORS[fin.socketColor].title.toLowerCase()}`,
                fin.socketBrand,
                fin.fixtureColor && `светильники ${FIXTURE_COLORS[fin.fixtureColor].title.toLowerCase()}`,
              ]
                .filter(Boolean)
                .join(', ') || 'не выбрана',
          },
        ]}
      />
    </Card>
  );
}
