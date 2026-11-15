import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button, Card, Flex, Grid, Modal, Popconfirm, Progress, Space, Steps, Typography } from 'antd';
import {
  WIZARD_STEPS,
  isDraftPristine,
  isStepComplete,
  missingRequiredSteps,
  stepMissing,
  type ProjectGoal,
  type WizardStepId,
} from '@air/domain';
import { PROPERTY_TYPE_LABELS } from '../../labels';
import { useProjects } from '../../store/projectsStore';
import { CompletenessMeter } from './CompletenessMeter';
import { DimensionsStep } from './steps/DimensionsStep';
import { EngineeringStep } from './steps/EngineeringStep';
import { FinishesStep } from './steps/FinishesStep';
import { GoalStep } from './steps/GoalStep';
import { OccupantsStep } from './steps/OccupantsStep';
import { PlanStep } from './steps/PlanStep';
import { PropertyStep } from './steps/PropertyStep';
import { WallsStep } from './steps/WallsStep';
import { WishesStep } from './steps/WishesStep';

const STEP_VIEWS: Record<WizardStepId, { question: string; Component: ComponentType }> = {
  goal: { question: 'Для чего ремонт?', Component: GoalStep },
  property: { question: 'Расскажите об объекте', Component: PropertyStep },
  plan: { question: 'Какой план у вас есть?', Component: PlanStep },
  dimensions: { question: 'Проверьте план', Component: DimensionsStep },
  walls: { question: 'Какие стены можно менять?', Component: WallsStep },
  engineering: { question: 'Где стояки, вентканалы и газ?', Component: EngineeringStep },
  occupants: { question: 'Кто будет жить?', Component: OccupantsStep }, // текст уточняется по цели ниже
  wishes: { question: 'Что хотите изменить?', Component: WishesStep },
  finishes: { question: 'Какая отделка в каждой комнате?', Component: FinishesStep },
};

/** Шаг «Жильцы» для сдачи и продажи спрашивает не о жильцах. */
const OCCUPANTS_QUESTION: Record<ProjectGoal, string> = {
  live: 'Кто будет жить?',
  rent_long: 'Кому будете сдавать?',
  rent_daily: 'Кто будет останавливаться?',
  sale: 'Кто ваш покупатель?',
};

const stepTitle = (id: WizardStepId) => WIZARD_STEPS.find((s) => s.id === id)?.title ?? id;

