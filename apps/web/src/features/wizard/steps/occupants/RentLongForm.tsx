import { InputNumber, Radio, Select, Space } from 'antd';
import type { RentLongProfile, TenantType } from '@air/domain';
import { ChoiceCards } from '../../../../components/ChoiceCards';
import { Field } from '../../../../components/Field';
import { YesNo } from '../../../../components/YesNo';
import { CURRENCIES, LAYOUT_PREF_LABELS, TENANT_LABELS, defaultCurrency } from '../../../../labels';
import { useDraft } from '../../useDraft';

const TENANTS = (Object.keys(TENANT_LABELS) as TenantType[]).map((value) => ({ value, title: TENANT_LABELS[value] }));
const LAYOUTS = Object.keys(LAYOUT_PREF_LABELS) as NonNullable<RentLongProfile['layoutPreference']>[];

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
          options={LAYOUTS.map((value) => ({ value, label: LAYOUT_PREF_LABELS[value] }))} />
      </Field>
      <Field id="rent" label="Ожидаемая ставка аренды в месяц" hint="расчёт окупаемости ремонта">
        <Space.Compact>
          <InputNumber id="rent" min={0} value={r.expectedMonthlyRent} placeholder="Не знаю" inputMode="numeric"
            onChange={(v) => set((x) => {
              x.expectedMonthlyRent = v ?? undefined;
              x.rentCurrency ??= defaultCurrency(draft.property.country);
            })} style={{ width: 170 }} />
          <Select aria-label="Валюта ставки" style={{ width: 90 }}
            value={r.rentCurrency ?? defaultCurrency(draft.property.country)}
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            onChange={(c) => set((x) => void (x.rentCurrency = c))} />
        </Space.Compact>
      </Field>
      <Field id="furnished" label="Сдавать с мебелью?" hint="смета и список мебели">
        <YesNo labelledBy="furnished-label" value={r.furnished} onChange={(v) => set((x) => void (x.furnished = v))} />
      </Field>
    </>
  );
}
