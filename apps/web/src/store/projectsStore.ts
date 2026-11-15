import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createEmptyDraft, createFinishes, type Project, type ProjectDraft } from '@air/domain';
import { DEMO_PLAN } from '../demo/demoPlan';
import { defaultCurrency } from '../labels';
import { DRAFT_FILE_KEY, fileStore, logFileError, projectFileKey } from './fileStore';

/**
 * Локальное хранилище прототипа: данные проектов — в localStorage, файлы планов — в IndexedDB.
 * На следующем этапе заменяется на API бэкенда — интерфейс стора останется тем же.
 */
interface ProjectsState {
  projects: Project[];
  draft: ProjectDraft;
  draftStep: number;
  /** Если задан — мастер редактирует существующий проект, а не создаёт новый. */
  editingProjectId?: string;
  /** Превью загруженного файла — object URL, живёт только в памяти. */
  planPreviewUrl?: string;
  updateDraft: (recipe: (d: ProjectDraft) => void) => void;
  setDraftStep: (step: number) => void;
  setPlanFile: (file?: File) => Promise<void>;
  restoreDraftPreview: () => Promise<void>;
  resetDraft: () => void;
  startEditing: (projectId: string) => Promise<void>;
  saveDraft: (name: string) => Promise<string>;
  deleteProject: (id: string) => void;
}

const newDraft = () => createEmptyDraft(DEMO_PLAN);

/**
 * Миграция v0 → v1: в геометрию добавлены проёмы (окна/двери), в черновик — отделка.
 * Демо-план получает размеченные проёмы; для остальных проёмы неизвестны.
 */
/**
 * Миграция v1 → v2: у продажи был отдельный «бюджет подготовки» без валюты.
 * Теперь бюджет один — `wishes.budget`; старое значение переносим, если бюджет не задан.
 */
function migrateSaleBudget(d: ProjectDraft): ProjectDraft {
  const { prepBudget, ...sale } = d.occupants.sale;
  const budget =
    d.wishes.budget ?? (prepBudget ? { min: 0, max: prepBudget, currency: defaultCurrency(d.property.country) } : undefined);
  return { ...d, occupants: { ...d.occupants, sale }, wishes: { ...d.wishes, budget } };
}

function migrateDraft(d: ProjectDraft): ProjectDraft {
  const geometry = d.geometry.openings
    ? d.geometry
    : { ...d.geometry, openings: d.geometry.source === 'demo' ? structuredClone(DEMO_PLAN.openings) : [] };
  return { ...d, geometry, finishes: d.finishes ?? createFinishes(geometry) };
}
const isImage = (type?: string) => Boolean(type?.startsWith('image/'));

export const useProjects = create<ProjectsState>()(
  persist(
    (set, get) => {
      const setPreview = (blob?: Blob) => {
        const prev = get().planPreviewUrl;
        if (prev) URL.revokeObjectURL(prev);
        set({ planPreviewUrl: blob && isImage(blob.type) ? URL.createObjectURL(blob) : undefined });
      };

      return {
        projects: [],
        draft: newDraft(),
        draftStep: 0,

        updateDraft: (recipe) => {
          const next = structuredClone(get().draft);
          recipe(next);
          set({ draft: next });
        },

        setDraftStep: (draftStep) => set({ draftStep }),

        setPlanFile: async (file) => {
          get().updateDraft((d) => {
            d.plan.fileName = file?.name;
            d.plan.fileType = file?.type;
            d.plan.dimensionsConfirmed = false;
          });
          setPreview(file);
          try {
            if (file) await fileStore.put(DRAFT_FILE_KEY, file);
            else await fileStore.remove(DRAFT_FILE_KEY);
          } catch (err) {
            logFileError('save draft file', err);
          }
        },

        restoreDraftPreview: async () => {
          const { draft, planPreviewUrl } = get();
          if (!draft.plan.fileName || planPreviewUrl) return;
          try {
            setPreview(await fileStore.get(DRAFT_FILE_KEY));
          } catch (err) {
            logFileError('restore draft file', err);
          }
        },

        resetDraft: () => {
          setPreview(undefined);
          set({ draft: newDraft(), draftStep: 0, editingProjectId: undefined });
          fileStore.remove(DRAFT_FILE_KEY).catch((err) => logFileError('remove draft file', err));
        },

        startEditing: async (projectId) => {
          const project = get().projects.find((p) => p.id === projectId);
          if (!project) return;
          setPreview(undefined);
          set({ draft: structuredClone(project.data), draftStep: 0, editingProjectId: projectId });
          try {
            await fileStore.copy(projectFileKey(projectId), DRAFT_FILE_KEY);
            await get().restoreDraftPreview();
          } catch (err) {
            logFileError('load project file', err);
          }
        },

        saveDraft: async (name) => {
          const { draft, editingProjectId, projects } = get();
          const existing = editingProjectId ? projects.find((p) => p.id === editingProjectId) : undefined;
          const project: Project = existing
            ? { ...existing, name, data: structuredClone(draft) }
            : { id: crypto.randomUUID(), name, createdAt: new Date().toISOString(), data: structuredClone(draft) };

          set((s) => ({
            projects: existing ? s.projects.map((p) => (p.id === project.id ? project : p)) : [project, ...s.projects],
          }));
          try {
            await fileStore.copy(DRAFT_FILE_KEY, projectFileKey(project.id));
          } catch (err) {
            logFileError('save project file', err);
          }
          get().resetDraft();
          return project.id;
        },

        deleteProject: (id) => {
          set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
          fileStore.remove(projectFileKey(id)).catch((err) => logFileError('remove project file', err));
        },
      };
    },
    {
      // v2: изменилась модель (комнаты с контурами, коды стилей) — старые данные прототипа не переносим
      name: 'air-projects-v2',
      version: 2,
      migrate: (persisted, version) => {
        const s = persisted as Pick<ProjectsState, 'projects' | 'draft' | 'draftStep' | 'editingProjectId'>;
        if (version < 1) {
          s.draft = migrateDraft(s.draft);
          s.projects = s.projects.map((p) => ({ ...p, data: migrateDraft(p.data) }));
        }
        if (version < 2) {
          s.draft = migrateSaleBudget(s.draft);
          s.projects = s.projects.map((p) => ({ ...p, data: migrateSaleBudget(p.data) }));
        }
        return s;
      },
      partialize: (s) => ({
        projects: s.projects,
        draft: s.draft,
        draftStep: s.draftStep,
        editingProjectId: s.editingProjectId,
      }),
    },
  ),
);
