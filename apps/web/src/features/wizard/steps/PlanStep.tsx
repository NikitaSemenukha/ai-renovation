import { useState } from 'react';
import { InboxOutlined } from '@ant-design/icons';
import { Alert, App, Input, Typography, Upload } from 'antd';
import type { PlanSource } from '@air/domain';
import { ChoiceCards } from '../../../components/ChoiceCards';
import { PlanRecognizer } from '../../plan/PlanRecognizer';
import { FILE_PLAN_SOURCES, PLAN_SOURCE_LABELS } from '../../../labels';
import { useProjects } from '../../../store/projectsStore';
import { usePlanRecognition } from '../../../store/planRecognitionStore';
import { useDraft } from '../useDraft';

const SOURCES = Object.keys(PLAN_SOURCE_LABELS) as PlanSource[];
const MAX_FILE_MB = 20;
const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/** Проверка файла плана: фильтр диалога выбора — только подсказка, его легко обойти. */
function fileProblem(file: File): string | undefined {
  const name = file.name.toLowerCase();
  if (name.endsWith('.heic') || name.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif') {
    return 'Формат HEIC (фото с iPhone) пока не поддерживается. Сохраните фото как JPG: в iPhone — «Настройки → Камера → Форматы → Наиболее совместимый», или сделайте скриншот плана.';
  }
  if (!ACCEPTED_TYPES.includes(file.type)) return 'Этот тип файла не подходит. Загрузите PDF, JPG, PNG или WebP.';
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `Файл больше ${MAX_FILE_MB} МБ`;
  return undefined;
}

export function PlanStep() {
  const { draft, update } = useDraft();
  const { message } = App.useApp();
  const previewUrl = useProjects((s) => s.planPreviewUrl);
  const setPlanFile = useProjects((s) => s.setPlanFile);
  const runRecognition = usePlanRecognition((s) => s.run);
  const { source, fileName, fileType } = draft.plan;
  const needsFile = source !== undefined && FILE_PLAN_SOURCES.includes(source);
  const [brokenPreview, setBrokenPreview] = useState<string>();
  const recognized = draft.geometry.source !== 'demo' && draft.plan.recognition;
  const recognizedNote = recognized && (
    <Alert
      type="success"
      showIcon
      title={`План построен: ${draft.geometry.rooms.length} помещ. — ${draft.geometry.rooms.map((r) => r.name).join(', ')}`}
      description="Сверьте его с оригиналом на следующем шаге «Размеры» — там же можно попросить исправить ошибки."
    />
  );

  return (
    <>
      <ChoiceCards
        columns={3}
        labelledBy="step-title"
        value={source}
        onChange={(v) => update((d) => void (d.plan.source = v))}
        options={SOURCES.map((v) => ({ value: v, ...PLAN_SOURCE_LABELS[v] }))}
      />

      {needsFile && (
        <div style={{ marginTop: 20 }}>
          <Upload.Dragger
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            multiple={false}
            showUploadList={false}
            beforeUpload={(file) => {
              const problem = fileProblem(file);
              if (problem) {
                message.error({ content: problem, duration: 6 });
                return Upload.LIST_IGNORE;
              }
              setBrokenPreview(undefined);
              // Сразу распознаём: иначе клиент жмёт «Далее» и видит демо-план вместо своей квартиры
              void setPlanFile(file).then(() => runRecognition('file'));
              return false; // файл хранится в браузере; на сервер уходит только для распознавания
            }}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">
              {fileName ? `Загружен: ${fileName}. Нажмите, чтобы заменить` : 'Перетащите файл сюда или нажмите, чтобы выбрать'}
            </p>
            <p className="ant-upload-hint">PDF, JPG, PNG или WebP до {MAX_FILE_MB} МБ</p>
          </Upload.Dragger>
          {previewUrl && brokenPreview !== previewUrl && (
            <img src={previewUrl} alt="Загруженный план" style={{ marginTop: 12, maxWidth: '100%', maxHeight: 320, borderRadius: 8 }}
              onError={() => setBrokenPreview(previewUrl)} />
          )}
          {previewUrl && brokenPreview === previewUrl && (
            <Alert style={{ marginTop: 12 }} type="error" showIcon title="Не удалось открыть изображение"
              description="Файл, похоже, повреждён или сохранён в неподдерживаемом формате. Загрузите другой файл плана." />
          )}
          {fileName && fileType === 'application/pdf' && (
            <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
              PDF сохранён. Если в нём несколько страниц, распознаётся страница с планом квартиры.
            </Typography.Paragraph>
          )}
          {fileName && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {recognizedNote}
              <PlanRecognizer mode="file" label={recognized ? 'Распознать заново' : 'Распознать план'} secondary={Boolean(recognized)} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Файл отправляется на сервер только для распознавания и там не сохраняется. Лучше всего читаются техпаспорт и план застройщика с подписанными размерами.
              </Typography.Text>
            </div>
          )}
        </div>
      )}

      {source === 'manual' && (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input.TextArea
            rows={6}
            maxLength={4000}
            showCount
            value={draft.plan.description ?? ''}
            onChange={(e) => update((d) => void (d.plan.description = e.target.value))}
            placeholder={'Например: двухкомнатная, 52 м². Вход в коридор 1,8×4 м. Слева кухня 3,5×3 м с окном, за ней гостиная 4×4,5 м. Справа санузел совмещённый 2×2,2 м и спальня 3,6×4 м с окном на балкон. Стена между кухней и гостиной — перегородка.'}
          />
          {recognizedNote}
          <PlanRecognizer mode="text" label={recognized ? 'Построить заново' : 'Построить план'} secondary={Boolean(recognized)} />
        </div>
      )}

      {source === 'none' && (
        <Alert
          style={{ marginTop: 20 }}
          type="warning"
          showIcon
          title="Как сделать замер"
          description={
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              1. Нарисуйте от руки схему квартиры. 2. Рулеткой или лазерным дальномером измерьте длину каждой стены по полу.
              3. Отметьте двери, окна и толщину стен в проёмах. 4. Сфотографируйте схему и вернитесь к этому шагу.
              Или выберите «Описать словами» и перечислите комнаты с размерами — план построим по описанию.
              Без плана дальше используется демо-квартира.
            </Typography.Paragraph>
          }
        />
      )}
    </>
  );
}
