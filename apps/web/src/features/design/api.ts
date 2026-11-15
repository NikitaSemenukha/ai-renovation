import type { ProjectDraft, RoomDesign } from '@air/domain';

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
    throw new DesignRequestError('Сервер недоступен. Запустите его командой npm run dev:server.');
  }
  const body = (await res.json().catch(() => ({}))) as RoomDesign & { error?: string };
  if (!res.ok) throw new DesignRequestError(body.error ?? `Ошибка сервера (${res.status})`);
  return body;
}
