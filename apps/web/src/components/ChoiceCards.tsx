import { useRef, type KeyboardEvent } from 'react';
import { Card, Col, Row, Typography } from 'antd';

interface ChoiceCardsProps<T extends string> {
  options: { value: T; title: string; hint?: string }[];
  value?: T;
  onChange: (value: T) => void;
  /** Колонок на широком экране. */
  columns?: 2 | 3 | 4;
  /** id подписи поля — для скринридеров. */
  labelledBy?: string;
}

/**
 * Крупные карточки выбора — удобнее радиокнопок, особенно на телефоне.
 * Доступность: role="radiogroup"/"radio", выбор Enter/Пробелом, стрелки переключают вариант.
 */
export function ChoiceCards<T extends string>({ options, value, onChange, columns = 2, labelledBy }: ChoiceCardsProps<T>) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const activeIndex = Math.max(0, options.findIndex((o) => o.value === value));

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const move = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (move) {
      e.preventDefault();
      const next = (index + move + options.length) % options.length;
      const option = options[next];
      if (option) onChange(option.value);
      refs.current[next]?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const option = options[index];
      if (option) onChange(option.value);
    }
  };

  return (
    <Row gutter={[12, 12]} role="radiogroup" aria-labelledby={labelledBy}>
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <Col key={o.value} xs={24} sm={12} lg={24 / columns}>
            <div
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="radio"
              aria-checked={active}
              tabIndex={i === activeIndex ? 0 : -1}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              style={{ height: '100%', borderRadius: 8, outlineOffset: 2 }}
            >
              <Card
                hoverable
                size="small"
                style={{
                  height: '100%',
                  borderColor: active ? '#1677ff' : undefined,
                  background: active ? '#e6f4ff' : undefined,
                  borderWidth: active ? 2 : 1,
                }}
              >
                <Typography.Text strong>{o.title}</Typography.Text>
                {o.hint && (
                  <div>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {o.hint}
                    </Typography.Text>
                  </div>
                )}
              </Card>
            </div>
          </Col>
        );
      })}
    </Row>
  );
}
