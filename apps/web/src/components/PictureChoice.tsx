import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { CheckCircleFilled } from '@ant-design/icons';
import { Col, Row, Typography } from 'antd';

export interface PictureOption<T extends string> {
  value: T;
  title: string;
  hint?: string;
  picture?: ReactNode;
}

type Props<T extends string> = {
  options: PictureOption<T>[];
  /** id подписи поля — для скринридеров. */
  labelledBy?: string;
} & (
  | { multiple?: false; value?: T; onChange: (value: T) => void }
  | { multiple: true; value: T[]; onChange: (value: T[]) => void }
);

/**
 * Карточки-картинки для выбора отделки: клиент нажимает на картинку, а не читает список.
 * Одиночный выбор — role="radio" со стрелками; множественный — role="checkbox".
 */
export function PictureChoice<T extends string>(props: Props<T>) {
  const { options, labelledBy } = props;
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const isSelected = (v: T) => (props.multiple ? props.value.includes(v) : props.value === v);

  const pick = (v: T) => {
    if (props.multiple) {
      props.onChange(props.value.includes(v) ? props.value.filter((x) => x !== v) : [...props.value, v]);
    } else {
      props.onChange(v);
    }
  };

  const activeIndex = props.multiple ? -1 : Math.max(0, options.findIndex((o) => o.value === props.value));

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const move = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (move && !props.multiple) {
      e.preventDefault();
      const next = (index + move + options.length) % options.length;
      const o = options[next];
      if (o) pick(o.value);
      refs.current[next]?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const o = options[index];
      if (o) pick(o.value);
    }
  };

  return (
    <Row gutter={[10, 10]} role={props.multiple ? 'group' : 'radiogroup'} aria-labelledby={labelledBy}>
      {options.map((o, i) => {
        const active = isSelected(o.value);
        return (
          <Col key={o.value} xs={12} sm={8} lg={6}>
            <div
              ref={(el) => {
                refs.current[i] = el;
              }}
              role={props.multiple ? 'checkbox' : 'radio'}
              aria-checked={active}
              tabIndex={props.multiple || i === activeIndex ? 0 : -1}
              onClick={() => pick(o.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              style={{
                position: 'relative',
                height: '100%',
                padding: 6,
                borderRadius: 10,
                cursor: 'pointer',
                border: `${active ? 2 : 1}px solid ${active ? '#1677ff' : '#d9d9d9'}`,
                background: active ? '#e6f4ff' : '#fff',
                outlineOffset: 2,
              }}
            >
              {active && (
                <CheckCircleFilled style={{ position: 'absolute', top: 10, right: 10, color: '#1677ff', fontSize: 18, background: '#fff', borderRadius: '50%' }} />
              )}
              {o.picture}
              {/* hyphens: длинные слова вроде «Комбинированный» переносятся с дефисом (lang="ru" у страницы) */}
              <div style={{ padding: '6px 2px 0', hyphens: 'auto', overflowWrap: 'break-word' }}>
                <Typography.Text strong style={{ fontSize: 13 }}>{o.title}</Typography.Text>
                {o.hint && (
                  <div style={{ lineHeight: 1.25 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>{o.hint}</Typography.Text>
                  </div>
                )}
              </div>
            </div>
          </Col>
        );
      })}
    </Row>
  );
}
