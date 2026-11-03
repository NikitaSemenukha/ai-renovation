import { Col, Input, InputNumber, Radio, Row, Select, Space, Tag } from 'antd';
import { fieldErrors, findConflicts, type InterventionLevel, type StyleCode, type Timeframe, type WishGoal } from '@air/domain';
import { ChoiceCards } from '../../../components/ChoiceCards';
import { Field } from '../../../components/Field';
import { IssuesList } from '../../../components/IssuesList';
import { INTERVENTION_LABELS, STYLE_LABELS, TIMEFRAME_LABELS, WISH_GOAL_LABELS } from '../../../labels';
import { useDraft } from '../useDraft';

const GOALS = Object.keys(WISH_GOAL_LABELS) as WishGoal[];
const LEVELS = Object.keys(INTERVENTION_LABELS) as InterventionLevel[];
const STYLES = Object.keys(STYLE_LABELS) as StyleCode[];
const TIMEFRAMES = Object.keys(TIMEFRAME_LABELS) as Timeframe[];
const CURRENCIES = ['UAH', 'USD', 'EUR'];

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
/** 500000 → «500 000» */
const formatMoney = (v?: string | number) => (v === undefined || v === '' ? '' : String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
const parseMoney = (v?: string) => Number((v ?? '').replace(/\s/g, '')) || 0;

function defaultCurrency(country?: string) {
  const c = country?.trim().toLowerCase() ?? '';
  return c.startsWith('укр') || c.startsWith('ukr') ? 'UAH' : 'USD';
}

export function WishesStep() {
  const { draft, update } = useDraft();
  const w = draft.wishes;
  const budgetError = fieldErrors(draft)['wishes.budget'];
  const conflicts = findConflicts(draft);

  return (
    <>
      <Field id="intervention" label="Насколько глубоко меняем" required hint="чем глубже — тем больше предупреждений и проверок специалистом">
        <ChoiceCards columns={3} labelledBy="intervention-label" value={w.interventionLevel}
          onChange={(v) => update((d) => void (d.wishes.interventionLevel = v))}
          options={LEVELS.map((v) => ({ value: v, ...INTERVENTION_LABELS[v] }))} />
      </Field>

      <Field id="wish-text" label="Что хотите получить" required hint="выберите хотя бы одну цель или опишите своими словами">
        <Space wrap role="group" aria-labelledby="wish-text-label">
          {GOALS.map((g) => (
            <Tag.CheckableTag key={g} checked={w.goals.includes(g)} style={{ padding: '4px 10px', fontSize: 14 }}
              onChange={() => update((d) => void (d.wishes.goals = toggle(d.wishes.goals, g)))}>
              {WISH_GOAL_LABELS[g]}
            </Tag.CheckableTag>
          ))}
        </Space>
        <Input.TextArea id="wish-text" style={{ marginTop: 10 }} rows={3} value={w.text} maxLength={1000} showCount
          placeholder="Например: хочу кухню-гостиную, гардеробную и рабочее место у окна"
          onChange={(e) => update((d) => void (d.wishes.text = e.target.value))} />
      </Field>

      <Field id="styles" label="Стиль" hint="в следующей версии — выбор 3 понравившихся фото из 12">
        <Space wrap role="group" aria-labelledby="styles-label">
          {STYLES.map((s) => (
            <Tag.CheckableTag key={s} checked={w.styles.includes(s)} style={{ padding: '4px 10px', fontSize: 14 }}
              onChange={() => update((d) => void (d.wishes.styles = toggle(d.wishes.styles, s)))}>
              {STYLE_LABELS[s]}
            </Tag.CheckableTag>
          ))}
        </Space>
      </Field>

      <Field
        id="budget"
        label="Бюджет ремонта"
        hint={w.budget ? undefined : 'покажем варианты в разных ценовых уровнях'}
        error={budgetError}
      >
        <Space orientation="vertical">
          <Radio.Group
            optionType="button"
            aria-labelledby="budget-label"
            value={w.budget ? 'known' : 'unknown'}
            onChange={(e) =>
              update((d) => {
                d.wishes.budget =
                  e.target.value === 'known' ? { min: 0, max: 0, currency: defaultCurrency(d.property.country) } : undefined;
              })
            }
            options={[
              { value: 'unknown', label: 'Не знаю' },
              { value: 'known', label: 'Укажу сумму' },
            ]}
          />
          {w.budget && (
            <Row gutter={[8, 8]}>
              <Col>
                <InputNumber<number> aria-label="Бюджет от" min={0} value={w.budget.min} prefix="от" style={{ width: 170 }}
                  formatter={formatMoney} parser={parseMoney} status={budgetError ? 'error' : undefined}
                  onChange={(v) => update((d) => void (d.wishes.budget && (d.wishes.budget.min = v ?? 0)))} />
              </Col>
              <Col>
                <InputNumber<number> id="budget" aria-label="Бюджет до" min={0} value={w.budget.max} prefix="до" style={{ width: 170 }}
                  formatter={formatMoney} parser={parseMoney} status={budgetError ? 'error' : undefined}
                  onChange={(v) => update((d) => void (d.wishes.budget && (d.wishes.budget.max = v ?? 0)))} />
              </Col>
              <Col>
                <Select aria-label="Валюта" value={w.budget.currency} style={{ width: 90 }}
                  options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                  onChange={(c) => update((d) => void (d.wishes.budget && (d.wishes.budget.currency = c)))} />
              </Col>
            </Row>
          )}
        </Space>
      </Field>

      <Field id="timeframe" label="Когда планируете начать ремонт">
        <Select<Timeframe> id="timeframe" allowClear value={w.startTimeframe} placeholder="Выберите" style={{ width: 240 }}
          onChange={(v) => update((d) => void (d.wishes.startTimeframe = v))}
          options={TIMEFRAMES.map((v) => ({ value: v, label: TIMEFRAME_LABELS[v] }))} />
      </Field>

      <IssuesList conflicts={conflicts} title={conflicts.length ? 'Проверка пожеланий' : undefined} />
    </>
  );
}
