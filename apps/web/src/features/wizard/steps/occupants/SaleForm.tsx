import { Typography } from 'antd';
import type { SaleProfile } from '@air/domain';
import { ChoiceCards } from '../../../../components/ChoiceCards';
import { Field } from '../../../../components/Field';
import { YesNo } from '../../../../components/YesNo';
import { BUYER_LABELS } from '../../../../labels';
import { useDraft } from '../../useDraft';

type Buyer = NonNullable<SaleProfile['targetBuyer']>;

const BUYERS = (Object.keys(BUYER_LABELS) as Buyer[]).map((value) => ({ value, title: BUYER_LABELS[value] }));

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
      <Field id="visuals" label="Нужны визуализации для объявления?" hint="набор «до/после» в нейтральном стиле">
        <YesNo labelledBy="visuals-label" value={s.needsListingVisuals} onChange={(v) => set((x) => void (x.needsListingVisuals = v))} />
      </Field>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        Бюджет на предпродажную подготовку укажете на шаге «Пожелания» — один раз, с валютой.
      </Typography.Paragraph>
    </>
  );
}
