import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { useSQLiteContext } from 'expo-sqlite';

import { createUuid } from '../../domain/id.ts';
import type { PerformedSet, SessionExercise, TrainingSession } from '../../domain/training.ts';
import { createHistoryRepository } from '../../data/historyRepository.ts';
import { createManualSessionRepository } from '../../data/manualSessionRepository.ts';
import { createSessionExecutionRepository } from '../../data/sessionExecutionRepository.ts';
import { labelForOption } from '../exercises/catalogPresentation.ts';
import { numericLoadLabel } from '../shared/loadModePresentation.ts';
import {
  createEditInlineSetForm, createNewInlineSetForm, saveInlineSet, type InlineSetForm,
} from './inlineSetForm.ts';
import { INITIAL_REST_TIMER, isRestTimerActive, restTimerReducer } from './restTimer.ts';

type Props = {
  session: TrainingSession;
  items: SessionExercise[];
  onAddExercise: () => void;
  onRefresh: () => Promise<void>;
  onCompleted: () => Promise<void>;
};
type Context = Awaited<ReturnType<ReturnType<typeof createSessionExecutionRepository>['getExecutionContext']>>;
const DOSE_LABELS = { reps: 'Repeticiones', seconds: 'Segundos', meters: 'Metros' };
const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

function formatSet(value: PerformedSet) {
  const dose = `${value.doseValue} ${value.doseUnit === 'reps' ? 'reps' : value.doseUnit === 'seconds' ? 's' : 'm'}`;
  const load = value.loadValue !== null ? `${value.loadValue} kg` : value.loadLabel;
  return [dose, value.perSide ? 'por lado' : null, load, value.rir !== null ? `RIR ${value.rir}` : null]
    .filter(Boolean).join(' · ');
}

function ActiveRestKeepAwake() {
  useKeepAwake('gymregister-active-rest', { suppressDeactivateWarnings: true });
  return null;
}

