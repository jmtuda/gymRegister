import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';

import { createCatalogRepository } from '../../data/catalogRepository.ts';
import { createManualSessionRepository, type ManualCompletedSetInput } from '../../data/manualSessionRepository.ts';
import type { Exercise, ExerciseConfiguration, ExerciseGroup } from '../../domain/catalog.ts';
import { createUuid } from '../../domain/id.ts';
import { labelForOption } from '../exercises/catalogPresentation.ts';

type Selection = { equipment: string | null; laterality: string | null; grip: string | null; gripWidth: string | null };
type DraftSet = ManualCompletedSetInput & { id: string };
type DraftExercise = {
  id: string; exercise: Exercise; configuration: ExerciseConfiguration; selection: Selection;
  note: string; sets: DraftSet[];
};
type SetForm = { exerciseId: string; setId: string | null; dose: string; load: string; loadLabel: string; rir: string; perSide: boolean };

const NUMERIC_LOADS = ['TOTAL_KG', 'IMPLEMENT_KG', 'DISPLAYED_KG', 'ASSISTANCE_KG'];
const initialChoice = (values: string[]) => values.length === 1 ? values[0] : null;

function parseLocalDateTime(value: string): string | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1
    || date.getDate() !== Number(match[3]) || date.getHours() !== Number(match[4])
    || date.getMinutes() !== Number(match[5])) return null;
  return date.toISOString();
}

function OptionPicker({ label, values, value, onChange }: { label: string; values: string[]; value: string | null; onChange: (value: string) => void }) {
  if (values.length === 0) return null;
  return <View><Text style={styles.label}>{label}</Text><View style={styles.chips}>{values.map((item) => (
    <Pressable key={item} style={[styles.chip, value === item && styles.chipActive]} onPress={() => onChange(item)}>
      <Text style={[styles.chipText, value === item && styles.chipTextActive]}>{labelForOption(item)}</Text>
    </Pressable>
  ))}</View></View>;
}

