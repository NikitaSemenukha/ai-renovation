import { CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Checkbox, Col, InputNumber, Radio, Row, Space } from 'antd';
import { fieldErrors, type Amount, type Frequency, type TriState } from '@air/domain';
import { Field } from '../../../../components/Field';
import { YesNo } from '../../../../components/YesNo';
import { useDraft } from '../../useDraft';

const FREQ = [
  { label: 'Редко', value: 'rarely' },
  { label: 'Иногда', value: 'sometimes' },
  { label: 'Часто', value: 'often' },
];

export function LiveForm() {
  const { draft, update } = useDraft();
  const l = draft.occupants.live;
  const set = (recipe: (live: typeof l) => void) => update((d) => recipe(d.occupants.live));
  const workersError = fieldErrors(draft)['occupants.live.remoteWorkers'];

  return (
    <Row gutter={24}>
      <Col xs={24} md={12}>
        <Field id="adults" label="Сколько взрослых" required hint="количество спален и санузлов">
          <InputNumber id="adults" precision={0} min={1} max={12} value={l.adults} placeholder="—"
            onChange={(v) => set((x) => void (x.adults = v ?? undefined))} />
        </Field>

        <Field id="children" label="Дети и возраст каждого" hint="через 3–5 лет может понадобиться отдельная комната">
          <Space wrap>
            {l.childrenAges.map((age, i) => (
              <Space.Compact key={i}>
                <InputNumber aria-label={`Возраст ребёнка ${i + 1}`} precision={0} min={0} max={25} value={age} suffix="лет"
                  style={{ width: 100 }} onChange={(v) => set((x) => void (x.childrenAges[i] = v ?? 0))} />
                <Button icon={<CloseOutlined />} aria-label={`Удалить ребёнка ${i + 1}`}
                  onClick={() => set((x) => void x.childrenAges.splice(i, 1))} />
              </Space.Compact>
            ))}
            <Button id="children" icon={<PlusOutlined />} onClick={() => set((x) => void x.childrenAges.push(5))}>
              Ребёнок
            </Button>
          </Space>
        </Field>

        <Field id="planning-children" label="Планируете детей в ближайшие годы?" hint="резервная комната">
          <Radio.Group optionType="button" aria-labelledby="planning-children-label" value={l.planningChildren}
            onChange={(e) => set((x) => void (x.planningChildren = e.target.value as TriState))}
            options={[{ label: 'Да', value: 'yes' }, { label: 'Нет', value: 'no' }, { label: 'Не знаю', value: 'unknown' }]} />
        </Field>

        <Field id="mobility" label="Есть пожилые или люди с ограниченной подвижностью?" hint="ширина проходов, пороги, душ без поддона">
          <YesNo labelledBy="mobility-label" value={l.limitedMobility} onChange={(v) => set((x) => void (x.limitedMobility = v))} />
        </Field>

        <Field id="remote-workers" label="Сколько человек работает из дома" hint="рабочие зоны" error={workersError}>
          <InputNumber id="remote-workers" precision={0} min={0} value={l.remoteWorkers} status={workersError ? 'error' : undefined}
            onChange={(v) => set((x) => void (x.remoteWorkers = v ?? undefined))} />
        </Field>

        {(l.remoteWorkers ?? 0) > 0 && (
          <Field id="quiet" label="Нужна тишина для созвонов?" hint="рабочее место за отдельной дверью">
            <YesNo labelledBy="quiet-label" value={l.needsQuietForCalls} onChange={(v) => set((x) => void (x.needsQuietForCalls = v))} />
          </Field>
        )}
      </Col>

      <Col xs={24} md={12}>
        <Field id="pets" label="Домашние животные" hint="материалы, место для лотка или лежанки">
          <Checkbox.Group aria-labelledby="pets-label" value={l.pets} onChange={(v) => set((x) => void (x.pets = v as string[]))}
            options={[{ label: 'Кошка', value: 'cat' }, { label: 'Собака', value: 'dog' }, { label: 'Другое', value: 'other' }]} />
        </Field>

        <Field id="cooking" label="Как часто готовите" hint="размер кухни, остров, вытяжка">
          <Radio.Group optionType="button" aria-labelledby="cooking-label" value={l.cooking} options={FREQ}
            onChange={(e) => set((x) => void (x.cooking = e.target.value as Frequency))} />
        </Field>

        <Field id="guests" label="Гости с ночёвкой" hint="диван-трансформер или гостевая">
          <Radio.Group optionType="button" aria-labelledby="guests-label" value={l.overnightGuests} options={FREQ}
            onChange={(e) => set((x) => void (x.overnightGuests = e.target.value as Frequency))} />
        </Field>

        <Field id="storage" label="Сколько нужно хранения" hint="гардеробная, кладовая">
          <Radio.Group optionType="button" aria-labelledby="storage-label" value={l.storageNeed}
            onChange={(e) => set((x) => void (x.storageNeed = e.target.value as Amount))}
            options={[{ label: 'Мало', value: 'small' }, { label: 'Средне', value: 'medium' }, { label: 'Много', value: 'large' }]} />
        </Field>

        {/* Вопрос про пару имеет смысл только при двух и более взрослых */}
        {(l.adults ?? 0) >= 2 && (
          <Field id="separate-sleep" label="Разный график сна у пары?" hint="две спальни вместо одной большой">
            <YesNo labelledBy="separate-sleep-label" value={l.separateSleep} onChange={(v) => set((x) => void (x.separateSleep = v))} />
          </Field>
        )}
      </Col>
    </Row>
  );
}
