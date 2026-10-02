import type {
  EditSetInput, ReusableSetDefaults, SetValues,
} from '../../data/sessionExecutionRepository.ts';
import type { DoseUnit, LoadMode, PerformedSet } from '../../domain/training.ts';

export type InlineSetContext = {
  session_exercise_id: string;
  selected_laterality: string | null;
  dose_unit: DoseUnit;
  load_mode: LoadMode;
};

export type InlineSetForm = {
  attemptId: string;
  editingId: string | null;
  dose: string;
  load: string;
  loadLabel: string;
  rir: string;
  perSide: boolean;
};

type InlineSetRepository = {
  confirmSetWithStatus(input: SetValues & {
    attemptId: string;
    sessionExerciseId: string;
  }): Promise<{ set: PerformedSet; created: boolean }>;
  editSet(input: EditSetInput): Promise<PerformedSet>;
};

const canBePerSide = (context: InlineSetContext) => (
  context.selected_laterality === 'UNILATERAL'
  || context.selected_laterality === 'ALTERNATING'
);

export function createNewInlineSetForm(
  context: InlineSetContext,
  defaults: ReusableSetDefaults | null,
  attemptId: string,
): InlineSetForm {
  return {
    attemptId,
    editingId: null,
    dose: defaults ? String(defaults.doseValue) : '',
    load: defaults?.loadValue === null || defaults?.loadValue === undefined
      ? '' : String(defaults.loadValue),
    loadLabel: defaults?.loadLabel ?? '',
    rir: defaults?.rir === null || defaults?.rir === undefined ? '' : String(defaults.rir),
    perSide: defaults?.perSide ?? canBePerSide(context),
  };
}

export function createEditInlineSetForm(value: PerformedSet): InlineSetForm {
  return {
    attemptId: value.id,
    editingId: value.id,
    dose: String(value.doseValue),
    load: value.loadValue === null ? '' : String(value.loadValue),
    loadLabel: value.loadLabel ?? '',
    rir: value.rir === null ? '' : String(value.rir),
    perSide: value.perSide,
  };
}

export function valuesFromInlineSetForm(form: InlineSetForm): SetValues {
  return {
    doseValue: Number(form.dose),
    perSide: form.perSide,
    loadValue: form.load === '' ? null : Number(form.load),
    loadLabel: form.loadLabel || null,
    rir: form.rir === '' ? null : Number(form.rir),
  };
}

export async function saveInlineSet(
  repository: InlineSetRepository,
  sessionExerciseId: string,
  form: InlineSetForm,
): Promise<{ set: PerformedSet; startRest: boolean }> {
  const values = valuesFromInlineSetForm(form);
  if (form.editingId) {
    return {
      set: await repository.editSet({
        ...values,
        setId: form.editingId,
        sessionExerciseId,
      }),
      startRest: false,
    };
  }
  const result = await repository.confirmSetWithStatus({
    ...values,
    attemptId: form.attemptId,
    sessionExerciseId,
  });
  return { set: result.set, startRest: result.created };
}