export function SessionExecutionScreen({ session, items, onAddExercise, onRefresh, onCompleted }: Props) {
  const database = useSQLiteContext();
  const execution = useMemo(() => createSessionExecutionRepository(database), [database]);
  const sessions = useMemo(() => createManualSessionRepository(database), [database]);
  const history = useMemo(() => createHistoryRepository(database), [database]);
  const [sets, setSets] = useState<Record<string, PerformedSet[]>>({});
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  const activeIdRef = useRef(activeId);
  const [context, setContext] = useState<Context | null>(null);
  const [form, setForm] = useState<InlineSetForm | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finalNote, setFinalNote] = useState(session.note ?? '');
  const [finishing, setFinishing] = useState(false);
  const [timer, dispatchTimer] = useReducer(restTimerReducer, INITIAL_REST_TIMER);

  const loadSets = useCallback(async () => {
    try {
      const entries = await Promise.all(items.map(async (item) => [item.id, await execution.listSets(item.id)] as const));
      setSets(Object.fromEntries(entries));
    } catch (reason) {
      Alert.alert('No se pudieron cargar las series', reason instanceof Error ? reason.message : 'Error inesperado.');
    }
  }, [execution, items]);
  useEffect(() => { void loadSets(); }, [loadSets]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => {
    if (activeId && items.some((item) => item.id === activeId)) return;
    setActiveId(items[0]?.id ?? null);
  }, [activeId, items]);
  useEffect(() => {
    if (!timer.running) return undefined;
    const interval = setInterval(() => dispatchTimer({ type: 'sync' }), 250);
    return () => clearInterval(interval);
  }, [timer.running]);

  const prepareNewSet = useCallback(async (item: SessionExercise) => {
    try {
      const value = await execution.getExecutionContext(item.id);
      const defaults = await execution.getReusableSetDefaults(item.id);
      if (activeIdRef.current !== item.id) return;
      setContext(value);
      setForm(createNewInlineSetForm(value, defaults, createUuid()));
    } catch (reason) { Alert.alert('No se pudo preparar la serie', reason instanceof Error ? reason.message : 'Error inesperado.'); }
  }, [execution]);
  useEffect(() => {
    const item = items.find((candidate) => candidate.id === activeId);
    if (!item) { setContext(null); setForm(null); return; }
    setContext(null);
    setForm(null);
    void prepareNewSet(item);
  }, [activeId, items, prepareNewSet]);

  const activateExercise = (item: SessionExercise) => {
    if (item.id === activeId) return;
    activeIdRef.current = item.id;
    setContext(null);
    setForm(null);
    setActiveId(item.id);
  };
  const openEditSet = async (item: SessionExercise, value: PerformedSet) => {
    try {
      const currentContext = await execution.getExecutionContext(item.id);
      setContext({ ...currentContext, dose_unit: value.doseUnit, load_mode: value.loadMode });
      setForm(createEditInlineSetForm(value));
    } catch (reason) { Alert.alert('No se pudo editar la serie', reason instanceof Error ? reason.message : 'Error inesperado.'); }
  };
  const saveSet = async () => {
    if (!form || !context || submitting) return;
    setSubmitting(true);
    try {
      const item = items.find((candidate) => candidate.id === context.session_exercise_id);
      const result = await saveInlineSet(execution, context.session_exercise_id, form);
      await loadSets();
      if (item) await prepareNewSet(item);
      if (result.startRest) dispatchTimer({ type: 'start', seconds: 60 });
    } catch (reason) { Alert.alert('No se pudo guardar', reason instanceof Error ? reason.message : 'Error inesperado.'); }
    finally { setSubmitting(false); }
  };
  const deleteSet = (item: SessionExercise, value: PerformedSet) => Alert.alert(
    'Eliminar serie', `¿Eliminar la serie ${value.setIndex + 1}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => void (async () => {
        try { await execution.deleteSet(item.id, value.id); await loadSets(); }
        catch (reason) { Alert.alert('No se pudo eliminar', reason instanceof Error ? reason.message : 'Error inesperado.'); }
      })() },
    ],
  );
  const saveNote = async (item: SessionExercise, note: string) => {
    try { await execution.updateExerciseNote(item.id, note); await onRefresh(); }
    catch (reason) { Alert.alert('No se pudo guardar la nota', reason instanceof Error ? reason.message : 'Error inesperado.'); }
  };
  const move = async (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= items.length || items.length === 0) return;
    const ids = items.map((item) => item.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try { await sessions.reorderExercises(items[index].sessionId, ids); await onRefresh(); }
    catch (reason) { Alert.alert('No se pudo reordenar', reason instanceof Error ? reason.message : 'Error inesperado.'); }
  };
  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      await history.completeSession(session.id, finalNote);
      setFinishOpen(false);
      await onCompleted();
    } catch (reason) {
      Alert.alert('No se pudo finalizar', reason instanceof Error ? reason.message : 'Error inesperado.');
    } finally { setFinishing(false); }
  };

  return (
    <>
      {isRestTimerActive(timer) && <ActiveRestKeepAwake />}
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable style={styles.primaryButton} onPress={onAddExercise}><Text style={styles.primaryButtonText}>Añadir ejercicio</Text></Pressable>
        {items.map((item, index) => {
          const active = activeId === item.id;
          return (
            <Pressable key={item.id} style={[styles.exerciseCard, active && styles.exerciseCardActive]} onPress={() => activateExercise(item)}>
              <View style={styles.exerciseHeader}>
                <View style={styles.exerciseTitleArea}><Text style={styles.exerciseTitle}>{index + 1}. {item.exerciseNameSnapshot}</Text><Text style={styles.configuration}>{item.configurationNameSnapshot}</Text><Text style={styles.selection}>{[item.selectedEquipment, item.selectedLaterality, item.selectedGrip, item.selectedGripWidth].filter(Boolean).map((value) => labelForOption(String(value))).join(' · ')}</Text></View>
                <View style={styles.orderButtons}><Pressable disabled={index === 0} onPress={() => void move(index, -1)}><Text style={[styles.arrow, index === 0 && styles.disabled]}>↑</Text></Pressable><Pressable disabled={index === items.length - 1} onPress={() => void move(index, 1)}><Text style={[styles.arrow, index === items.length - 1 && styles.disabled]}>↓</Text></Pressable></View>
              </View>
              {active && <View style={styles.exerciseBody}>
                {(sets[item.id] ?? []).map((value) => <View key={value.id} style={styles.setRow}><View style={styles.setText}><Text style={styles.setTitle}>Serie {value.setIndex + 1}</Text><Text style={styles.setDetail}>{formatSet(value)}</Text></View><Pressable onPress={() => void openEditSet(item, value)}><Text style={styles.link}>Editar</Text></Pressable><Pressable onPress={() => deleteSet(item, value)}><Text style={styles.danger}>Eliminar</Text></Pressable></View>)}
                {(sets[item.id] ?? []).length === 0 && <Text style={styles.empty}>Sin series confirmadas.</Text>}
                {form && context?.session_exercise_id === item.id ? <View style={styles.inlineForm}>
                  <Text style={styles.formTitle}>{form.editingId ? 'Editar serie' : `Serie ${(sets[item.id] ?? []).length + 1}`}</Text>
                  <Text style={styles.label}>{DOSE_LABELS[context.dose_unit]}</Text><TextInput keyboardType="decimal-pad" style={styles.input} value={form.dose} onChangeText={(dose) => setForm((old) => old && ({ ...old, dose }))} />
                  {numericLoadLabel(context.load_mode) && <><Text style={styles.label}>{numericLoadLabel(context.load_mode)}</Text><TextInput keyboardType="decimal-pad" style={styles.input} value={form.load} onChangeText={(load) => setForm((old) => old && ({ ...old, load }))} /></>}
                  {context.load_mode === 'BAND_LABEL' && <><Text style={styles.label}>Banda / resistencia</Text><TextInput style={styles.input} value={form.loadLabel} placeholder="Roja, fuerte, banda 25 kg…" onChangeText={(loadLabel) => setForm((old) => old && ({ ...old, loadLabel }))} /></>}
                  {(context.selected_laterality === 'UNILATERAL' || context.selected_laterality === 'ALTERNATING') && <Pressable style={styles.toggle} onPress={() => setForm((old) => old && ({ ...old, perSide: !old.perSide }))}><Text style={styles.toggleText}>{form.perSide ? '✓' : '○'} Por lado</Text></Pressable>}
                  <Text style={styles.label}>RIR (opcional, 0–5)</Text><TextInput keyboardType="number-pad" style={styles.input} value={form.rir} onChangeText={(rir) => setForm((old) => old && ({ ...old, rir }))} />
                  <View style={form.editingId ? styles.editActions : undefined}>
                    <Pressable disabled={submitting} style={[styles.primaryButton, form.editingId && styles.editPrimaryButton, submitting && styles.disabledButton]} onPress={() => void saveSet()}><Text style={styles.primaryButtonText}>{submitting ? 'Guardando…' : form.editingId ? 'Guardar cambios' : 'Serie terminada'}</Text></Pressable>
                    {form.editingId ? <Pressable disabled={submitting} style={styles.cancelButton} onPress={() => void prepareNewSet(item)}><Text style={styles.link}>Cancelar</Text></Pressable> : null}
                  </View>
                </View> : <Text style={styles.empty}>Preparando siguiente serie…</Text>}
                <Text style={styles.noteLabel}>Nota del ejercicio</Text>
                <TextInput style={styles.noteInput} defaultValue={item.note ?? ''} placeholder="Nota opcional…" placeholderTextColor="#94a3b8" onEndEditing={(event) => void saveNote(item, event.nativeEvent.text)} />
              </View>}
            </Pressable>
          );
        })}
        <Pressable style={styles.finishButton} onPress={() => setFinishOpen(true)}><Text style={styles.finishButtonText}>Finalizar sesión</Text></Pressable>
      </ScrollView>

      <Modal visible={isRestTimerActive(timer)} animationType="fade" onRequestClose={() => dispatchTimer({ type: 'cancel' })}>
        <SafeAreaView style={styles.restScreen}>
          <Text style={styles.restTitle}>Descanso</Text>
          <Text accessibilityLabel={`${timer.remaining} segundos restantes`} style={styles.restValue}>{formatTime(timer.remaining)}</Text>
          <View style={styles.restAdjustments}>
            <Pressable style={styles.restAdjustButton} onPress={() => dispatchTimer({ type: 'adjust', seconds: -15 })}><Text style={styles.restAdjustText}>−15 s</Text></Pressable>
            <Pressable style={styles.restAdjustButton} onPress={() => dispatchTimer({ type: 'adjust', seconds: 15 })}><Text style={styles.restAdjustText}>+15 s</Text></Pressable>
          </View>
          <Pressable style={styles.skipRestButton} onPress={() => dispatchTimer({ type: 'cancel' })}><Text style={styles.skipRestText}>Cerrar / Omitir descanso</Text></Pressable>
        </SafeAreaView>
      </Modal>

      <Modal visible={finishOpen} transparent animationType="fade" onRequestClose={() => setFinishOpen(false)}>
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Finalizar sesión</Text>
            <Text style={styles.confirmText}>La sesión quedará cerrada y aparecerá en Historial.</Text>
            <Text style={styles.label}>Nota final (opcional)</Text>
            <TextInput
              multiline style={[styles.input, styles.finalNote]} value={finalNote}
              placeholder="Añade una nota sobre la sesión…" placeholderTextColor="#94a3b8"
              onChangeText={setFinalNote}
            />
            <View style={styles.confirmActions}>
              <Pressable disabled={finishing} onPress={() => setFinishOpen(false)}><Text style={styles.link}>Cancelar</Text></Pressable>
              <Pressable disabled={finishing} style={[styles.finishConfirm, finishing && styles.disabledButton]} onPress={() => void finish()}>
                <Text style={styles.finishButtonText}>{finishing ? 'Finalizando…' : 'Confirmar finalización'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, padding: 16, paddingBottom: 48 },
  restScreen: { alignItems: 'center', backgroundColor: '#083344', flex: 1, justifyContent: 'center', padding: 24 },
  restTitle: { color: '#cffafe', fontSize: 28, fontWeight: '800' }, restValue: { color: '#fff', fontSize: 88, fontVariant: ['tabular-nums'], fontWeight: '900', marginVertical: 30 },
  restAdjustments: { flexDirection: 'row', gap: 18 }, restAdjustButton: { backgroundColor: '#155e75', borderRadius: 16, paddingHorizontal: 28, paddingVertical: 18 }, restAdjustText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  skipRestButton: { borderColor: '#67e8f9', borderRadius: 12, borderWidth: 1, marginTop: 40, paddingHorizontal: 20, paddingVertical: 14 }, skipRestText: { color: '#cffafe', fontSize: 16, fontWeight: '700' },
  primaryButton: { alignItems: 'center', backgroundColor: '#0e7490', borderRadius: 12, padding: 14 }, primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' }, exerciseCard: { backgroundColor: '#fff', borderColor: '#e2e8f0', borderRadius: 16, borderWidth: 1, padding: 14 }, exerciseCardActive: { borderColor: '#0891b2', borderWidth: 2 }, exerciseHeader: { alignItems: 'center', flexDirection: 'row' }, exerciseTitleArea: { flex: 1 }, exerciseTitle: { color: '#0f172a', fontSize: 17, fontWeight: '800' }, configuration: { color: '#475569', marginTop: 3 }, selection: { color: '#0e7490', fontSize: 12, marginTop: 5 }, orderButtons: { flexDirection: 'row', gap: 14, marginLeft: 10 }, arrow: { color: '#0e7490', fontSize: 22, fontWeight: '800' }, disabled: { color: '#cbd5e1' }, exerciseBody: { borderTopColor: '#e2e8f0', borderTopWidth: 1, marginTop: 12, paddingTop: 10 }, setRow: { alignItems: 'center', borderBottomColor: '#f1f5f9', borderBottomWidth: 1, flexDirection: 'row', gap: 12, paddingVertical: 10 }, setText: { flex: 1 }, setTitle: { color: '#0f172a', fontWeight: '700' }, setDetail: { color: '#64748b', fontSize: 13, marginTop: 3 }, link: { color: '#0e7490', fontWeight: '700' }, danger: { color: '#b91c1c', fontWeight: '700' }, empty: { color: '#64748b', paddingVertical: 10 }, inlineForm: { backgroundColor: '#f8fafc', borderColor: '#bae6fd', borderRadius: 12, borderWidth: 1, marginTop: 12, padding: 12 }, formTitle: { color: '#0f172a', fontSize: 16, fontWeight: '800' }, editActions: { alignItems: 'center', flexDirection: 'row', gap: 16, marginTop: 12 }, editPrimaryButton: { flex: 1 }, cancelButton: { padding: 12 }, noteLabel: { color: '#334155', fontWeight: '700', marginTop: 14 }, noteInput: { borderColor: '#cbd5e1', borderRadius: 10, borderWidth: 1, color: '#0f172a', marginTop: 7, padding: 10 },
  finishButton: { alignItems: 'center', backgroundColor: '#b91c1c', borderRadius: 12, marginTop: 8, padding: 15 }, finishButtonText: { color: '#fff', fontWeight: '800' },
  label: { color: '#334155', fontWeight: '700', marginBottom: 7, marginTop: 12 }, input: { backgroundColor: '#fff', borderColor: '#cbd5e1', borderRadius: 10, borderWidth: 1, color: '#0f172a', fontSize: 17, padding: 12 }, toggle: { backgroundColor: '#e2e8f0', borderRadius: 10, marginTop: 18, padding: 12 }, toggleText: { color: '#334155', fontWeight: '700' }, disabledButton: { opacity: 0.5 },
  confirmBackdrop: { backgroundColor: 'rgba(15, 23, 42, 0.5)', flex: 1, justifyContent: 'center', padding: 22 }, confirmCard: { backgroundColor: '#fff', borderRadius: 18, padding: 20 }, confirmTitle: { color: '#0f172a', fontSize: 22, fontWeight: '800' }, confirmText: { color: '#64748b', lineHeight: 21, marginTop: 7 }, finalNote: { minHeight: 84, textAlignVertical: 'top' }, confirmActions: { alignItems: 'center', flexDirection: 'row', gap: 18, justifyContent: 'flex-end', marginTop: 18 }, finishConfirm: { backgroundColor: '#b91c1c', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
});
