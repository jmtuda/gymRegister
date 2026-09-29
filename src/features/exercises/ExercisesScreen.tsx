import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';

import {
  createCatalogRepository, type CreateCustomConfigurationInput,
} from '../../data/catalogRepository.ts';
import type { Exercise, ExerciseConfiguration, ExerciseGroup } from '../../domain/catalog.ts';
import type { DoseUnit, LoadMode } from '../../domain/training.ts';
import { configurationDetails, labelForOption } from './catalogPresentation.ts';

const EQUIPMENT = ['BARBELL', 'DUMBBELL', 'KETTLEBELL', 'MACHINE', 'CABLE', 'BAND', 'BODYWEIGHT'];
const LATERALITY = ['BILATERAL', 'UNILATERAL', 'ALTERNATING'];
const GRIPS = ['PRONATED', 'SUPINATED', 'NEUTRAL', 'MIXED', 'BY_ATTACHMENT'];
const WIDTHS = ['NARROW', 'MEDIUM', 'WIDE'];
const DOSE_UNITS: DoseUnit[] = ['reps', 'seconds', 'meters'];
const LOAD_MODES: LoadMode[] = [
  'TOTAL_KG', 'IMPLEMENT_KG', 'DISPLAYED_KG', 'ASSISTANCE_KG',
  'BAND_LABEL', 'BODYWEIGHT', 'NONE',
];

type ExerciseForm = { groupId: string; nameEs: string; technicalPattern: string; primary: string; secondary: string };
type ConfigurationForm = {
  nameEs: string; equipmentOptions: string[]; lateralityOptions: string[]; gripOptions: string[];
  gripWidthOptions: string[]; attachment: string; auxiliaryEquipment: string; bandType: string;
  anchorRequired: boolean; anchorHeightOptions: string; doseUnit: DoseUnit; loadMode: LoadMode;
};

const emptyExercise = (groupId = ''): ExerciseForm => ({
  groupId, nameEs: '', technicalPattern: '', primary: '', secondary: '',
});
const emptyConfiguration = (): ConfigurationForm => ({
  nameEs: '', equipmentOptions: [], lateralityOptions: [], gripOptions: [], gripWidthOptions: [],
  attachment: '', auxiliaryEquipment: '', bandType: '', anchorRequired: false,
  anchorHeightOptions: '', doseUnit: 'reps', loadMode: 'NONE',
});
const splitValues = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

