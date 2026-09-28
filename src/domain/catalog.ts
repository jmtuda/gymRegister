import type { DoseUnit, LoadMode } from './training.ts';

export type CatalogOrigin = 'SYSTEM' | 'CUSTOM';

export interface ExerciseGroup {
  id: string;
  nameEs: string;
  sortOrder: number;
  active: boolean;
  activeExerciseCount: number;
}

export interface Exercise {
  id: string;
  groupId: string;
  nameEs: string;
  technicalPattern: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  origin: CatalogOrigin;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExerciseConfiguration {
  id: string;
  exerciseId: string;
  nameEs: string;
  equipmentOptions: string[];
  lateralityOptions: string[];
  gripOptions: string[];
  gripWidthOptions: string[];
  attachment: string | null;
  auxiliaryEquipment: string[];
  bandType: string[];
  anchorRequired: boolean;
  anchorHeightOptions: string[];
  doseUnit: DoseUnit;
  loadMode: LoadMode;
  origin: CatalogOrigin;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogSeedData {
  catalogId: string;
  groups: { id: string; nameEs: string; sortOrder: number }[];
  exercises: {
    id: string; groupId: string; nameEs: string; technicalPattern?: string | null;
    primaryMuscles?: string[]; secondaryMuscles?: string[]; origin: CatalogOrigin; active: boolean;
  }[];
  configurations: {
    id: string; exerciseId: string; nameEs: string; equipmentOptions: string[];
    lateralityOptions?: string[]; gripOptions?: string[]; gripWidthOptions?: string[];
    attachment?: string | null; auxiliaryEquipment?: string[]; bandType?: string[];
    anchorRequired?: boolean; anchorHeightOptions?: string[]; doseUnit: DoseUnit;
    loadMode: LoadMode; origin: CatalogOrigin; active: boolean;
  }[];
}
