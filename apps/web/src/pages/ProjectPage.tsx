import { useEffect, useState } from 'react';
import { EditOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Descriptions, Result, Row, Space, Typography } from 'antd';
import { Link, useNavigate, useParams } from 'react-router';
import { completenessPercent, findConflicts, type ProjectDraft, type ProjectGoal } from '@air/domain';
import { IssuesList } from '../components/IssuesList';
import { FinishesSummary } from '../features/finishes/FinishesSummary';
import { PlanCanvas } from '../features/plan/PlanCanvas';
import { PlanLegend } from '../features/plan/PlanLegend';
import {
  BUILDING_TYPE_LABELS,
  GOAL_LABELS,
  INTERVENTION_LABELS,
  PLAN_SOURCE_LABELS,
  BUYER_LABELS,
  GUEST_TYPE_LABELS,
  LAYOUT_PREF_LABELS,
  STYLE_LABELS,
  TENANT_LABELS,
  TIMEFRAME_LABELS,
  WISH_GOAL_LABELS,
} from '../labels';
import { fileStore, logFileError, projectFileKey } from '../store/fileStore';
import { useProjects } from '../store/projectsStore';

const money = (n: number) => n.toLocaleString('ru-RU');

const OCCUPANTS_LABEL: Record<ProjectGoal, string> = { live: 'Жильцы', rent_long: 'Аренда', rent_daily: 'Посуточно', sale: 'Продажа' };

function occupantsSummary(d: ProjectDraft): string {
  const o = d.occupants;
  switch (d.goal) {
    case 'live': {
      const parts = [`взрослых: ${o.live.adults ?? '—'}`];
      if (o.live.childrenAges.length) parts.push(`дети: ${o.live.childrenAges.map((a) => `${a} л.`).join(', ')}`);
      if (o.live.remoteWorkers) parts.push(`работают из дома: ${o.live.remoteWorkers}`);
      if (o.live.pets.length) parts.push('есть животные');
      return parts.join('; ');
    }
    case 'rent_long': {
      const r = o.rentLong;
      return [
        r.targetTenant && `арендатор: ${TENANT_LABELS[r.targetTenant].toLowerCase()}`,
        r.layoutPreference && `важнее: ${LAYOUT_PREF_LABELS[r.layoutPreference].toLowerCase()}`,
        r.expectedMonthlyRent !== undefined && `ставка: ${money(r.expectedMonthlyRent)} ${r.rentCurrency ?? ''}/мес`.replace(' /', '/'),
        r.furnished !== undefined && (r.furnished ? 'с мебелью' : 'без мебели'),
      ].filter(Boolean).join('; ') || '—';
    }
    case 'rent_daily': {
      const r = o.rentDaily;
      return [
        `спальных мест: ${r.sleepingPlaces}`,
        r.guestType && `гости: ${GUEST_TYPE_LABELS[r.guestType].toLowerCase()}`,
        r.ownerStorage !== undefined && (r.ownerStorage ? 'нужно хранение для хозяина' : 'без хранения для хозяина'),
        r.fastTurnover !== undefined && (r.fastTurnover ? 'быстрая уборка между гостями' : 'без быстрой уборки'),
      ].filter(Boolean).join('; ');
    }
    case 'sale': {
      const s = o.sale;
      return [
        s.targetBuyer && `покупатель: ${BUYER_LABELS[s.targetBuyer].toLowerCase()}`,
        s.needsListingVisuals !== undefined && (s.needsListingVisuals ? 'нужны визуализации для объявления' : 'без визуализаций'),
      ].filter(Boolean).join('; ') || '—';
    }
    default:
      return '—';
  }
}

