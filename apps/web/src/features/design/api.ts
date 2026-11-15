import type { Catalog, ProjectDraft, RoomDesign } from '@air/domain';

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
