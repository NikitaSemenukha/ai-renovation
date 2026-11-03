import { InputNumber } from 'antd';
import type { SaleProfile } from '@air/domain';
import { ChoiceCards } from '../../../../components/ChoiceCards';
import { Field } from '../../../../components/Field';
import { YesNo } from '../../../../components/YesNo';
import { useDraft } from '../../useDraft';

type Buyer = NonNullable<SaleProfile['targetBuyer']>;

const BUYERS: { value: Buyer; title: string }[] = [
  { value: 'young_family', title: 'Молодая семья' },
  { value: 'investor', title: 'Инвестор' },
  { value: 'senior', title: 'Пенсионер' },
];

export function SaleForm() {
  const { draft, update } = useDraft();
  const s = draft.occupants.sale;
  const set = (recipe: (x: SaleProfile) => void) => update((d) => recipe(d.occupants.sale));

  return (
    <>
      <Field id="buyer" label="Целевой покупатель" required hint="акценты в визуализации">
        <ChoiceCards columns={3} labelledBy="buyer-label" value={s.targetBuyer} options={BUYERS}
          onChange={(v) => set((x) => void (x.targetBuyer = v))} />
      </Field>
      <Field id="prep-budget" label="Бюджет на предпродажную подготовку" hint="косметика или перепланировка">
        <InputNumber id="prep-budget" min={0} value={s.prepBudget} placeholder="Не знаю"
          onChange={(v) => set((x) => void (x.prepBudget = v ?? undefined))} style={{ width: 200 }} />
      </Field>
      <Field id="visuals" label="Нужны визуализации для объявления?" hint="набор «до/после» в нейтральном стиле">
        <YesNo labelledBy="visuals-label" value={s.needsListingVisuals} onChange={(v) => set((x) => void (x.needsListingVisuals = v))} />
      </Field>
    </>
  );
}
