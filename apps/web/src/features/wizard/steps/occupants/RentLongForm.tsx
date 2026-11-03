import { InputNumber, Radio } from 'antd';
import type { RentLongProfile, TenantType } from '@air/domain';
import { ChoiceCards } from '../../../../components/ChoiceCards';
import { Field } from '../../../../components/Field';
import { YesNo } from '../../../../components/YesNo';
import { useDraft } from '../../useDraft';

const TENANTS: { value: TenantType; title: string }[] = [
  { value: 'students', title: 'Студенты' },
  { value: 'couple', title: 'Пара' },
  { value: 'family', title: 'Семья' },
  { value: 'remote_worker', title: 'Удалёнщик' },
  { value: 'expats', title: 'Экспаты' },
];

export function RentLongForm() {
  const { draft, update } = useDraft();
  const r = draft.occupants.rentLong;
  const set = (recipe: (x: RentLongProfile) => void) => update((d) => recipe(d.occupants.rentLong));

  return (
    <>
      <Field id="target-tenant" label="Целевой арендатор" required hint="стиль, число комнат, рабочее место">
        <ChoiceCards columns={4} labelledBy="target-tenant-label" value={r.targetTenant} options={TENANTS}
          onChange={(v) => set((x) => void (x.targetTenant = v))} />
      </Field>
      <Field id="layout-pref" label="Что важнее" hint="например, евро-двушка из однокомнатной">
        <Radio.Group optionType="button" aria-labelledby="layout-pref-label" value={r.layoutPreference}
          onChange={(e) => set((x) => void (x.layoutPreference = e.target.value as RentLongProfile['layoutPreference']))}
          options={[{ label: 'Максимум комнат', value: 'max_rooms' }, { label: 'Просторная гостиная', value: 'spacious_living' }]} />
      </Field>
      <Field id="rent" label="Ожидаемая ставка аренды в месяц" hint="расчёт окупаемости ремонта">
        <InputNumber id="rent" min={0} value={r.expectedMonthlyRent} placeholder="Не знаю"
          onChange={(v) => set((x) => void (x.expectedMonthlyRent = v ?? undefined))} style={{ width: 200 }} />
      </Field>
      <Field id="furnished" label="Сдавать с мебелью?" hint="смета и список мебели">
        <YesNo labelledBy="furnished-label" value={r.furnished} onChange={(v) => set((x) => void (x.furnished = v))} />
      </Field>
    </>
  );
}
