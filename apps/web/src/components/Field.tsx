import type { ReactNode } from 'react';
import { Typography } from 'antd';

interface FieldProps {
  label: string;
  /**
   * id поля. Для одиночного контрола (Input, Select, InputNumber) передайте этот же id
   * в контрол — подпись станет <label for>. Для групп используйте `${id}-label` в aria-labelledby.
   */
  id: string;
  required?: boolean;
  /** Подсказка: на что влияет ответ. */
  hint?: string;
  /** Ошибка валидации — показывается вместо подсказки. */
  error?: string;
  children: ReactNode;
}

export function Field({ label, id, required, hint, error, children }: FieldProps) {
  return (
    <div style={{ marginBottom: 20 }} role="group" aria-labelledby={`${id}-label`}>
      <label id={`${id}-label`} htmlFor={id}>
        <Typography.Text strong>
          {label}
          {required && <Typography.Text type="danger"> *</Typography.Text>}
        </Typography.Text>
      </label>
      <div style={{ marginTop: 6 }}>{children}</div>
      {error ? (
        <Typography.Text type="danger" style={{ fontSize: 12 }} role="alert">
          {error}
        </Typography.Text>
      ) : (
        hint && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            → {hint}
          </Typography.Text>
        )
      )}
    </div>
  );
}