export function ManualCompletedSessionScreen({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const database = useSQLiteContext();
  const catalog = useMemo(() => createCatalogRepository(database), [database]);
  const sessions = useMemo(() => createManualSessionRepository(database), [database]);
  const now = new Date();
  const initialDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const [completedAt, setCompletedAt] = useState(initialDate);
  const [duration, setDuration] = useState('');
  const [note, setNote] = useState('');
  const [exercises, setExercises] = useState<DraftExercise[]>([]);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [groups, setGroups] = useState<ExerciseGroup[]>([]);
  const [group, setGroup] = useState<ExerciseGroup | null>(null);
  const [catalogExercises, setCatalogExercises] = useState<Exercise[]>([]);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [configurations, setConfigurations] = useState<ExerciseConfiguration[]>([]);
  const [configuration, setConfiguration] = useState<ExerciseConfiguration | null>(null);
  const [selection, setSelection] = useState<Selection>({ equipment: null, laterality: null, grip: null, gripWidth: null });
  const [setForm, setSetForm] = useState<SetForm | null>(null);

  const openPicker = async () => {
    setPickerOpen(true); setGroup(null); setExercise(null); setConfiguration(null);
    try { setGroups(await catalog.listGroups()); }
    catch (error) { setPickerOpen(false); Alert.alert('No se pudo abrir el catálogo', error instanceof Error ? error.message : 'Error inesperado.'); }
  };
  const chooseGroup = async (value: ExerciseGroup) => { setGroup(value); setExercise(null); setConfiguration(null); setCatalogExercises(await catalog.listExercisesByGroup(value.id)); };
  const chooseExercise = async (value: Exercise) => { setExercise(value); setConfiguration(null); setConfigurations(await catalog.listConfigurationsByExercise(value.id)); };
  const chooseConfiguration = (value: ExerciseConfiguration) => {
    setConfiguration(value);
    setSelection({ equipment: initialChoice(value.equipmentOptions), laterality: initialChoice(value.lateralityOptions), grip: initialChoice(value.gripOptions), gripWidth: initialChoice(value.gripWidthOptions) });
  };
  const selectionComplete = configuration !== null
    && (configuration.equipmentOptions.length <= 1 || selection.equipment !== null)
    && (configuration.lateralityOptions.length <= 1 || selection.laterality !== null)
    && (configuration.gripOptions.length <= 1 || selection.grip !== null)
    && (configuration.gripWidthOptions.length <= 1 || selection.gripWidth !== null);
  const addExercise = () => {
    if (!exercise || !configuration || !selectionComplete) return;
    setExercises((old) => [...old, { id: createUuid(), exercise, configuration, selection, note: '', sets: [] }]);
    setPickerOpen(false);
  };
  const moveExercise = (index: number, offset: number) => setExercises((old) => {
    const target = index + offset; if (target < 0 || target >= old.length) return old;
    const next = [...old]; [next[index], next[target]] = [next[target], next[index]]; return next;
  });
  const openSet = (item: DraftExercise, value?: DraftSet) => setSetForm({
    exerciseId: item.id, setId: value?.id ?? null, dose: value ? String(value.doseValue) : '',
    load: value?.loadValue === null || value?.loadValue === undefined ? '' : String(value.loadValue),
    loadLabel: value?.loadLabel ?? '', rir: value?.rir === null || value?.rir === undefined ? '' : String(value.rir),
    perSide: value?.perSide ?? (item.selection.laterality === 'UNILATERAL' || item.selection.laterality === 'ALTERNATING'),
  });
  const saveSet = () => {
    if (!setForm) return;
    const item = exercises.find((value) => value.id === setForm.exerciseId); if (!item) return;
    const set: DraftSet = {
      id: setForm.setId ?? createUuid(), doseValue: Number(setForm.dose), perSide: setForm.perSide,
      loadValue: setForm.load === '' ? null : Number(setForm.load), loadLabel: setForm.loadLabel || null,
      rir: setForm.rir === '' ? null : Number(setForm.rir),
    };
    setExercises((old) => old.map((value) => value.id !== item.id ? value : {
      ...value, sets: setForm.setId ? value.sets.map((oldSet) => oldSet.id === setForm.setId ? set : oldSet) : [...value.sets, set],
    }));
    setSetForm(null);
  };
  const save = async () => {
    const instant = parseLocalDateTime(completedAt);
    if (!instant) { Alert.alert('Fecha no válida', 'Usa el formato AAAA-MM-DD HH:mm.'); return; }
    const durationMinutes = duration.trim() === '' ? null : Number(duration);
    setSaving(true);
    try {
      await sessions.createCompletedSessionManual({
        completedAt: instant, durationMinutes, note,
        exercises: exercises.map((item) => ({
          id: item.id, exerciseId: item.exercise.id, configurationId: item.configuration.id,
          selectedEquipment: item.selection.equipment, selectedLaterality: item.selection.laterality,
          selectedGrip: item.selection.grip, selectedGripWidth: item.selection.gripWidth,
          note: item.note, sets: item.sets,
        })),
      });
      await onSaved(); onClose();
    } catch (error) { Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Error inesperado.'); }
    finally { setSaving(false); }
  };

  const activeSetExercise = setForm ? exercises.find((item) => item.id === setForm.exerciseId) : null;
  return <SafeAreaView style={styles.safeArea}>
    <View style={styles.header}><Text style={styles.title}>Añadir sesión realizada</Text><Pressable onPress={onClose}><Text style={styles.link}>Cerrar</Text></Pressable></View>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.label}>Fecha y hora *</Text><TextInput style={styles.input} value={completedAt} onChangeText={setCompletedAt} placeholder="AAAA-MM-DD HH:mm" />
      <Text style={styles.label}>Duración en minutos (opcional)</Text><TextInput style={styles.input} keyboardType="number-pad" value={duration} onChangeText={setDuration} />
      <Text style={styles.label}>Nota de sesión (opcional)</Text><TextInput multiline style={[styles.input, styles.note]} value={note} onChangeText={setNote} />
      <Pressable style={styles.primary} onPress={() => void openPicker()}><Text style={styles.primaryText}>Añadir ejercicio</Text></Pressable>
      {exercises.map((item, index) => <View key={item.id} style={styles.card}>
        <View style={styles.row}><View style={styles.grow}><Text style={styles.cardTitle}>{index + 1}. {item.exercise.nameEs}</Text><Text style={styles.meta}>{item.configuration.nameEs}</Text></View>
          <Pressable disabled={index === 0} onPress={() => moveExercise(index, -1)}><Text style={styles.link}>↑</Text></Pressable><Pressable disabled={index === exercises.length - 1} onPress={() => moveExercise(index, 1)}><Text style={styles.link}>↓</Text></Pressable>
          <Pressable onPress={() => setExercises((old) => old.filter((value) => value.id !== item.id))}><Text style={styles.danger}>Eliminar</Text></Pressable></View>
        <TextInput style={styles.input} value={item.note} placeholder="Nota del ejercicio" onChangeText={(value) => setExercises((old) => old.map((entry) => entry.id === item.id ? { ...entry, note: value } : entry))} />
        {item.sets.map((set, setIndex) => <View key={set.id} style={styles.row}><Text style={styles.grow}>Serie {setIndex + 1}: {set.doseValue} {item.configuration.doseUnit}</Text><Pressable onPress={() => openSet(item, set)}><Text style={styles.link}>Editar</Text></Pressable><Pressable onPress={() => setExercises((old) => old.map((entry) => entry.id === item.id ? { ...entry, sets: entry.sets.filter((value) => value.id !== set.id) } : entry))}><Text style={styles.danger}>Eliminar</Text></Pressable></View>)}
        <Pressable style={styles.secondary} onPress={() => openSet(item)}><Text style={styles.link}>Añadir serie</Text></Pressable>
      </View>)}
      <Pressable disabled={saving} style={[styles.save, saving && styles.disabled]} onPress={() => void save()}><Text style={styles.primaryText}>{saving ? 'Guardando…' : 'Guardar sesión'}</Text></Pressable>
    </ScrollView>

    <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}><SafeAreaView style={styles.safeArea}><View style={styles.header}><Text style={styles.title}>Elegir ejercicio</Text><Pressable onPress={() => setPickerOpen(false)}><Text style={styles.link}>Cerrar</Text></Pressable></View><ScrollView contentContainerStyle={styles.content}>
      {!group && groups.map((value) => <Pressable key={value.id} style={styles.card} onPress={() => void chooseGroup(value)}><Text style={styles.cardTitle}>{value.nameEs}</Text></Pressable>)}
      {group && !exercise && catalogExercises.map((value) => <Pressable key={value.id} style={styles.card} onPress={() => void chooseExercise(value)}><Text style={styles.cardTitle}>{value.nameEs}</Text></Pressable>)}
      {exercise && !configuration && configurations.map((value) => <Pressable key={value.id} style={styles.card} onPress={() => chooseConfiguration(value)}><Text style={styles.cardTitle}>{value.nameEs}</Text></Pressable>)}
      {configuration && <><OptionPicker label="Equipamiento" values={configuration.equipmentOptions} value={selection.equipment} onChange={(equipment) => setSelection((old) => ({ ...old, equipment }))} /><OptionPicker label="Lateralidad" values={configuration.lateralityOptions} value={selection.laterality} onChange={(laterality) => setSelection((old) => ({ ...old, laterality }))} /><OptionPicker label="Agarre" values={configuration.gripOptions} value={selection.grip} onChange={(grip) => setSelection((old) => ({ ...old, grip }))} /><OptionPicker label="Anchura" values={configuration.gripWidthOptions} value={selection.gripWidth} onChange={(gripWidth) => setSelection((old) => ({ ...old, gripWidth }))} /><Pressable disabled={!selectionComplete} style={[styles.primary, !selectionComplete && styles.disabled]} onPress={addExercise}><Text style={styles.primaryText}>Añadir</Text></Pressable></>}
    </ScrollView></SafeAreaView></Modal>

    <Modal visible={setForm !== null} animationType="slide" onRequestClose={() => setSetForm(null)}><SafeAreaView style={styles.safeArea}><View style={styles.header}><Text style={styles.title}>{setForm?.setId ? 'Editar serie' : 'Añadir serie'}</Text><Pressable onPress={() => setSetForm(null)}><Text style={styles.link}>Cerrar</Text></Pressable></View>{setForm && activeSetExercise && <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.label}>{activeSetExercise.configuration.doseUnit}</Text><TextInput style={styles.input} keyboardType="decimal-pad" value={setForm.dose} onChangeText={(dose) => setSetForm((old) => old && { ...old, dose })} />
      {NUMERIC_LOADS.includes(activeSetExercise.configuration.loadMode) && <><Text style={styles.label}>Carga (kg)</Text><TextInput style={styles.input} keyboardType="decimal-pad" value={setForm.load} onChangeText={(load) => setSetForm((old) => old && { ...old, load })} /></>}
      {activeSetExercise.configuration.loadMode === 'BAND_LABEL' && <><Text style={styles.label}>Banda / resistencia</Text><TextInput style={styles.input} value={setForm.loadLabel} onChangeText={(loadLabel) => setSetForm((old) => old && { ...old, loadLabel })} /></>}
      {(activeSetExercise.selection.laterality === 'UNILATERAL' || activeSetExercise.selection.laterality === 'ALTERNATING') && <Pressable style={styles.secondary} onPress={() => setSetForm((old) => old && { ...old, perSide: !old.perSide })}><Text>{setForm.perSide ? '✓' : '○'} Por lado</Text></Pressable>}
      <Text style={styles.label}>RIR (opcional)</Text><TextInput style={styles.input} keyboardType="number-pad" value={setForm.rir} onChangeText={(rir) => setSetForm((old) => old && { ...old, rir })} />
      <Pressable style={styles.primary} onPress={saveSet}><Text style={styles.primaryText}>Guardar serie</Text></Pressable>
    </ScrollView>}</SafeAreaView></Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#f8fafc', flex: 1 }, header: { alignItems: 'center', borderBottomColor: '#e2e8f0', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 18 }, title: { color: '#0f172a', fontSize: 20, fontWeight: '800' }, link: { color: '#0e7490', fontWeight: '800' }, content: { gap: 10, padding: 18, paddingBottom: 48 }, label: { color: '#334155', fontWeight: '700', marginTop: 6 }, input: { backgroundColor: '#fff', borderColor: '#cbd5e1', borderRadius: 10, borderWidth: 1, color: '#0f172a', padding: 12 }, note: { minHeight: 70, textAlignVertical: 'top' }, primary: { alignItems: 'center', backgroundColor: '#0e7490', borderRadius: 12, marginTop: 10, padding: 14 }, primaryText: { color: '#fff', fontWeight: '800' }, save: { alignItems: 'center', backgroundColor: '#16a34a', borderRadius: 12, marginTop: 12, padding: 16 }, secondary: { alignItems: 'center', backgroundColor: '#e2e8f0', borderRadius: 10, marginTop: 8, padding: 11 }, card: { backgroundColor: '#fff', borderColor: '#e2e8f0', borderRadius: 14, borderWidth: 1, gap: 9, padding: 14 }, row: { alignItems: 'center', flexDirection: 'row', gap: 10 }, grow: { flex: 1 }, cardTitle: { color: '#0f172a', fontSize: 16, fontWeight: '800' }, meta: { color: '#64748b', marginTop: 3 }, danger: { color: '#b91c1c', fontWeight: '700' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { backgroundColor: '#e2e8f0', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 }, chipActive: { backgroundColor: '#0e7490' }, chipText: { color: '#334155' }, chipTextActive: { color: '#fff', fontWeight: '700' }, disabled: { opacity: 0.45 },
});
