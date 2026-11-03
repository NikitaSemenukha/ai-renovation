import { InputNumber, Radio } from 'antd';
import type { RentDailyProfile } from '@air/domain';
import { Field } from '../../../../components/Field';
import { YesNo } from '../../../../components/YesNo';
import { useDraft } from '../../useDraft';

export function RentDailyForm() {
  const { draft, update } = useDraft();
  const r = draft.occupants.rentDaily;
  const set = (recipe: (x: RentDailyProfile) => void) => update((d) => recipe(d.occupants.rentDaily));

  return (
    <>
      <Field id="sleeping" label="Сколько спальных мест нужно" required hint="расстановка, мебель-трансформер">
        <InputNumber id="sleeping" precision={0} min={1} max={20} value={r.sleepingPlaces}
          onChange={(v) => set((x) => void (x.sleepingPlaces = v ?? 1))} />
      </Field>
      <Field id="guest-type" label="Кто основные гости" hint="стиль, рабочий стол">
        <Radio.Group optionType="button" aria-labelledby="guest-type-label" value={r.guestType}
          onChange={(e) => set((x) => void (x.guestType = e.target.value as RentDailyProfile['guestType']))}
          options={[{ label: 'Пары', value: 'couples' }, { label: 'Семьи', value: 'families' }, { label: 'Командировочные', value: 'business' }]} />
      </Field>
      <Field id="owner-storage" label="Нужно закрытое хранение для хозяина?" hint="запираемый шкаф">
        <YesNo labelledBy="owner-storage-label" value={r.ownerStorage} onChange={(v) => set((x) => void (x.ownerStorage = v))} />
      </Field>
      <Field id="turnover" label="Уборка между гостями за несколько часов?" hint="материалы, минимум декора">
        <YesNo labelledBy="turnover-label" value={r.fastTurnover} onChange={(v) => set((x) => void (x.fastTurnover = v))} />
      </Field>
    </>
  );
}
