import { useProjects } from '../../store/projectsStore';

/** Черновик проекта и функция его изменения — общий хук для шагов мастера. */
export function useDraft() {
  const draft = useProjects((s) => s.draft);
  const update = useProjects((s) => s.updateDraft);
  return { draft, update };
}
