import type { ExerciseConfiguration } from '../../domain/catalog.ts';

const LABELS: Record<string, string> = {
  BARBELL: 'Barra', DUMBBELL: 'Mancuerna', KETTLEBELL: 'Kettlebell', MACHINE: 'Máquina',
  CABLE: 'Polea', BAND: 'Banda', BODYWEIGHT: 'Peso corporal', BILATERAL: 'Bilateral',
  UNILATERAL: 'Unilateral', ALTERNATING: 'Alternado', PRONATED: 'Pronado',
  SUPINATED: 'Supinado', NEUTRAL: 'Neutro', MIXED: 'Mixto', BY_ATTACHMENT: 'Según accesorio',
  NARROW: 'Estrecho', MEDIUM: 'Medio', WIDE: 'Ancho', HIGH: 'Alto', LOW: 'Bajo',
};

export const labelForOption = (value: string) => LABELS[value] ?? value;

export type ConfigurationDetail = { label: string; value: string };

export function configurationDetails(configuration: ExerciseConfiguration): ConfigurationDetail[] {
  const details: (ConfigurationDetail | null)[] = [
    configuration.equipmentOptions.length
      ? { label: 'Equipamiento', value: configuration.equipmentOptions.map(labelForOption).join(', ') } : null,
    configuration.lateralityOptions.length
      ? { label: 'Lateralidad', value: configuration.lateralityOptions.map(labelForOption).join(', ') } : null,
    configuration.gripOptions.length
      ? { label: 'Agarre', value: configuration.gripOptions.map(labelForOption).join(', ') } : null,
    configuration.gripWidthOptions.length
      ? { label: 'Anchura', value: configuration.gripWidthOptions.map(labelForOption).join(', ') } : null,
    configuration.attachment ? { label: 'Accesorio', value: configuration.attachment } : null,
  ];
  return details.filter((detail): detail is ConfigurationDetail => detail !== null);
}
