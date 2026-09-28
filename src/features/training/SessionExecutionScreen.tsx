import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import {
  Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';

import { createUuid } from '../../domain/id.ts';
import type { PerformedSet, SessionExercise, LoadMode } from '../../domain/training.ts';
import { createManualSessionRepository } from '../../data/manualSessionRepository.ts';
import { createSessionExecutionRepository } from '../../data/sessionExecutionRepository.ts';
import { labelForOption } from '../exercises/catalogPresentation.ts';
import { INITIAL_REST_TIMER, restTimerReducer } from './restTimer.ts';

type Props = { items: SessionExercise[]; onAddExercise: () => void; onRefresh: () => Promise<void> };
type Context = Awaited<ReturnType<ReturnType<typeof createSessionExecutionRepository>['getExecutionContext']>>;
type SetForm = {
  attemptId: string; editingId: string | null; dose: string; load: string;
  loadLabel: string; rir: string; perSide: boolean;
};

const LOAD_LABELS: Partial<Record<LoadMode, string>> = {
  TOTAL_KG: 'kg totales', IMPLEMENT_KG: 'kg por implemento',
  DISPLAYED_KG: 'kg mostrados por máquina/polea', ASSISTANCE_KG: 'kg de asistencia',
};
const DOSE_LABELS = { reps: 'Repeticiones', seconds: 'Segundos', meters: 'Metros' };
const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

function formatSet(value: PerformedSet) {
  const dose = `${value.doseValue} ${value.doseUnit === 'reps' ? 'reps' : value.doseUnit === 'seconds' ? 's' : 'm'}`;
  const load = value.loadValue !== null ? `${value.loadValue} kg` : value.loadLabel;
  return [dose, value.perSide ? 'por lado' : null, load, value.rir !== null ? `RIR ${value.rir}` : null]
    .filter(Boolean).join(' · ');
}

export function SessionExecutionScreen({ items, onAddExercise, onRefresh }: Props) {
  const database = useSQLiteContext();
  const execution = useMemo(() => createSessionExecutionRepository(database), [database]);
  const sessions = useMemo(() => createManualSessionRepository(database), [database]);
  const [sets, setSets] = useState<Record<string, PerformedSet[]>>({});
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  const [context, setContext] = useState<Context | null>(null);
  const [form, setForm] = useState<SetForm | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [timer, dispatchTimer] = useReducer(restTimerReducer, INITIAL_REST_TIMER);

  const loadSets = useCallback(async () => {
    const entries = await Promise.all(items.map(async (item) => [item.id, await execution.listSets(item.id)] as const));
    setSets(Object.fromEntries(entries));
  }, [execution, items]);
  useEffect(() => { void loadSets(); }, [loadSets]);
  useEffect(() => {
    if (activeId && items.some((item) => item.id === activeId)) return;
    setActiveId(items[0]?.id ?? null);
  }, [activeId, items]);
  useEffect(() => {
    if (!timer.running) return undefined;
    const interval = setInterval(() => dispatchTimer({ type: 'tick' }), 1000);
    return () => clearInterval(interval);
  }, [timer.running]);

  const openNewSet = async (item: SessionExercise) => {
    const value = await execution.getExecutionContext(item.id);
    setContext(value);
    setForm({
      attemptId: createUuid(), editingId: null, dose: '', load: '', loadLabel: '', rir: '',
      perSide: value.selected_laterality === 'UNILATERAL' || value.selected_laterality === 'ALTERNATING',
    });
  };
  const openEditSet = async (item: SessionExercise, value: PerformedSet) => {
    const currentContext = await execution.getExecutionContext(item.id);
    setContext({ ...currentContext, dose_unit: value.doseUnit, load_mode: value.loadMode });
    setForm({
      attemptId: value.id, editingId: value.id, dose: String(value.doseValue),
      load: value.loadValue === null ? '' : String(value.loadValue), loadLabel: value.loadLabel ?? '',
      rir: value.rir === null ? '' : String(value.rir), perSide: value.perSide,
    });
  };
  const saveSet = async () => {
    if (!form || !context || submitting) return;
    setSubmitting(true);
    const values = {
      doseValue: Number(form.dose), perSide: form.perSide,
      loadValue: form.load === '' ? null : Number(form.load), loadLabel: form.loadLabel || null,
      rir: form.rir === '' ? null : Number(form.rir),
    };
    try {
      if (form.editingId) await execution.editSet({
        ...values, setId: form.editingId, sessionExerciseId: context.session_exercise_id,
      });
      else await execution.confirmSet({
        ...values, attemptId: form.attemptId, sessionExerciseId: context.session_exercise_id,
      });
      setForm(null); setContext(null); await loadSets();
    } catch (reason) { Alert.alert('No se pudo guardar', reason instanceof Error ? reason.message : 'Error inesperado.'); }
    finally { setSubmitting(false); }
  };
  const deleteSet = (item: SessionExercise, value: PerformedSet) => Alert.alert(
    'Eliminar serie', `¿Eliminar la serie ${value.setIndex + 1}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => void (async () => {
        await execution.deleteSet(item.id, value.id); await loadSets();
      })() },
    ],
  );
  const saveNote = async (item: SessionExercise, note: string) => {
    await execution.updateExerciseNote(item.id, note); await onRefresh();
  };
  const move = async (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= items.length || items.length === 0) return;
    const ids = items.map((item) => item.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await sessions.reorderExercises(items[index].sessionId, ids); await onRefresh();
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.timerCard}>
          <View><Text style={styles.timerTitle}>Descanso</Text><Text style={styles.timerValue}>{formatTime(timer.remaining)}</Text></View>
          <View style={styles.timerActions}>
            {[60, 90, 120].map((seconds) => <Pressable key={seconds} style={styles.smallButton} onPress={() => dispatchTimer({ type: 'start', seconds })}><Text style={styles.smallButtonText}>{seconds}s</Text></Pressable>)}
            {timer.remaining > 0 && <Pressable style={styles.smallButton} onPress={() => dispatchTimer({ type: timer.running ? 'pause' : 'start', seconds: timer.remaining })}><Text style={styles.smallButtonText}>{timer.running ? 'Pausa' : 'Seguir'}</Text></Pressable>}
            {timer.remaining > 0 && <Pressable onPress={() => dispatchTimer({ type: 'cancel' })}><Text style={styles.danger}>Cancelar</Text></Pressable>}
          </View>
        </View>
        <Pressable style={styles.primaryButton} onPress={onAddExercise}><Text style={styles.primaryButtonText}>Añadir ejercicio</Text></Pressable>
        {items.map((item, index) => {
          const active = activeId === item.id;
          return (
            <Pressable key={item.id} style={[styles.exerciseCard, active && styles.exerciseCardActive]} onPress={() => setActiveId(item.id)}>
              <View style={styles.exerciseHeader}>
                <View style={styles.exerciseTitleArea}><Text style={styles.exerciseTitle}>{index + 1}. {item.exerciseNameSnapshot}</Text><Text style={styles.configuration}>{item.configurationNameSnapshot}</Text><Text style={styles.selection}>{[item.selectedEquipment, item.selectedLaterality, item.selectedGrip, item.selectedGripWidth].filter(Boolean).map((value) => labelForOption(String(value))).join(' · ')}</Text></View>
                <View style={styles.orderButtons}><Pressable disabled={index === 0} onPress={() => void move(index, -1)}><Text style={[styles.arrow, index === 0 && styles.disabled]}>↑</Text></Pressable><Pressable disabled={index === items.length - 1} onPress={() => void move(index, 1)}><Text style={[styles.arrow, index === items.length - 1 && styles.disabled]}>↓</Text></Pressable></View>
              </View>
              {active && <View style={styles.exerciseBody}>
                {(sets[item.id] ?? []).map((value) => <View key={value.id} style={styles.setRow}><View style={styles.setText}><Text style={styles.setTitle}>Serie {value.setIndex + 1}</Text><Text style={styles.setDetail}>{formatSet(value)}</Text></View><Pressable onPress={() => void openEditSet(item, value)}><Text style={styles.link}>Editar</Text></Pressable><Pressable onPress={() => deleteSet(item, value)}><Text style={styles.danger}>Eliminar</Text></Pressable></View>)}
                {(sets[item.id] ?? []).length === 0 && <Text style={styles.empty}>Sin series confirmadas.</Text>}
                <Pressable style={styles.addSetButton} onPress={() => void openNewSet(item)}><Text style={styles.addSetText}>Añadir serie</Text></Pressable>
                <Text style={styles.noteLabel}>Nota del ejercicio</Text>
                <TextInput style={styles.noteInput} defaultValue={item.note ?? ''} placeholder="Nota opcional…" placeholderTextColor="#94a3b8" onEndEditing={(event) => void saveNote(item, event.nativeEvent.text)} />
              </View>}
            </Pressable>
          );
        })}
      </ScrollView>

      <Modal visible={form !== null} animationType="slide" onRequestClose={() => setForm(null)}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>{form?.editingId ? 'Editar serie' : 'Nueva serie'}</Text><Pressable onPress={() => setForm(null)}><Text style={styles.link}>Cerrar</Text></Pressable></View>
          {form && context && <ScrollView contentContainerStyle={styles.form}>
            <Text style={styles.label}>{DOSE_LABELS[context.dose_unit]}</Text><TextInput keyboardType="decimal-pad" style={styles.input} value={form.dose} onChangeText={(dose) => setForm((old) => old && ({ ...old, dose }))} />
            {LOAD_LABELS[context.load_mode] && <><Text style={styles.label}>{LOAD_LABELS[context.load_mode]}</Text><TextInput keyboardType="decimal-pad" style={styles.input} value={form.load} onChangeText={(load) => setForm((old) => old && ({ ...old, load }))} /></>}
            {context.load_mode === 'BAND_LABEL' && <><Text style={styles.label}>Banda / resistencia</Text><TextInput style={styles.input} value={form.loadLabel} placeholder="Roja, fuerte, banda 25 kg…" onChangeText={(loadLabel) => setForm((old) => old && ({ ...old, loadLabel }))} /></>}
            {(context.selected_laterality === 'UNILATERAL' || context.selected_laterality === 'ALTERNATING') && <Pressable style={styles.toggle} onPress={() => setForm((old) => old && ({ ...old, perSide: !old.perSide }))}><Text style={styles.toggleText}>{form.perSide ? '✓' : '○'} Por lado</Text></Pressable>}
            <Text style={styles.label}>RIR (opcional, 0–5)</Text><TextInput keyboardType="number-pad" style={styles.input} value={form.rir} onChangeText={(rir) => setForm((old) => old && ({ ...old, rir }))} />
            <Pressable disabled={submitting} style={[styles.primaryButton, submitting && styles.disabledButton]} onPress={() => void saveSet()}><Text style={styles.primaryButtonText}>{submitting ? 'Guardando…' : 'Confirmar serie'}</Text></Pressable>
          </ScrollView>}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' }, content: { gap: 12, padding: 16, paddingBottom: 48 }, timerCard: { alignItems: 'center', backgroundColor: '#ecfeff', borderRadius: 16, flexDirection: 'row', justifyContent: 'space-between', padding: 14 }, timerTitle: { color: '#155e75', fontWeight: '700' }, timerValue: { color: '#0e7490', fontSize: 28, fontWeight: '800' }, timerActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', maxWidth: '70%' }, smallButton: { backgroundColor: '#cffafe', borderRadius: 8, padding: 8 }, smallButtonText: { color: '#155e75', fontWeight: '700' },
  primaryButton: { alignItems: 'center', backgroundColor: '#0e7490', borderRadius: 12, padding: 14 }, primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' }, exerciseCard: { backgroundColor: '#fff', borderColor: '#e2e8f0', borderRadius: 16, borderWidth: 1, padding: 14 }, exerciseCardActive: { borderColor: '#0891b2', borderWidth: 2 }, exerciseHeader: { alignItems: 'center', flexDirection: 'row' }, exerciseTitleArea: { flex: 1 }, exerciseTitle: { color: '#0f172a', fontSize: 17, fontWeight: '800' }, configuration: { color: '#475569', marginTop: 3 }, selection: { color: '#0e7490', fontSize: 12, marginTop: 5 }, orderButtons: { flexDirection: 'row', gap: 14, marginLeft: 10 }, arrow: { color: '#0e7490', fontSize: 22, fontWeight: '800' }, disabled: { color: '#cbd5e1' }, exerciseBody: { borderTopColor: '#e2e8f0', borderTopWidth: 1, marginTop: 12, paddingTop: 10 }, setRow: { alignItems: 'center', borderBottomColor: '#f1f5f9', borderBottomWidth: 1, flexDirection: 'row', gap: 12, paddingVertical: 10 }, setText: { flex: 1 }, setTitle: { color: '#0f172a', fontWeight: '700' }, setDetail: { color: '#64748b', fontSize: 13, marginTop: 3 }, link: { color: '#0e7490', fontWeight: '700' }, danger: { color: '#b91c1c', fontWeight: '700' }, empty: { color: '#64748b', paddingVertical: 10 }, addSetButton: { alignItems: 'center', backgroundColor: '#cffafe', borderRadius: 10, marginTop: 10, padding: 12 }, addSetText: { color: '#155e75', fontWeight: '800' }, noteLabel: { color: '#334155', fontWeight: '700', marginTop: 14 }, noteInput: { borderColor: '#cbd5e1', borderRadius: 10, borderWidth: 1, color: '#0f172a', marginTop: 7, padding: 10 },
  modalHeader: { alignItems: 'center', borderBottomColor: '#e2e8f0', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 18 }, modalTitle: { color: '#0f172a', fontSize: 22, fontWeight: '800' }, form: { padding: 20, paddingBottom: 48 }, label: { color: '#334155', fontWeight: '700', marginBottom: 7, marginTop: 12 }, input: { backgroundColor: '#fff', borderColor: '#cbd5e1', borderRadius: 10, borderWidth: 1, color: '#0f172a', fontSize: 17, padding: 12 }, toggle: { backgroundColor: '#e2e8f0', borderRadius: 10, marginTop: 18, padding: 12 }, toggleText: { color: '#334155', fontWeight: '700' }, disabledButton: { opacity: 0.5 },
});
