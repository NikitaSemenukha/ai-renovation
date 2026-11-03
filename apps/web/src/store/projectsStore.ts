import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createEmptyDraft, type Project, type ProjectDraft } from '@air/domain';
import { DEMO_PLAN } from '../demo/demoPlan';
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
      partialize: (s) => ({
        projects: s.projects,
        draft: s.draft,
        draftStep: s.draftStep,
        editingProjectId: s.editingProjectId,
      }),
    },
  ),
);
