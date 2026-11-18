import { useEffect, useRef, useState } from 'react';
import { ScanOutlined } from '@ant-design/icons';
import { Alert, App, Button, Flex, Spin, Typography } from 'antd';
import { usePlanRecognition } from '../../store/planRecognitionStore';
import { useDraft } from '../wizard/useDraft';

interface Props {
  /** file — по загруженному файлу; text — по описанию квартиры словами. */
  mode: 'file' | 'text';
  /** Уточнения клиента к прошлому результату («кухня 3,40, а не 3,04»). */
  notes?: string;
  label: string;
  /** Вторичная кнопка — для повторного распознавания. */
  secondary?: boolean;
}

/** Кнопка распознавания плана ИИ с таймером и отменой. Сам запрос — в usePlanRecognition. */
export function PlanRecognizer({ mode, notes, label, secondary }: Props) {
  const { draft } = useDraft();
  const { message } = App.useApp();
  const { loading, mode: runningMode, startedAt, error, lastResult, run, cancel, clearError } = usePlanRecognition();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!loading || !startedAt) return;
    const tick = () => setElapsed(Math.round((Date.now() - startedAt) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [loading, startedAt]);

  // Уведомление о готовности — один раз на результат, даже если кнопок на экране несколько
  const shownResult = useRef(lastResult?.at);
  useEffect(() => {
    if (!lastResult || shownResult.current === lastResult.at) return;
    shownResult.current = lastResult.at;
    message.success({
      key: 'plan-recognized',
      content: `План готов: ${lastResult.rooms} помещ., ${lastResult.openings} дверей и окон. Проверьте его на шаге «Размеры».`,
    });
  }, [lastResult, message]);

  const description = draft.plan.description?.trim() ?? '';
  const disabled = mode === 'text' ? description.length < 20 : !draft.plan.fileName;

  return (
    <Flex vertical gap={8}>
      {loading ? (
        <Flex align="center" gap={12} wrap>
          <Spin />
          <Typography.Text>
            Claude {runningMode === 'text' ? 'строит план по описанию' : 'читает план'}… {elapsed} с (обычно 1–2 минуты)
          </Typography.Text>
          <Button size="small" onClick={cancel}>Отменить</Button>
        </Flex>
      ) : (
        <Flex align="center" gap={12} wrap>
          <Button type={secondary ? 'default' : 'primary'} icon={<ScanOutlined />} disabled={disabled} onClick={() => void run(mode, notes)}>
            {label}
          </Button>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Платный запрос к ИИ, около 1–2 минут
          </Typography.Text>
        </Flex>
      )}
      {error && !loading && <Alert type="error" showIcon title={error} closable={{ onClose: clearError }} />}
    </Flex>
  );
}
