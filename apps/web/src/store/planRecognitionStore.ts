import { create } from 'zustand';
import { DesignRequestError, planFilePayload, requestPlanRecognition } from '../features/design/api';
import { DRAFT_FILE_KEY, fileStore } from './fileStore';
import { useProjects } from './projectsStore';

export type RecognitionMode = 'file' | 'text';

interface PlanRecognitionState {
  loading: boolean;
  mode?: RecognitionMode;
  startedAt?: number;
  error?: string;
  /** Последний успешный результат — для уведомления в интерфейсе. */
  lastResult?: { rooms: number; openings: number; at: number };
  run: (mode: RecognitionMode, notes?: string) => Promise<void>;
  cancel: () => void;
  clearError: () => void;
}

let controller: AbortController | null = null;

/**
 * Распознавание плана живёт вне компонентов: запрос не теряется при переходе между шагами,
 * а шаги «План» и «Размеры» показывают один и тот же статус.
 */
export const usePlanRecognition = create<PlanRecognitionState>()((set, get) => ({
  loading: false,

  run: async (mode, notes) => {
    if (get().loading) controller?.abort();
    const ctrl = new AbortController();
    controller = ctrl;
    set({ loading: true, mode, startedAt: Date.now(), error: undefined });

    const { draft } = useProjects.getState();
    const fileName = draft.plan.fileName;
    try {
      let body: Parameters<typeof requestPlanRecognition>[0];
      if (mode === 'text') {
        body = { description: draft.plan.description?.trim() ?? '' };
      } else {
        const blob = await fileStore.get(DRAFT_FILE_KEY);
        if (!blob) throw new DesignRequestError('Файл плана не найден — загрузите его ещё раз.');
        body = { file: await planFilePayload(blob) };
      }
      if (notes?.trim()) body.notes = notes.trim();
      const res = await requestPlanRecognition(body, ctrl.signal);
      if (controller !== ctrl) return;
      // Пока шёл запрос, клиент загрузил другой файл — этот результат к нему не относится
      if (mode === 'file' && useProjects.getState().draft.plan.fileName !== fileName) return;
      useProjects.getState().applyRecognizedPlan(res.geometry, {
        at: new Date().toISOString(),
        model: res.model,
        uncertain: res.uncertain,
        issues: res.issues,
        ...(notes?.trim() ? { notes: notes.trim() } : {}),
      });
      set({ lastResult: { rooms: res.geometry.rooms.length, openings: res.geometry.openings.length, at: Date.now() } });
    } catch (err) {
      if (controller !== ctrl) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (!(err instanceof DesignRequestError)) console.error('[plan] recognize failed', err);
      set({ error: err instanceof DesignRequestError ? err.message : 'Не удалось распознать план. Попробуйте ещё раз.' });
    } finally {
      if (controller === ctrl) {
        controller = null;
        set({ loading: false });
      }
    }
  },

  cancel: () => {
    controller?.abort();
    controller = null;
    set({ loading: false });
  },

  clearError: () => set({ error: undefined }),
}));
