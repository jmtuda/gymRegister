import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import type { PerformedSet } from '../src/domain/training.ts';
import {
  createEditInlineSetForm, createNewInlineSetForm, saveInlineSet,
} from '../src/features/training/inlineSetForm.ts';
import { numericLoadLabel } from '../src/features/shared/loadModePresentation.ts';

const context = {
  session_exercise_id: 'exercise-1', selected_laterality: 'UNILATERAL',
  dose_unit: 'reps' as const, load_mode: 'TOTAL_KG' as const,
};
const confirmed: PerformedSet = {
  id: 'set-1', sessionExerciseId: 'exercise-1', setIndex: 0,
  doseUnit: 'reps', doseValue: 10, perSide: true, loadMode: 'TOTAL_KG',
  loadValue: 52.5, loadLabel: null, rir: 2,
  confirmedAt: '2026-10-02T08:00:00.000Z', createdAt: '2026-10-02T08:00:00.000Z',
  updatedAt: '2026-10-02T08:00:00.000Z',
};

test('el formulario nuevo muestra escritos los defaults reutilizables', () => {
  assert.deepEqual(createNewInlineSetForm(context, {
    doseUnit: 'reps', doseValue: 10, perSide: true, loadMode: 'TOTAL_KG',
    loadValue: 52.5, loadLabel: null, rir: 2,
  }, 'attempt-1'), {
    attemptId: 'attempt-1', editingId: null, dose: '10', load: '52.5',
    loadLabel: '', rir: '2', perSide: true,
  });
});

test('confirmar crea una serie e indica que debe iniciarse el descanso', async () => {
  let received: unknown = null;
  const result = await saveInlineSet({
    async confirmSetWithStatus(input) { received = input; return { set: confirmed, created: true }; },
    async editSet() { throw new Error('no debe editar'); },
  }, 'exercise-1', createNewInlineSetForm(context, {
    doseUnit: 'reps', doseValue: 10, perSide: true, loadMode: 'TOTAL_KG',
    loadValue: 52.5, loadLabel: null, rir: 2,
  }, 'attempt-1'));
  assert.equal(result.set.id, confirmed.id);
  assert.equal(result.startRest, true);
  assert.deepEqual(received, {
    attemptId: 'attempt-1', sessionExerciseId: 'exercise-1', doseValue: 10,
    perSide: true, loadValue: 52.5, loadLabel: null, rir: 2,
  });
});

test('el siguiente formulario adopta los valores de la serie recién confirmada', () => {
  const next = createNewInlineSetForm(context, {
    doseUnit: confirmed.doseUnit, doseValue: confirmed.doseValue,
    perSide: confirmed.perSide, loadMode: confirmed.loadMode,
    loadValue: confirmed.loadValue, loadLabel: confirmed.loadLabel, rir: confirmed.rir,
  }, 'attempt-2');
  assert.deepEqual(
    [next.dose, next.load, next.loadLabel, next.rir, next.perSide, next.editingId],
    ['10', '52.5', '', '2', true, null],
  );
});

test('editar usa la misma zona, modifica la serie y no inicia descanso ni crea otra', async () => {
  let confirms = 0;
  let edits = 0;
  const form = { ...createEditInlineSetForm(confirmed), dose: '12' };
  const result = await saveInlineSet({
    async confirmSetWithStatus() { confirms += 1; return { set: confirmed, created: true }; },
    async editSet(input) { edits += 1; return { ...confirmed, doseValue: input.doseValue }; },
  }, 'exercise-1', form);
  assert.equal(confirms, 0);
  assert.equal(edits, 1);
  assert.equal(result.set.doseValue, 12);
  assert.equal(result.startRest, false);
});

test('preparar y descartar un formulario al cambiar de ejercicio no persiste un intento', () => {
  let persisted = 0;
  const firstDraft = createNewInlineSetForm(context, null, 'attempt-first');
  const typedDraft = { ...firstDraft, dose: '99', load: '250' };
  const secondDraft = createNewInlineSetForm({
    ...context, session_exercise_id: 'exercise-2', selected_laterality: 'BILATERAL',
  }, null, 'attempt-second');
  assert.equal(persisted, 0);
  assert.equal(typedDraft.attemptId, 'attempt-first');
  assert.deepEqual([secondDraft.dose, secondDraft.load, secondDraft.perSide], ['', '', false]);
  persisted += 0;
});

test('BODYWEIGHT y NONE no exponen entrada numérica y los cuatro modos conservan su etiqueta', () => {
  assert.equal(numericLoadLabel('BODYWEIGHT'), null);
  assert.equal(numericLoadLabel('NONE'), null);
  assert.deepEqual([
    numericLoadLabel('TOTAL_KG'), numericLoadLabel('IMPLEMENT_KG'),
    numericLoadLabel('DISPLAYED_KG'), numericLoadLabel('ASSISTANCE_KG'),
  ], [
    'kg totales', 'kg por implemento',
    'kg mostrados por máquina/polea', 'kg de asistencia',
  ]);
});

test('SessionExecutionScreen renderiza el formulario inline y conserva solo los otros modales', async () => {
  const source = await readFile('src/features/training/SessionExecutionScreen.tsx', 'utf8');
  assert.doesNotMatch(source, />Añadir serie</);
  assert.match(source, /styles\.inlineForm/);
  assert.match(source, /'Guardar cambios'/);
  assert.match(source, /'Serie terminada'/);
  assert.equal((source.match(/<Modal /g) ?? []).length, 2);
});
