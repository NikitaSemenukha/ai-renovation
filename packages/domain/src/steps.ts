export const WIZARD_STEPS = [
  { id: 'goal', title: 'Цель', required: true },
  { id: 'property', title: 'Объект', required: true },
  { id: 'plan', title: 'План', required: true },
  { id: 'dimensions', title: 'Размеры', required: true },
  { id: 'walls', title: 'Стены', required: false },
  { id: 'engineering', title: 'Инженерка', required: false },
  { id: 'occupants', title: 'Жильцы', required: true },
  { id: 'wishes', title: 'Пожелания', required: true },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]['id'];
