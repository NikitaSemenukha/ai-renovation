import type { ProjectGoal } from '@air/domain';
import { ChoiceCards } from '../../../components/ChoiceCards';
import { GOAL_LABELS } from '../../../labels';
import { useDraft } from '../useDraft';

const GOALS = Object.keys(GOAL_LABELS) as ProjectGoal[];

export function GoalStep() {
  const { draft, update } = useDraft();
  return (
    <ChoiceCards
      columns={2}
      labelledBy="step-title"
      value={draft.goal}
      onChange={(goal) => update((d) => void (d.goal = goal))}
      options={GOALS.map((g) => ({ value: g, ...GOAL_LABELS[g] }))}
    />
  );
}
