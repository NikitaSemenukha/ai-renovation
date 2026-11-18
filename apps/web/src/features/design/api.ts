import type { Catalog, PlanGeometry, ProjectDraft, RoomDesign } from '@air/domain';

/** Клиент API дизайна. Ключ ИИ — только на сервере (apps/server), сюда не попадает. */

export type AiStatus = 'configured' | 'missing_key' | 'offline';

export async function fetchAiStatus(): Promise<AiStatus> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return 'offline';
    const body = (await res.json()) as { ai?: AiStatus };
    return body.ai === 'configured' ? 'configured' : 'missing_key';
  } catch {
    return 'offline';
  }
}

export class DesignRequestError extends Error {}

export async function requestRoomDesign(draft: ProjectDraft, roomId: string, signal?: AbortSignal): Promise<RoomDesign> {
  let res: Response;
  try {
    res = await fetch('/api/design/room', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draft, roomId }),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    // Подсказка для разработчика — в консоли, клиенту — понятный текст
    console.warn('[design] API недоступен: запустите npm run dev:server', err);
    throw new DesignRequestError('Сервис дизайна сейчас недоступен. Попробуйте чуть позже.');
  }
  const body = (await res.json().catch(() => ({}))) as RoomDesign & { error?: string };
  if (!res.ok) {
    // Прокси отвечает 5xx без тела, если сервер дизайна не запущен
    if (!body.error && res.status >= 500) throw new DesignRequestError('Сервис дизайна сейчас недоступен. Попробуйте чуть позже.');
    throw new DesignRequestError(body.error ?? `Ошибка сервера (${res.status})`);
  }
  return body;
}

/** Каталог товаров для подписей, цен и ссылок; недоступен — дизайн показывается без них. */
export async function fetchCatalog(): Promise<Catalog | undefined> {
  try {
    const res = await fetch('/api/catalog');
    return res.ok ? ((await res.json()) as Catalog) : undefined;
  } catch {
    return undefined;
  }
}

// ---------- Распознавание плана ----------

export interface PlanRecognitionResponse {
  geometry: PlanGeometry;
  uncertain: string[];
  issues: string[];
  model: string;
}

type PlanFilePayload = { mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'; base64: string };

/** Длинная сторона картинки для ИИ: больше модель всё равно не разглядит, а запрос станет тяжёлым. */
const MAX_IMAGE_SIDE = 2400;
const MIN_IMAGE_SIDE = 1200;
const MAX_PDF_MB = 15;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Картинка уменьшается и пересохраняется в JPEG; PDF уходит как есть. */
export async function planFilePayload(file: Blob): Promise<PlanFilePayload> {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF_MB * 1024 * 1024) throw new DesignRequestError(`PDF больше ${MAX_PDF_MB} МБ — сохраните нужную страницу отдельно или сделайте скриншот плана.`);
    return { mediaType: 'application/pdf', base64: await blobToBase64(file) };
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new DesignRequestError('Не удалось открыть изображение. Загрузите JPG или PNG.');
  }
  // Мелкие картинки (скриншот с телефона, вырезка) увеличиваем: тонкие дуги дверей и окна ИИ видит лучше
  const side = Math.max(bitmap.width, bitmap.height);
  const scale = side < MIN_IMAGE_SIDE ? MIN_IMAGE_SIDE / side : Math.min(1, MAX_IMAGE_SIDE / side);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new DesignRequestError('Браузер не смог подготовить изображение.');
  ctx.fillStyle = '#ffffff'; // прозрачный PNG → белый фон
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
  if (!blob) throw new DesignRequestError('Браузер не смог подготовить изображение.');
  return { mediaType: 'image/jpeg', base64: await blobToBase64(blob) };
}

export async function requestPlanRecognition(
  body: { file?: PlanFilePayload; description?: string; notes?: string },
  signal?: AbortSignal,
): Promise<PlanRecognitionResponse> {
  let res: Response;
  try {
    res = await fetch('/api/plan/recognize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    console.warn('[plan] API недоступен: запустите npm run dev:server', err);
    throw new DesignRequestError('Сервис распознавания сейчас недоступен. Попробуйте чуть позже.');
  }
  const out = (await res.json().catch(() => ({}))) as PlanRecognitionResponse & { error?: string };
  if (!res.ok) {
    if (!out.error && res.status >= 500) throw new DesignRequestError('Сервис распознавания сейчас недоступен. Попробуйте чуть позже.');
    throw new DesignRequestError(out.error ?? `Ошибка сервера (${res.status})`);
  }
  return out;
}
