import { Radio } from 'antd';

interface YesNoProps {
  value?: boolean;
  onChange: (value: boolean) => void;
  /** id подписи поля для скринридеров. */
  labelledBy?: string;
}

/** «Да / Нет» без значения по умолчанию: важно отличать «не ответил» от «нет». */
export function YesNo({ value, onChange, labelledBy }: YesNoProps) {
  return (
    <Radio.Group
      optionType="button"
      aria-labelledby={labelledBy}
      value={value}
      onChange={(e) => onChange(e.target.value as boolean)}
      options={[
        { label: 'Да', value: true },
        { label: 'Нет', value: false },
      ]}
    />
  );
}
