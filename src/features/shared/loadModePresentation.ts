import type { LoadMode } from '../../domain/training.ts';

const NUMERIC_LOAD_LABELS: Partial<Record<LoadMode, string>> = {
  TOTAL_KG: 'kg totales',
  IMPLEMENT_KG: 'kg por implemento',
  DISPLAYED_KG: 'kg mostrados por máquina/polea',
  ASSISTANCE_KG: 'kg de asistencia',
};

export function numericLoadLabel(loadMode: LoadMode): string | null {
  return NUMERIC_LOAD_LABELS[loadMode] ?? null;
}