export function NewProjectWizard() {
  const navigate = useNavigate();
  const location = useLocation();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const draft = useProjects((s) => s.draft);
  const current = useProjects((s) => s.draftStep);
  const setCurrent = useProjects((s) => s.setDraftStep);
  const editingId = useProjects((s) => s.editingProjectId);
  const resetDraft = useProjects((s) => s.resetDraft);
  const saveDraft = useProjects((s) => s.saveDraft);
  const restorePreview = useProjects((s) => s.restoreDraftPreview);

  // Незаконченный черновик: спрашиваем, продолжить или начать заново (кроме перехода из «Редактировать»)
  const [askResume, setAskResume] = useState(() => !isDraftPristine(draft) && !location.state?.fromEdit);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    void restorePreview();
  }, [restorePreview]);

  // При смене шага — наверх и фокус на заголовок шага (клавиатура и скринридеры)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    titleRef.current?.focus({ preventScroll: true });
  }, [current]);

  const step = WIZARD_STEPS[current] ?? WIZARD_STEPS[0];
  const { Component } = STEP_VIEWS[step.id];
  const question = step.id === 'occupants' && draft.goal ? OCCUPANTS_QUESTION[draft.goal] : STEP_VIEWS[step.id].question;
  const missingHere = stepMissing(step.id, draft);
  const complete = missingHere.length === 0;
  const isLast = current === WIZARD_STEPS.length - 1;
  const missingSteps = missingRequiredSteps(draft);

  const handleSave = async () => {
    setSaving(true);
    const type = draft.property.propertyType ? PROPERTY_TYPE_LABELS[draft.property.propertyType] : 'Объект';
    const name = [type, draft.property.city?.trim()].filter(Boolean).join(', ');
    const id = await saveDraft(name);
    setSaving(false);
    navigate(`/projects/${id}`);
  };

  const stepStatus = (id: WizardStepId, i: number, required: boolean) => {
    if (i === current) return 'process' as const;
    if (isStepComplete(id, draft)) return 'finish' as const;
    // Обязательный шаг, который клиент уже прошёл мимо, — помечаем
    if (required && i < current) return 'error' as const;
    return 'wait' as const;
  };

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Flex justify="space-between" align="center" wrap gap={16}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {editingId ? 'Редактирование проекта' : 'Новый проект'}
        </Typography.Title>
        <Space size="large" wrap>
          <CompletenessMeter draft={draft} />
          <Popconfirm title="Начать заново? Введённые данные будут удалены." okText="Да" cancelText="Нет" onConfirm={resetDraft}>
            <Button type="text" danger>{editingId ? 'Отменить редактирование' : 'Сбросить'}</Button>
          </Popconfirm>
        </Space>
      </Flex>

      {isMobile ? (
        <div>
          <Typography.Text strong>
            Шаг {current + 1} из {WIZARD_STEPS.length}: {step.title}
          </Typography.Text>
          {!step.required && <Typography.Text type="secondary"> · по желанию</Typography.Text>}
          <Progress percent={((current + 1) / WIZARD_STEPS.length) * 100} showInfo={false} size="small" />
        </div>
      ) : (
        <Steps
          size="small"
          current={current}
          onChange={setCurrent}
          items={WIZARD_STEPS.map((s, i) => ({
            title: s.title,
            content: s.required ? undefined : 'по желанию',
            status: stepStatus(s.id, i, s.required),
          }))}
        />
      )}

      <Card
        // Длинный вопрос шага переносится на новую строку, а не обрезается многоточием (360 px)
        styles={{ title: { whiteSpace: 'normal', overflow: 'visible' } }}
        title={
          <h2 id="step-title" ref={titleRef} tabIndex={-1} style={{ margin: 0, fontSize: 16, outline: 'none' }}>
            {question}
          </h2>
        }
        extra={!step.required && !isMobile && <Typography.Text type="secondary">Можно пропустить</Typography.Text>}
      >
        {/* Шаги «Пожелания» и «Отделка» сами показывают свои конфликты */}
        <Component />
      </Card>

      {/* На телефоне кнопки закреплены внизу экрана: длинные шаги не нужно проматывать до конца */}
      <Flex justify="space-between" align="start" wrap gap={12}
        style={isMobile ? {
          position: 'sticky', bottom: 0, zIndex: 10, background: '#fff', padding: '10px 12px',
          margin: '0 -12px', boxShadow: '0 -2px 8px rgba(0,0,0,0.08)',
        } : undefined}>
        <Button disabled={current === 0} onClick={() => setCurrent(current - 1)}>Назад</Button>
        <Space orientation="vertical" align="end" size={4}>
          <Space wrap style={{ justifyContent: 'flex-end' }}>
            {!step.required && !complete && !isLast && <Button onClick={() => setCurrent(current + 1)}>Пропустить</Button>}
            {isLast ? (
              <Button type="primary" loading={saving} disabled={missingSteps.length > 0} onClick={() => void handleSave()}>
                {editingId ? 'Сохранить изменения' : 'Сохранить проект'}
              </Button>
            ) : (
              <Button type="primary" disabled={step.required && !complete} onClick={() => setCurrent(current + 1)}>Далее</Button>
            )}
          </Space>
          {/* Объясняем, почему кнопка неактивна */}
          {step.required && !complete && (
            <Typography.Text type="secondary" style={{ fontSize: 12, textAlign: 'right' }}>
              Чтобы продолжить: {missingHere.join(', ')}
            </Typography.Text>
          )}
          {isLast && missingSteps.length > 0 && (
            <Typography.Text type="secondary" style={{ fontSize: 12, textAlign: 'right' }}>
              Не заполнены шаги: {missingSteps.map(stepTitle).join(', ')}
            </Typography.Text>
          )}
        </Space>
      </Flex>

      <Modal
        open={askResume}
        title={editingId ? 'Продолжить редактирование проекта?' : 'У вас есть незаконченный проект'}
        closable={false}
        mask={{ closable: false }}
        footer={[
          <Popconfirm key="new"
            title={editingId ? 'Отменить несохранённые правки?' : 'Удалить незаконченный проект?'}
            description={editingId ? 'Сохранённая версия проекта не изменится.' : 'Введённые данные будут удалены.'}
            okText="Да" cancelText="Нет" onConfirm={() => { resetDraft(); setAskResume(false); }}>
            <Button>{editingId ? 'Отменить правки' : 'Начать заново'}</Button>
          </Popconfirm>,
          <Button key="continue" type="primary" onClick={() => setAskResume(false)}>
            Продолжить
          </Button>,
        ]}
      >
        {editingId
          ? `Есть несохранённые правки проекта. Продолжить с шага «${step.title}» или отменить правки? Сохранённая версия проекта при отмене не изменится.`
          : `Продолжить с шага «${step.title}» или начать новый проект с чистого листа?`}
      </Modal>
    </Space>
  );
}
