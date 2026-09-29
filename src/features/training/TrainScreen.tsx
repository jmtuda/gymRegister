import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';

import { createCatalogRepository } from '../../data/catalogRepository.ts';
import { createManualSessionRepository } from '../../data/manualSessionRepository.ts';
import type { Exercise, ExerciseConfiguration, ExerciseGroup } from '../../domain/catalog.ts';
import { createUuid } from '../../domain/id.ts';
import type { SessionExercise, TrainingSession } from '../../domain/training.ts';
import { labelForOption } from '../exercises/catalogPresentation.ts';
import { SessionExecutionScreen } from './SessionExecutionScreen.tsx';

type Selection = {
  equipment: string | null; laterality: string | null; grip: string | null; gripWidth: string | null;
};

function initialChoice(options: string[]): string | null {
  return options.length === 1 ? options[0] : null;
}

function OptionPicker({ label, options, value, onChange }: {
  label: string; options: string[]; value: string | null; onChange: (value: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <View style={styles.optionSection}>
      <Text style={styles.optionLabel}>{label}</Text>
      <View style={styles.chips}>
        {options.map((option) => (
          <Pressable key={option} style={[styles.chip, value === option && styles.chipActive]} onPress={() => onChange(option)}>
            <Text style={[styles.chipText, value === option && styles.chipTextActive]}>{labelForOption(option)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function TrainScreen() {
  const database = useSQLiteContext();
  const sessions = useMemo(() => createManualSessionRepository(database), [database]);
  const catalog = useMemo(() => createCatalogRepository(database), [database]);
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [items, setItems] = useState<SessionExercise[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);
  const addingRef = useRef(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [groups, setGroups] = useState<ExerciseGroup[]>([]);
  const [group, setGroup] = useState<ExerciseGroup | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [configurations, setConfigurations] = useState<ExerciseConfiguration[]>([]);
  const [configuration, setConfiguration] = useState<ExerciseConfiguration | null>(null);
  const [additionId, setAdditionId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({ equipment: null, laterality: null, grip: null, gripWidth: null });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const open = await sessions.getOpenSession();
      setSession(open); setNote(open?.note ?? '');
      setItems(open ? await sessions.listSessionExercises(open.id) : []);
    } catch (reason) {
      Alert.alert('No se pudo abrir Entrenar', reason instanceof Error ? reason.message : 'Error inesperado.');
    } finally { setLoading(false); }
  }, [sessions]);

  useEffect(() => { void refresh(); }, [refresh]);

  const createSession = async () => {
    if (creating) return;
    setCreating(true);
    try { await sessions.createDraft(); await refresh(); }
    catch (reason) { Alert.alert('No se pudo crear la sesión', reason instanceof Error ? reason.message : 'Error inesperado.'); }
    finally { setCreating(false); }
  };

  const openPicker = async () => {
    setPickerOpen(true); setGroup(null); setExercise(null); setConfiguration(null);
    setAdditionId(null);
    try { setGroups(await catalog.listGroups()); }
    catch (reason) { Alert.alert('No se pudo abrir el catálogo', reason instanceof Error ? reason.message : 'Error inesperado.'); setPickerOpen(false); }
  };
  const chooseGroup = async (value: ExerciseGroup) => {
    setGroup(value); setExercise(null); setConfiguration(null);
    try { setExercises(await catalog.listExercisesByGroup(value.id)); }
    catch (reason) { Alert.alert('No se pudieron cargar los ejercicios', reason instanceof Error ? reason.message : 'Error inesperado.'); }
  };
  const chooseExercise = async (value: Exercise) => {
    setExercise(value); setConfiguration(null);
    try { setConfigurations(await catalog.listConfigurationsByExercise(value.id)); }
    catch (reason) { Alert.alert('No se pudieron cargar las configuraciones', reason instanceof Error ? reason.message : 'Error inesperado.'); }
  };
  const chooseConfiguration = (value: ExerciseConfiguration) => {
    setConfiguration(value);
    setAdditionId(createUuid());
    setSelection({
      equipment: initialChoice(value.equipmentOptions), laterality: initialChoice(value.lateralityOptions),
      grip: initialChoice(value.gripOptions), gripWidth: initialChoice(value.gripWidthOptions),
    });
  };
  const selectionComplete = configuration !== null
    && (configuration.equipmentOptions.length <= 1 || selection.equipment !== null)
    && (configuration.lateralityOptions.length <= 1 || selection.laterality !== null)
    && (configuration.gripOptions.length <= 1 || selection.grip !== null)
    && (configuration.gripWidthOptions.length <= 1 || selection.gripWidth !== null);

  const addExercise = async () => {
    if (!session || !exercise || !configuration || !additionId || !selectionComplete || addingRef.current) return;
    addingRef.current = true; setAdding(true);
    try {
      await sessions.addExercise({
        id: additionId,
        sessionId: session.id, exerciseId: exercise.id, configurationId: configuration.id,
        selectedEquipment: selection.equipment, selectedLaterality: selection.laterality,
        selectedGrip: selection.grip, selectedGripWidth: selection.gripWidth,
      });
      setPickerOpen(false); await refresh();
    } catch (reason) { Alert.alert('No se pudo añadir', reason instanceof Error ? reason.message : 'Error inesperado.'); }
    finally { addingRef.current = false; setAdding(false); }
  };

  const persistNote = async () => {
    if (session?.status !== 'draft' || note === (session.note ?? '')) return true;
    try { setSession(await sessions.updateNote(session.id, note)); return true; }
    catch (reason) {
      Alert.alert('No se pudo guardar la nota', reason instanceof Error ? reason.message : 'Error inesperado.');
      return false;
    }
  };
  const remove = (item: SessionExercise) => Alert.alert(
    'Eliminar ejercicio', `¿Retirar “${item.exerciseNameSnapshot}” de la sesión?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => void (async () => {
        if (!session) return;
        try { await sessions.removeExercise(session.id, item.id); await refresh(); }
        catch (reason) { Alert.alert('No se pudo eliminar', reason instanceof Error ? reason.message : 'Error inesperado.'); }
      })() },
    ],
  );
  const move = async (index: number, offset: number) => {
    if (!session) return;
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    const ids = items.map((item) => item.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try { setItems(await sessions.reorderExercises(session.id, ids)); }
    catch (reason) { Alert.alert('No se pudo reordenar', reason instanceof Error ? reason.message : 'Error inesperado.'); }
  };
  const start = async () => {
    if (!session) return;
    try { if (await persistNote()) setSession(await sessions.startSession(session.id)); }
    catch (reason) { Alert.alert('No se puede iniciar', reason instanceof Error ? reason.message : 'Error inesperado.'); }
  };

  const pickerTitle = configuration?.nameEs ?? exercise?.nameEs ?? group?.nameEs ?? 'Añadir ejercicio';
  const pickerBack = () => {
    if (configuration) setConfiguration(null);
    else if (exercise) setExercise(null);
    else if (group) setGroup(null);
    else setPickerOpen(false);
  };

  if (loading) return <SafeAreaView style={styles.safeArea}><ActivityIndicator style={styles.loader} color="#0e7490" /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>ENTRENAR</Text>
        <Text style={styles.title}>{session?.status === 'in_progress' ? 'Sesión en curso' : session ? 'Prepara tu sesión' : 'Nueva sesión'}</Text>
        <Text style={styles.subtitle}>{session?.status === 'in_progress'
          ? 'Registra cada serie cuando la completes.'
          : session ? 'Añade y ordena los ejercicios antes de empezar.' : 'Crea una sesión manual y elige tus ejercicios.'}</Text>
      </View>

      {!session ? (
        <View style={styles.empty}>
          <Pressable disabled={creating} style={styles.primaryButton} onPress={() => void createSession()}>
            <Text style={styles.primaryButtonText}>{creating ? 'Creando…' : 'Crear sesión'}</Text>
          </Pressable>
        </View>
      ) : session.status === 'in_progress' ? (
        <SessionExecutionScreen
          session={session} items={items} onAddExercise={() => void openPicker()}
          onRefresh={refresh} onCompleted={refresh}
        />
      ) : (
        <FlatList
          data={items} keyExtractor={(item) => item.id} contentContainerStyle={styles.list}
          ListHeaderComponent={session.status === 'draft' ? <>
            <Pressable style={styles.primaryButton} onPress={() => void openPicker()}><Text style={styles.primaryButtonText}>Añadir ejercicio</Text></Pressable>
            <Text style={styles.label}>Nota de sesión (opcional)</Text>
            <TextInput
              style={[styles.input, styles.note]} multiline value={note} placeholder="Escribe una nota…"
              placeholderTextColor="#94a3b8" onChangeText={setNote} onBlur={() => void persistNote()}
            />
          </> : null}
          ListEmptyComponent={<Text style={styles.emptyText}>Todavía no has añadido ejercicios.</Text>}
          renderItem={({ item, index }) => (
            <View style={styles.card}>
              <View style={styles.position}><Text style={styles.positionText}>{index + 1}</Text></View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.exerciseNameSnapshot}</Text>
                <Text style={styles.configurationName}>{item.configurationNameSnapshot}</Text>
                <Text style={styles.selectionText}>{[
                  item.selectedEquipment, item.selectedLaterality, item.selectedGrip, item.selectedGripWidth,
                ].filter(Boolean).map((value) => labelForOption(String(value))).join(' · ')}</Text>
              </View>
              {session.status === 'draft' && <View style={styles.actions}>
                <View style={styles.orderActions}>
                  <Pressable disabled={index === 0} onPress={() => void move(index, -1)}><Text style={[styles.orderButton, index === 0 && styles.disabled]}>↑</Text></Pressable>
                  <Pressable disabled={index === items.length - 1} onPress={() => void move(index, 1)}><Text style={[styles.orderButton, index === items.length - 1 && styles.disabled]}>↓</Text></Pressable>
                </View>
                <Pressable onPress={() => remove(item)}><Text style={styles.danger}>Eliminar</Text></Pressable>
              </View>}
            </View>
          )}
          ListFooterComponent={session.status === 'draft' ? (
            <Pressable disabled={items.length === 0} style={[styles.startButton, items.length === 0 && styles.buttonDisabled]} onPress={() => void start()}>
              <Text style={styles.startButtonText}>Iniciar sesión</Text>
            </Pressable>
          ) : null}
        />
      )}

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.modalHeader}>
            <Pressable onPress={pickerBack}><Text style={styles.link}>‹ Atrás</Text></Pressable>
            <Text numberOfLines={1} style={styles.modalTitle}>{pickerTitle}</Text>
            <Pressable onPress={() => setPickerOpen(false)}><Text style={styles.link}>Cerrar</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            {!group && groups.map((value) => (
              <Pressable key={value.id} style={styles.pickerCard} onPress={() => void chooseGroup(value)}><Text style={styles.cardTitle}>{value.nameEs}</Text><Text style={styles.chevron}>›</Text></Pressable>
            ))}
            {group && !exercise && exercises.map((value) => (
              <Pressable key={value.id} style={styles.pickerCard} onPress={() => void chooseExercise(value)}><Text style={styles.cardTitle}>{value.nameEs}</Text><Text style={styles.chevron}>›</Text></Pressable>
            ))}
            {exercise && !configuration && configurations.map((value) => (
              <Pressable key={value.id} style={styles.pickerCard} onPress={() => chooseConfiguration(value)}><Text style={styles.cardTitle}>{value.nameEs}</Text><Text style={styles.chevron}>›</Text></Pressable>
            ))}
            {configuration && <>
              <Text style={styles.instructions}>Elige las opciones disponibles para esta configuración.</Text>
              <OptionPicker label="Equipamiento" options={configuration.equipmentOptions} value={selection.equipment} onChange={(equipment) => setSelection((old) => ({ ...old, equipment }))} />
              <OptionPicker label="Lateralidad" options={configuration.lateralityOptions} value={selection.laterality} onChange={(laterality) => setSelection((old) => ({ ...old, laterality }))} />
              <OptionPicker label="Agarre" options={configuration.gripOptions} value={selection.grip} onChange={(grip) => setSelection((old) => ({ ...old, grip }))} />
              <OptionPicker label="Anchura de agarre" options={configuration.gripWidthOptions} value={selection.gripWidth} onChange={(gripWidth) => setSelection((old) => ({ ...old, gripWidth }))} />
              <Pressable disabled={!selectionComplete || adding} style={[styles.primaryButton, (!selectionComplete || adding) && styles.buttonDisabled]} onPress={() => void addExercise()}><Text style={styles.primaryButtonText}>{adding ? 'Añadiendo…' : 'Añadir a la sesión'}</Text></Pressable>
            </>}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' }, loader: { flex: 1 }, header: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 8 },
  eyebrow: { color: '#0e7490', fontSize: 12, fontWeight: '800', letterSpacing: 1.4 }, title: { color: '#0f172a', fontSize: 30, fontWeight: '800', marginTop: 4 }, subtitle: { color: '#64748b', fontSize: 16, lineHeight: 22, marginTop: 6 },
  empty: { flex: 1, justifyContent: 'center', padding: 24 }, emptyText: { color: '#64748b', padding: 20, textAlign: 'center' }, list: { gap: 10, padding: 16, paddingBottom: 48 },
  primaryButton: { alignItems: 'center', backgroundColor: '#0e7490', borderRadius: 12, marginBottom: 18, padding: 15 }, primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  startButton: { alignItems: 'center', backgroundColor: '#16a34a', borderRadius: 12, marginTop: 14, padding: 16 }, startButtonText: { color: '#fff', fontSize: 17, fontWeight: '800' }, buttonDisabled: { opacity: 0.4 },
  label: { color: '#334155', fontSize: 14, fontWeight: '700', marginBottom: 8 }, input: { backgroundColor: '#fff', borderColor: '#cbd5e1', borderRadius: 12, borderWidth: 1, color: '#0f172a', fontSize: 16, padding: 12 }, note: { minHeight: 74, marginBottom: 10, textAlignVertical: 'top' },
  card: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#e2e8f0', borderRadius: 16, borderWidth: 1, flexDirection: 'row', padding: 14 }, position: { alignItems: 'center', backgroundColor: '#cffafe', borderRadius: 18, height: 36, justifyContent: 'center', marginRight: 12, width: 36 }, positionText: { color: '#155e75', fontWeight: '800' },
  cardBody: { flex: 1 }, cardTitle: { color: '#0f172a', flex: 1, fontSize: 17, fontWeight: '700' }, configurationName: { color: '#475569', marginTop: 3 }, selectionText: { color: '#0e7490', fontSize: 12, marginTop: 6 }, actions: { alignItems: 'flex-end', gap: 8, marginLeft: 10 }, orderActions: { flexDirection: 'row', gap: 12 }, orderButton: { color: '#0e7490', fontSize: 22, fontWeight: '800' }, disabled: { color: '#cbd5e1' }, danger: { color: '#b91c1c', fontSize: 13, fontWeight: '700' },
  modalHeader: { alignItems: 'center', borderBottomColor: '#e2e8f0', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 18 }, modalTitle: { color: '#0f172a', flex: 1, fontSize: 18, fontWeight: '800', marginHorizontal: 12, textAlign: 'center' }, link: { color: '#0e7490', fontWeight: '700' }, modalContent: { gap: 10, padding: 18, paddingBottom: 48 },
  pickerCard: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#e2e8f0', borderRadius: 14, borderWidth: 1, flexDirection: 'row', padding: 16 }, chevron: { color: '#0891b2', fontSize: 26 }, instructions: { color: '#64748b', fontSize: 15, marginBottom: 6 }, optionSection: { marginBottom: 12 }, optionLabel: { color: '#334155', fontSize: 15, fontWeight: '700', marginBottom: 8 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { backgroundColor: '#e2e8f0', borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 }, chipActive: { backgroundColor: '#0e7490' }, chipText: { color: '#334155' }, chipTextActive: { color: '#fff', fontWeight: '700' },
});