function ChoiceChips({ values, selected, onChange, multiple = false, renderLabel }: {
  values: string[]; selected: string[]; onChange: (values: string[]) => void; multiple?: boolean;
  renderLabel?: (value: string) => string;
}) {
  return (
    <View style={styles.chips}>
      {values.map((value) => {
        const active = selected.includes(value);
        return (
          <Pressable
            key={value}
            accessibilityRole="button"
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(multiple
              ? (active ? selected.filter((item) => item !== value) : [...selected, value])
              : [value])}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{renderLabel?.(value) ?? labelForOption(value)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder }: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input} value={value} onChangeText={onChangeText}
        placeholder={placeholder} placeholderTextColor="#94a3b8"
      />
    </View>
  );
}

function Sheet({ visible, title, onClose, children }: {
  visible: boolean; title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Pressable onPress={onClose}><Text style={styles.link}>Cerrar</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.form}>{children}</ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export function ExercisesScreen() {
  const database = useSQLiteContext();
  const repository = useMemo(() => createCatalogRepository(database), [database]);
  const [groups, setGroups] = useState<ExerciseGroup[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [configurations, setConfigurations] = useState<ExerciseConfiguration[]>([]);
  const [group, setGroup] = useState<ExerciseGroup | null>(null);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exerciseEditor, setExerciseEditor] = useState<Exercise | 'new' | null>(null);
  const [exerciseForm, setExerciseForm] = useState<ExerciseForm>(emptyExercise());
  const [configurationEditor, setConfigurationEditor] = useState<ExerciseConfiguration | 'new' | null>(null);
  const [configurationForm, setConfigurationForm] = useState<ConfigurationForm>(emptyConfiguration());
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try { setGroups(await repository.listGroups()); setError(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo cargar el catálogo.'); }
    finally { setLoading(false); }
  }, [repository]);

  const openGroup = useCallback(async (value: ExerciseGroup) => {
    setLoading(true); setGroup(value); setExercise(null);
    try { setExercises(await repository.listExercisesByGroup(value.id)); setError(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los ejercicios.'); }
    finally { setLoading(false); }
  }, [repository]);

  const openExercise = useCallback(async (value: Exercise) => {
    setLoading(true); setExercise(value);
    try { setConfigurations(await repository.listConfigurationsByExercise(value.id)); setError(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudieron cargar las configuraciones.'); }
    finally { setLoading(false); }
  }, [repository]);

  useEffect(() => { void loadGroups(); }, [loadGroups]);

  const startExerciseEditor = (value: Exercise | 'new') => {
    setExerciseEditor(value);
    setExerciseForm(value === 'new' ? emptyExercise(group?.id ?? groups[0]?.id ?? '') : {
      groupId: value.groupId, nameEs: value.nameEs, technicalPattern: value.technicalPattern ?? '',
      primary: value.primaryMuscles.join(', '), secondary: value.secondaryMuscles.join(', '),
    });
  };

  const saveExercise = async () => {
    if (!exerciseForm.groupId || !exerciseForm.nameEs.trim()) {
      Alert.alert('Faltan datos', 'Selecciona un grupo e introduce un nombre.'); return;
    }
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true);
    try {
      const input = {
        groupId: exerciseForm.groupId, nameEs: exerciseForm.nameEs,
        technicalPattern: exerciseForm.technicalPattern || null,
        primaryMuscles: splitValues(exerciseForm.primary), secondaryMuscles: splitValues(exerciseForm.secondary),
      };
      if (exerciseEditor === 'new') await repository.createCustomExercise(input);
      else if (exerciseEditor) await repository.updateCustomExercise(exerciseEditor.id, input);
      setExerciseEditor(null);
      const currentGroup = groups.find((item) => item.id === exerciseForm.groupId) ?? group;
      await loadGroups();
      if (currentGroup) await openGroup(currentGroup);
    } catch (reason) { Alert.alert('No se pudo guardar', reason instanceof Error ? reason.message : 'Error inesperado.'); }
    finally { savingRef.current = false; setSaving(false); }
  };

  const startConfigurationEditor = (value: ExerciseConfiguration | 'new') => {
    setConfigurationEditor(value);
    setConfigurationForm(value === 'new' ? emptyConfiguration() : {
      nameEs: value.nameEs, equipmentOptions: value.equipmentOptions,
      lateralityOptions: value.lateralityOptions, gripOptions: value.gripOptions,
      gripWidthOptions: value.gripWidthOptions, attachment: value.attachment ?? '',
      auxiliaryEquipment: value.auxiliaryEquipment.join(', '), bandType: value.bandType.join(', '),
      anchorRequired: value.anchorRequired, anchorHeightOptions: value.anchorHeightOptions.join(', '),
      doseUnit: value.doseUnit, loadMode: value.loadMode,
    });
  };

  const saveConfiguration = async () => {
    if (!exercise || !configurationForm.nameEs.trim() || configurationForm.equipmentOptions.length === 0) {
      Alert.alert('Faltan datos', 'Introduce un nombre y selecciona equipamiento.'); return;
    }
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true);
    const input: CreateCustomConfigurationInput = {
      exerciseId: exercise.id, nameEs: configurationForm.nameEs,
      equipmentOptions: configurationForm.equipmentOptions,
      lateralityOptions: configurationForm.lateralityOptions, gripOptions: configurationForm.gripOptions,
      gripWidthOptions: configurationForm.gripWidthOptions, attachment: configurationForm.attachment || null,
      auxiliaryEquipment: splitValues(configurationForm.auxiliaryEquipment),
      bandType: splitValues(configurationForm.bandType), anchorRequired: configurationForm.anchorRequired,
      anchorHeightOptions: splitValues(configurationForm.anchorHeightOptions),
      doseUnit: configurationForm.doseUnit, loadMode: configurationForm.loadMode,
    };
    try {
      if (configurationEditor === 'new') await repository.createCustomConfiguration(input);
      else if (configurationEditor) await repository.updateCustomConfiguration(configurationEditor.id, input);
      setConfigurationEditor(null); await openExercise(exercise);
    } catch (reason) { Alert.alert('No se pudo guardar', reason instanceof Error ? reason.message : 'Error inesperado.'); }
    finally { savingRef.current = false; setSaving(false); }
  };

  const deactivateExercise = (value: Exercise) => Alert.alert(
    'Desactivar ejercicio', `¿Desactivar “${value.nameEs}”?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Desactivar', style: 'destructive', onPress: () => void (async () => {
        try {
          await repository.setCustomExerciseActive(value.id, false);
          if (group) await openGroup(group); await loadGroups();
        } catch (reason) { Alert.alert('No se pudo desactivar', reason instanceof Error ? reason.message : 'Error inesperado.'); }
      })() },
    ],
  );
  const deactivateConfiguration = (value: ExerciseConfiguration) => Alert.alert(
    'Desactivar configuración', `¿Desactivar “${value.nameEs}”?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Desactivar', style: 'destructive', onPress: () => void (async () => {
        try {
          await repository.setCustomConfigurationActive(value.id, false);
          if (exercise) await openExercise(exercise);
        } catch (reason) { Alert.alert('No se pudo desactivar', reason instanceof Error ? reason.message : 'Error inesperado.'); }
      })() },
    ],
  );

  const title = exercise?.nameEs ?? group?.nameEs ?? 'Ejercicios';
  const goBack = () => {
    if (exercise) { setExercise(null); setConfigurations([]); }
    else if (group) { setGroup(null); setExercises([]); void loadGroups(); }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        {(group || exercise) && <Pressable onPress={goBack}><Text style={styles.link}>‹ Atrás</Text></Pressable>}
        <Text style={styles.eyebrow}>CATÁLOGO</Text>
        <Text style={styles.title}>{title}</Text>
        {!group && <Text style={styles.subtitle}>Elige un grupo para explorar sus ejercicios.</Text>}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {loading ? <ActivityIndicator style={styles.loader} color="#0e7490" /> : !group ? (
        <FlatList
          data={groups} keyExtractor={(item) => item.id} contentContainerStyle={styles.list}
          ListHeaderComponent={<Pressable style={styles.primaryButton} onPress={() => startExerciseEditor('new')}><Text style={styles.primaryButtonText}>Añadir ejercicio</Text></Pressable>}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => void openGroup(item)}>
              <View style={styles.cardBody}><Text style={styles.cardTitle}>{item.nameEs}</Text><Text style={styles.muted}>{item.activeExerciseCount} ejercicios</Text></View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
        />
      ) : !exercise ? (
        <FlatList
          data={exercises} keyExtractor={(item) => item.id} contentContainerStyle={styles.list}
          ListHeaderComponent={<Pressable style={styles.primaryButton} onPress={() => startExerciseEditor('new')}><Text style={styles.primaryButtonText}>Añadir ejercicio en este grupo</Text></Pressable>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Pressable style={styles.cardBody} onPress={() => void openExercise(item)}><Text style={styles.cardTitle}>{item.nameEs}</Text><Text style={styles.muted}>Ver configuraciones</Text></Pressable>
              {item.origin === 'CUSTOM' && <View style={styles.actions}><Pressable onPress={() => startExerciseEditor(item)}><Text style={styles.link}>Editar</Text></Pressable><Pressable onPress={() => deactivateExercise(item)}><Text style={styles.danger}>Desactivar</Text></Pressable></View>}
              <Text style={styles.chevron}>›</Text>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={configurations} keyExtractor={(item) => item.id} contentContainerStyle={styles.list}
          ListHeaderComponent={<Pressable style={styles.primaryButton} onPress={() => startConfigurationEditor('new')}><Text style={styles.primaryButtonText}>Añadir configuración</Text></Pressable>}
          renderItem={({ item }) => (
            <View style={[styles.card, styles.configurationCard]}>
              <Text style={styles.cardTitle}>{item.nameEs}</Text>
              {configurationDetails(item).map((detail) => <Text key={detail.label} style={styles.detail}><Text style={styles.detailLabel}>{detail.label}: </Text>{detail.value}</Text>)}
              {item.origin === 'CUSTOM' && <View style={styles.inlineActions}><Pressable onPress={() => startConfigurationEditor(item)}><Text style={styles.link}>Editar</Text></Pressable><Pressable onPress={() => deactivateConfiguration(item)}><Text style={styles.danger}>Desactivar</Text></Pressable></View>}
            </View>
          )}
        />
      )}

      <Sheet visible={exerciseEditor !== null} title={exerciseEditor === 'new' ? 'Nuevo ejercicio' : 'Editar ejercicio'} onClose={() => setExerciseEditor(null)}>
        <Text style={styles.label}>Grupo</Text>
        <ChoiceChips
          values={groups.map((item) => item.id)} selected={[exerciseForm.groupId]}
          renderLabel={(id) => groups.find((item) => item.id === id)?.nameEs ?? ''}
          onChange={([groupId]) => setExerciseForm((old) => ({ ...old, groupId }))}
        />
        <Field label="Nombre *" value={exerciseForm.nameEs} onChangeText={(nameEs) => setExerciseForm((old) => ({ ...old, nameEs }))} />
        <Field label="Patrón técnico (opcional)" value={exerciseForm.technicalPattern} onChangeText={(technicalPattern) => setExerciseForm((old) => ({ ...old, technicalPattern }))} />
        <Field label="Músculos principales (separados por comas)" value={exerciseForm.primary} onChangeText={(primary) => setExerciseForm((old) => ({ ...old, primary }))} />
        <Field label="Músculos secundarios (separados por comas)" value={exerciseForm.secondary} onChangeText={(secondary) => setExerciseForm((old) => ({ ...old, secondary }))} />
        <Pressable disabled={saving} style={[styles.primaryButton, saving && styles.buttonDisabled]} onPress={() => void saveExercise()}><Text style={styles.primaryButtonText}>{saving ? 'Guardando…' : 'Guardar ejercicio'}</Text></Pressable>
      </Sheet>

      <Sheet visible={configurationEditor !== null} title={configurationEditor === 'new' ? 'Nueva configuración' : 'Editar configuración'} onClose={() => setConfigurationEditor(null)}>
        <Field label="Nombre *" value={configurationForm.nameEs} onChangeText={(nameEs) => setConfigurationForm((old) => ({ ...old, nameEs }))} />
        <Text style={styles.label}>Equipamiento *</Text><ChoiceChips values={EQUIPMENT} selected={configurationForm.equipmentOptions} multiple onChange={(equipmentOptions) => setConfigurationForm((old) => ({ ...old, equipmentOptions }))} />
        <Text style={styles.label}>Lateralidad (opcional)</Text><ChoiceChips values={LATERALITY} selected={configurationForm.lateralityOptions} multiple onChange={(lateralityOptions) => setConfigurationForm((old) => ({ ...old, lateralityOptions }))} />
        <Text style={styles.label}>Agarre (opcional)</Text><ChoiceChips values={GRIPS} selected={configurationForm.gripOptions} multiple onChange={(gripOptions) => setConfigurationForm((old) => ({ ...old, gripOptions }))} />
        <Text style={styles.label}>Anchura (opcional)</Text><ChoiceChips values={WIDTHS} selected={configurationForm.gripWidthOptions} multiple onChange={(gripWidthOptions) => setConfigurationForm((old) => ({ ...old, gripWidthOptions }))} />
        <Field label="Accesorio/configuración (opcional)" value={configurationForm.attachment} onChangeText={(attachment) => setConfigurationForm((old) => ({ ...old, attachment }))} />
        <Field label="Equipo auxiliar (separado por comas)" value={configurationForm.auxiliaryEquipment} onChangeText={(auxiliaryEquipment) => setConfigurationForm((old) => ({ ...old, auxiliaryEquipment }))} />
        <Field label="Tipo de banda (opcional)" value={configurationForm.bandType} onChangeText={(bandType) => setConfigurationForm((old) => ({ ...old, bandType }))} />
        <Pressable style={styles.toggle} onPress={() => setConfigurationForm((old) => ({ ...old, anchorRequired: !old.anchorRequired }))}><Text style={styles.toggleText}>{configurationForm.anchorRequired ? '✓' : '○'} Requiere anclaje</Text></Pressable>
        {configurationForm.anchorRequired && <Field label="Alturas de anclaje (separadas por comas)" value={configurationForm.anchorHeightOptions} onChangeText={(anchorHeightOptions) => setConfigurationForm((old) => ({ ...old, anchorHeightOptions }))} />}
        <Text style={styles.label}>Unidad de dosis *</Text><ChoiceChips values={DOSE_UNITS} selected={[configurationForm.doseUnit]} onChange={([doseUnit]) => setConfigurationForm((old) => ({ ...old, doseUnit: doseUnit as DoseUnit }))} />
        <Text style={styles.label}>Modo de carga *</Text><ChoiceChips values={LOAD_MODES} selected={[configurationForm.loadMode]} onChange={([loadMode]) => setConfigurationForm((old) => ({ ...old, loadMode: loadMode as LoadMode }))} />
        <Pressable disabled={saving} style={[styles.primaryButton, saving && styles.buttonDisabled]} onPress={() => void saveConfiguration()}><Text style={styles.primaryButtonText}>{saving ? 'Guardando…' : 'Guardar configuración'}</Text></Pressable>
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' }, header: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 10 },
  eyebrow: { color: '#0e7490', fontSize: 12, fontWeight: '800', letterSpacing: 1.4, marginTop: 8 },
  title: { color: '#0f172a', fontSize: 30, fontWeight: '800', marginTop: 4 }, subtitle: { color: '#64748b', fontSize: 16, marginTop: 6 },
  list: { padding: 16, paddingBottom: 40, gap: 10 }, loader: { flex: 1 }, error: { color: '#b91c1c', paddingHorizontal: 22, paddingVertical: 8 },
  card: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#e2e8f0', borderRadius: 16, borderWidth: 1, flexDirection: 'row', padding: 16 },
  cardBody: { flex: 1 }, cardTitle: { color: '#0f172a', fontSize: 17, fontWeight: '700' }, muted: { color: '#64748b', marginTop: 4 }, chevron: { color: '#0891b2', fontSize: 28, marginLeft: 8 },
  primaryButton: { alignItems: 'center', backgroundColor: '#0e7490', borderRadius: 12, marginBottom: 8, padding: 14 }, primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 },
  actions: { alignItems: 'flex-end', gap: 8, marginLeft: 12 }, inlineActions: { flexDirection: 'row', gap: 20, marginTop: 14 }, link: { color: '#0e7490', fontSize: 16, fontWeight: '700' }, danger: { color: '#b91c1c', fontWeight: '700' },
  configurationCard: { alignItems: 'stretch', flexDirection: 'column' }, detail: { color: '#475569', marginTop: 6 }, detailLabel: { color: '#334155', fontWeight: '700' },
  modalHeader: { alignItems: 'center', borderBottomColor: '#e2e8f0', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 18 }, modalTitle: { color: '#0f172a', fontSize: 22, fontWeight: '800' },
  form: { padding: 20, paddingBottom: 50 }, field: { marginBottom: 18 }, label: { color: '#334155', fontSize: 14, fontWeight: '700', marginBottom: 8, marginTop: 4 },
  input: { backgroundColor: '#fff', borderColor: '#cbd5e1', borderRadius: 10, borderWidth: 1, color: '#0f172a', fontSize: 16, padding: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }, chip: { backgroundColor: '#e2e8f0', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }, chipActive: { backgroundColor: '#0e7490' }, chipText: { color: '#334155', fontSize: 13 }, chipTextActive: { color: '#fff', fontWeight: '700' },
  toggle: { backgroundColor: '#e2e8f0', borderRadius: 10, marginBottom: 18, padding: 12 }, toggleText: { color: '#334155', fontWeight: '700' },
});
