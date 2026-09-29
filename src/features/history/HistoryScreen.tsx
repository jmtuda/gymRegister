import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';

import { createHistoryRepository } from '../../data/historyRepository.ts';
import type { CompletedSessionDetail, CompletedSessionSummary } from '../../domain/history.ts';
import type { ExportFormat } from '../../domain/export.ts';
import type { PerformedSet } from '../../domain/training.ts';
import { labelForOption } from '../exercises/catalogPresentation.ts';
import { createExportGate } from '../export/exportGate.ts';
import { createExportService } from '../export/exportService.ts';

const DATE_FORMAT = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium', timeStyle: 'short',
});

function formatDuration(durationMs: number | null): string | null {
  if (durationMs === null) return null;
  const totalMinutes = Math.floor(durationMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

function formatSet(value: PerformedSet): string {
  const unit = value.doseUnit === 'reps' ? 'reps' : value.doseUnit === 'seconds' ? 's' : 'm';
  const numericLoadLabels = {
    TOTAL_KG: 'kg totales', IMPLEMENT_KG: 'kg por implemento',
    DISPLAYED_KG: 'kg mostrados', ASSISTANCE_KG: 'kg de asistencia',
  } as const;
  let load: string | null = null;
  if (value.loadValue !== null && value.loadMode in numericLoadLabels) {
    load = `${value.loadValue} ${numericLoadLabels[value.loadMode as keyof typeof numericLoadLabels]}`;
  } else if (value.loadMode === 'BAND_LABEL' && value.loadLabel) {
    load = `Banda: ${value.loadLabel}`;
  } else if (value.loadMode === 'BODYWEIGHT') {
    load = 'Peso corporal';
  }
  return [
    `${value.doseValue} ${unit}`,
    value.perSide ? 'por lado' : null,
    load,
    value.rir === null ? null : `RIR ${value.rir}`,
  ].filter(Boolean).join(' · ');
}

export function HistoryScreen() {
  const database = useSQLiteContext();
  const history = useMemo(() => createHistoryRepository(database), [database]);
  const exporter = useMemo(() => createExportService(database), [database]);
  const exportGate = useRef(createExportGate()).current;
  const [sessions, setSessions] = useState<CompletedSessionSummary[]>([]);
  const [detail, setDetail] = useState<CompletedSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setSessions(await history.listCompletedSessions()); }
    catch (reason) {
      Alert.alert('No se pudo cargar el historial', reason instanceof Error ? reason.message : 'Error inesperado.');
    }
    finally { setLoading(false); }
  }, [history]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const openDetail = async (id: string) => {
    try { setDetail(await history.getCompletedSessionDetail(id)); }
    catch (reason) { Alert.alert('No se pudo abrir la sesión', reason instanceof Error ? reason.message : 'Error inesperado.'); }
  };
  const exportData = async (format: ExportFormat) => {
    setExportOpen(false);
    await exportGate.run(async () => {
      setExporting(format);
      try {
        await exporter.export(format);
      } catch (reason) {
        Alert.alert('No se pudo exportar', reason instanceof Error ? reason.message : 'Error inesperado.');
      } finally {
        setExporting(null);
      }
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>HISTORIAL</Text>
        <Text style={styles.title}>Sesiones completadas</Text>
        <Text style={styles.subtitle}>Consulta exactamente lo que registraste.</Text>
        <Pressable
          disabled={exporting !== null} style={[styles.exportButton, exporting !== null && styles.disabledButton]}
          onPress={() => {
            if (sessions.length === 0) {
              Alert.alert('No hay historial', 'No hay sesiones completadas para exportar.');
              return;
            }
            setExportOpen(true);
          }}
        >
          {exporting !== null && <ActivityIndicator color="#fff" />}
          <Text style={styles.exportButtonText}>{exporting ? `Generando ${exporting.toUpperCase()}…` : 'Exportar historial'}</Text>
        </Pressable>
      </View>
      {loading ? <ActivityIndicator style={styles.loader} color="#0e7490" /> : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, sessions.length === 0 && styles.emptyList]}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no hay sesiones completadas.</Text>}
          renderItem={({ item }) => {
            const duration = formatDuration(item.durationMs);
            return (
              <Pressable style={styles.card} onPress={() => void openDetail(item.id)}>
                <Text style={styles.cardDate}>{DATE_FORMAT.format(new Date(item.completedAt))}</Text>
                <Text style={styles.metrics}>{[
                  duration,
                  `${item.exerciseCount} ${item.exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}`,
                  `${item.setCount} ${item.setCount === 1 ? 'serie' : 'series'}`,
                ].filter(Boolean).join(' · ')}</Text>
                {item.note && <Text numberOfLines={2} style={styles.note}>{item.note}</Text>}
              </Pressable>
            );
          }}
        />
      )}

      <Modal visible={detail !== null} animationType="slide" onRequestClose={() => setDetail(null)}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Detalle de sesión</Text>
            <Pressable onPress={() => setDetail(null)}><Text style={styles.link}>Cerrar</Text></Pressable>
          </View>
          {detail && <ScrollView contentContainerStyle={styles.detail}>
            <Text style={styles.detailDate}>{DATE_FORMAT.format(new Date(detail.session.completedAt))}</Text>
            {formatDuration(detail.durationMs) && <Text style={styles.detailMeta}>Duración: {formatDuration(detail.durationMs)}</Text>}
            {detail.session.note && <View style={styles.noteCard}><Text style={styles.noteLabel}>Nota de sesión</Text><Text style={styles.note}>{detail.session.note}</Text></View>}
            {detail.exercises.map((exercise, index) => (
              <View key={exercise.id} style={styles.exerciseCard}>
                <Text style={styles.exerciseTitle}>{index + 1}. {exercise.exerciseNameSnapshot}</Text>
                <Text style={styles.configuration}>{exercise.configurationNameSnapshot}</Text>
                {[
                  exercise.selectedEquipment, exercise.selectedLaterality,
                  exercise.selectedGrip, exercise.selectedGripWidth,
                ].some(Boolean) && <Text style={styles.selection}>{[
                  exercise.selectedEquipment, exercise.selectedLaterality,
                  exercise.selectedGrip, exercise.selectedGripWidth,
                ].filter(Boolean).map((value) => labelForOption(String(value))).join(' · ')}</Text>}
                {exercise.note && <Text style={styles.exerciseNote}>{exercise.note}</Text>}
                {exercise.sets.length === 0 ? <Text style={styles.noSets}>Sin series registradas</Text> : exercise.sets.map((set) => (
                  <View key={set.id} style={styles.setRow}>
                    <Text style={styles.setIndex}>Serie {set.setIndex + 1}</Text>
                    <Text style={styles.setValue}>{formatSet(set)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>}
        </SafeAreaView>
      </Modal>

      <Modal visible={exportOpen} transparent animationType="fade" onRequestClose={() => setExportOpen(false)}>
        <View style={styles.exportBackdrop}>
          <View style={styles.exportCard}>
            <Text style={styles.exportTitle}>Exportar historial</Text>
            <Text style={styles.exportDescription}>Elige el formato del archivo que quieres compartir o guardar.</Text>
            <Pressable style={styles.exportOption} onPress={() => void exportData('csv')}><Text style={styles.exportOptionText}>Exportar CSV</Text></Pressable>
            <Pressable style={styles.exportOption} onPress={() => void exportData('json')}><Text style={styles.exportOptionText}>Exportar JSON</Text></Pressable>
            <Pressable style={styles.cancelOption} onPress={() => setExportOpen(false)}><Text style={styles.link}>Cancelar</Text></Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#f8fafc', flex: 1 },
  header: { paddingBottom: 8, paddingHorizontal: 22, paddingTop: 16 },
  eyebrow: { color: '#0e7490', fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: '#0f172a', fontSize: 30, fontWeight: '800', marginTop: 4 },
  subtitle: { color: '#64748b', fontSize: 16, marginTop: 6 },
  exportButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#0e7490', borderRadius: 10, flexDirection: 'row', gap: 8, marginTop: 14, paddingHorizontal: 14, paddingVertical: 11 },
  exportButtonText: { color: '#fff', fontWeight: '800' }, disabledButton: { opacity: 0.55 },
  loader: { flex: 1 }, list: { gap: 12, padding: 16, paddingBottom: 48 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  empty: { color: '#64748b', textAlign: 'center' },
  card: { backgroundColor: '#fff', borderColor: '#e2e8f0', borderRadius: 16, borderWidth: 1, padding: 16 },
  cardDate: { color: '#0f172a', fontSize: 17, fontWeight: '800' },
  metrics: { color: '#0e7490', marginTop: 6 }, note: { color: '#475569', lineHeight: 20, marginTop: 7 },
  modalHeader: { alignItems: 'center', borderBottomColor: '#e2e8f0', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 18 },
  modalTitle: { color: '#0f172a', fontSize: 22, fontWeight: '800' }, link: { color: '#0e7490', fontWeight: '700' },
  detail: { gap: 12, padding: 18, paddingBottom: 48 }, detailDate: { color: '#0f172a', fontSize: 20, fontWeight: '800' },
  detailMeta: { color: '#64748b' }, noteCard: { backgroundColor: '#ecfeff', borderRadius: 12, padding: 12 },
  noteLabel: { color: '#155e75', fontWeight: '800' },
  exerciseCard: { backgroundColor: '#fff', borderColor: '#e2e8f0', borderRadius: 16, borderWidth: 1, padding: 14 },
  exerciseTitle: { color: '#0f172a', fontSize: 17, fontWeight: '800' }, configuration: { color: '#475569', marginTop: 3 },
  selection: { color: '#0e7490', fontSize: 12, marginTop: 5 }, exerciseNote: { color: '#475569', fontStyle: 'italic', marginTop: 9 },
  noSets: { color: '#64748b', marginTop: 12 }, setRow: { borderTopColor: '#f1f5f9', borderTopWidth: 1, marginTop: 10, paddingTop: 10 },
  setIndex: { color: '#334155', fontWeight: '700' }, setValue: { color: '#64748b', marginTop: 3 },
  exportBackdrop: { backgroundColor: 'rgba(15, 23, 42, 0.5)', flex: 1, justifyContent: 'center', padding: 22 },
  exportCard: { backgroundColor: '#fff', borderRadius: 18, padding: 20 }, exportTitle: { color: '#0f172a', fontSize: 22, fontWeight: '800' },
  exportDescription: { color: '#64748b', lineHeight: 21, marginBottom: 16, marginTop: 7 },
  exportOption: { alignItems: 'center', backgroundColor: '#0e7490', borderRadius: 10, marginTop: 9, padding: 13 },
  exportOptionText: { color: '#fff', fontWeight: '800' }, cancelOption: { alignItems: 'center', marginTop: 16, padding: 8 },
});