function usePlanFile(projectId?: string) {
  const [state, setState] = useState<{ url?: string; type?: string }>({});
  useEffect(() => {
    if (!projectId) return;
    let url: string | undefined;
    let cancelled = false;
    fileStore
      .get(projectFileKey(projectId))
      .then((blob) => {
        if (!blob || cancelled) return;
        url = URL.createObjectURL(blob);
        setState({ url, type: blob.type });
      })
      .catch((err) => logFileError('load project file', err));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [projectId]);
  return state;
}

export function ProjectPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const project = useProjects((s) => s.projects.find((p) => p.id === id));
  const startEditing = useProjects((s) => s.startEditing);
  const file = usePlanFile(project?.id);

  if (!project) {
    return <Result status="404" title="Проект не найден" extra={<Link to="/projects">К списку проектов</Link>} />;
  }

  const d = project.data;
  const walls = d.geometry.walls;
  const conflicts = findConflicts(d);
  const p = d.property;

  const edit = async () => {
    await startEditing(project.id);
    navigate('/projects/new', { state: { fromEdit: true } });
  };

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Row justify="space-between" align="middle" gutter={[16, 8]}>
        <Col>
          <Typography.Title level={3} style={{ marginBottom: 0 }}>{project.name}</Typography.Title>
          <Typography.Text type="secondary">Полнота данных: {completenessPercent(d)}%</Typography.Text>
        </Col>
        <Col>
          <Button icon={<EditOutlined />} onClick={() => void edit()}>Редактировать</Button>
        </Col>
      </Row>

      <IssuesList conflicts={conflicts} title={conflicts.length ? 'Что стоит проверить' : undefined} />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Space orientation="vertical" style={{ width: '100%' }}>
            {file.url && file.type?.startsWith('image/') && (
              <Card title="Ваш план" size="small">
                <img src={file.url} alt="Загруженный план" style={{ width: '100%', borderRadius: 8 }} />
              </Card>
            )}
            {file.url && file.type === 'application/pdf' && (
              <Card title="Ваш план" size="small">
                <a href={file.url} target="_blank" rel="noreferrer">Открыть PDF ({d.plan.fileName})</a>
              </Card>
            )}
            <Card title={d.geometry.source === 'demo' ? 'Разметка на демо-плане' : 'План'} size="small">
              <PlanCanvas geometry={d.geometry} engineering={d.engineering} />
              <PlanLegend counts={{
                load_bearing: walls.filter((w) => w.status === 'load_bearing').length,
                partition: walls.filter((w) => w.status === 'partition').length,
                unknown: walls.filter((w) => w.status === 'unknown').length,
              }} />
            </Card>
          </Space>
        </Col>
        <Col xs={24} lg={12}>
          <Space orientation="vertical" style={{ width: '100%' }}>
            <Card title="Исходные данные" size="small">
              <Descriptions
                size="small"
                column={1}
                items={[
                  { key: 'goal', label: 'Цель', children: d.goal ? GOAL_LABELS[d.goal].title : '—' },
                  { key: 'building', label: 'Тип дома', children: p.buildingType ? BUILDING_TYPE_LABELS[p.buildingType].title : '—' },
                  { key: 'place', label: 'Регион', children: [p.country, p.city].filter(Boolean).join(', ') || '—' },
                  {
                    key: 'floor',
                    label: 'Этаж',
                    children: p.floor !== undefined ? `${p.floor}${p.totalFloors ? ` из ${p.totalFloors}` : ''}` : '—',
                  },
                  {
                    key: 'ceiling',
                    label: 'Потолки',
                    children: p.ceilingHeightMm ? `${(p.ceilingHeightMm / 1000).toFixed(2)} м` : '2.70 м (примерно)',
                  },
                  { key: 'plan', label: 'Источник плана', children: d.plan.source ? PLAN_SOURCE_LABELS[d.plan.source].title : '—' },
                  { key: 'eng', label: 'Инженерные точки', children: d.engineering.length || 'не отмечены' },
                  { key: 'occ', label: OCCUPANTS_LABEL[d.goal ?? 'live'], children: occupantsSummary(d) },
                  {
                    key: 'level',
                    label: 'Глубина изменений',
                    children: d.wishes.interventionLevel ? INTERVENTION_LABELS[d.wishes.interventionLevel].title : '—',
                  },
                  {
                    key: 'wishes',
                    label: 'Пожелания',
                    children: [...d.wishes.goals.map((g) => WISH_GOAL_LABELS[g]), d.wishes.text.trim()].filter(Boolean).join('; ') || '—',
                  },
                  { key: 'style', label: 'Стиль', children: d.wishes.styles.map((s) => STYLE_LABELS[s]).join(', ') || '—' },
                  {
                    key: 'budget',
                    label: d.goal === 'sale' ? 'Бюджет подготовки' : 'Бюджет',
                    children: d.wishes.budget
                      ? `${money(d.wishes.budget.min)} – ${money(d.wishes.budget.max)} ${d.wishes.budget.currency}`
                      : 'не указан',
                  },
                  {
                    key: 'time',
                    label: 'Начало ремонта',
                    children: d.wishes.startTimeframe ? TIMEFRAME_LABELS[d.wishes.startTimeframe] : '—',
                  },
                ]}
              />
            </Card>
            <FinishesSummary draft={d} />
          </Space>
        </Col>
      </Row>

      <Alert
        type="info"
        showIcon
        title="Что дальше"
        description={
          <>
            <Typography.Paragraph style={{ marginBottom: 8 }}>
              Данные проекта сохранены в вашем браузере. Генерация вариантов планировки, визуализация выбранной отделки, 3D и смета — следующие этапы
              разработки прототипа. Вы можете уточнить данные сейчас: чем выше полнота, тем точнее будут варианты.
            </Typography.Paragraph>
            <Space wrap>
              <Button type="primary" icon={<EditOutlined />} onClick={() => void edit()}>Уточнить данные</Button>
              <Link to="/projects"><Button>Все проекты</Button></Link>
            </Space>
          </>
        }
      />
    </Space>
  );
}
