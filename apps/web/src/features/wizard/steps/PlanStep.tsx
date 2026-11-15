import { useState } from 'react';
import { InboxOutlined } from '@ant-design/icons';
import { Alert, App, Typography, Upload } from 'antd';
import type { PlanSource } from '@air/domain';
import { ChoiceCards } from '../../../components/ChoiceCards';
import { FILE_PLAN_SOURCES, PLAN_SOURCE_LABELS } from '../../../labels';
import { useProjects } from '../../../store/projectsStore';
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
  const { source, fileName, fileType } = draft.plan;
  const needsFile = source !== undefined && FILE_PLAN_SOURCES.includes(source);
  const [brokenPreview, setBrokenPreview] = useState<string>();

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
              void setPlanFile(file);
              return false; // на сервер не отправляем: бэкенда пока нет
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
              PDF сохранён. Превью PDF появится вместе с распознаванием.
            </Typography.Paragraph>
          )}
          <Alert
            style={{ marginTop: 12 }}
            type="info"
            showIcon
            title="Прототип: файл хранится только в вашем браузере"
            description="Автоматическое распознавание стен, дверей и размеров будет добавлено на следующем этапе. Пока дальше используется демо-план."
          />
        </div>
      )}

      {source === 'manual' && (
        <Alert style={{ marginTop: 20 }} type="info" showIcon title="Ручной редактор плана — следующий этап"
          description="Пока для прохождения мастера используется демо-план." />
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
              Пока для прохождения мастера используется демо-план.
            </Typography.Paragraph>
          }
        />
      )}
    </>
  );
}
