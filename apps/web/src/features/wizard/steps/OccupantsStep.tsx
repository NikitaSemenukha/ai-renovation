import { Alert } from 'antd';
import { useDraft } from '../useDraft';
import { LiveForm } from './occupants/LiveForm';
import { RentDailyForm } from './occupants/RentDailyForm';
import { RentLongForm } from './occupants/RentLongForm';
import { SaleForm } from './occupants/SaleForm';

/** Набор вопросов зависит от цели, выбранной на шаге 0. */
export function OccupantsStep() {
  const { draft } = useDraft();
  switch (draft.goal) {
    case 'live':
      return <LiveForm />;
    case 'rent_long':
      return <RentLongForm />;
    case 'rent_daily':
      return <RentDailyForm />;
    case 'sale':
      return <SaleForm />;
    default:
      return <Alert type="warning" showIcon title="Сначала выберите цель проекта на шаге «Цель»" />;
  }
}
