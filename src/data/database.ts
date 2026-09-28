import type { Database } from './types.ts';

// Schema v1 is intentionally a fresh gymRegister schema, independent from gymCoach migrations.
export const SCHEMA_V1 = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS schema_metadata (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS exercise_groups (
    id TEXT PRIMARY KEY NOT NULL,
    name_es TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
  );

  CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY NOT NULL,
    group_id TEXT NOT NULL,
    name_es TEXT NOT NULL,
    technical_pattern TEXT,
    primary_muscles TEXT,
    secondary_muscles TEXT,
    origin TEXT NOT NULL CHECK (origin IN ('SYSTEM', 'CUSTOM')),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (group_id) REFERENCES exercise_groups(id)
  );

  CREATE TABLE IF NOT EXISTS exercise_configurations (
    id TEXT PRIMARY KEY NOT NULL,
    exercise_id TEXT NOT NULL,
    name_es TEXT NOT NULL,
    equipment_options TEXT NOT NULL,
    laterality_options TEXT,
    grip_options TEXT,
    grip_width_options TEXT,
    attachment TEXT,
    auxiliary_equipment TEXT,
    band_type TEXT,
    anchor_required INTEGER NOT NULL DEFAULT 0 CHECK (anchor_required IN (0, 1)),
    anchor_height_options TEXT,
    dose_unit TEXT NOT NULL CHECK (dose_unit IN ('reps', 'seconds', 'meters')),
    load_mode TEXT NOT NULL CHECK (load_mode IN ('TOTAL_KG', 'IMPLEMENT_KG', 'DISPLAYED_KG', 'ASSISTANCE_KG', 'BAND_LABEL', 'BODYWEIGHT', 'NONE')),
    origin TEXT NOT NULL CHECK (origin IN ('SYSTEM', 'CUSTOM')),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (exercise_id) REFERENCES exercises(id)
  );

  CREATE TABLE IF NOT EXISTS training_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'in_progress', 'completed')),
    note TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS training_sessions_single_in_progress_idx
    ON training_sessions ((1)) WHERE status = 'in_progress';
  CREATE UNIQUE INDEX IF NOT EXISTS training_sessions_single_draft_idx
    ON training_sessions ((1)) WHERE status = 'draft';

  CREATE TABLE IF NOT EXISTS session_exercises (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    configuration_id TEXT NOT NULL,
    exercise_name_snapshot TEXT,
    configuration_name_snapshot TEXT,
    order_index INTEGER NOT NULL CHECK (order_index >= 0),
    selected_equipment TEXT,
    selected_laterality TEXT,
    selected_grip TEXT,
    selected_grip_width TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (session_id, order_index),
    FOREIGN KEY (session_id) REFERENCES training_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (exercise_id) REFERENCES exercises(id),
    FOREIGN KEY (configuration_id) REFERENCES exercise_configurations(id)
  );

  CREATE TABLE IF NOT EXISTS performed_sets (
    id TEXT PRIMARY KEY NOT NULL,
    session_exercise_id TEXT NOT NULL,
    set_index INTEGER NOT NULL CHECK (set_index >= 0),
    dose_unit TEXT NOT NULL CHECK (dose_unit IN ('reps', 'seconds', 'meters')),
    dose_value REAL NOT NULL CHECK (dose_value > 0),
    per_side INTEGER NOT NULL DEFAULT 0 CHECK (per_side IN (0, 1)),
    load_mode TEXT NOT NULL CHECK (load_mode IN ('TOTAL_KG', 'IMPLEMENT_KG', 'DISPLAYED_KG', 'ASSISTANCE_KG', 'BAND_LABEL', 'BODYWEIGHT', 'NONE')),
    load_value REAL CHECK (load_value IS NULL OR load_value >= 0),
    load_label TEXT,
    rir INTEGER CHECK (rir IS NULL OR rir BETWEEN 0 AND 5),
    confirmed_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (session_exercise_id, set_index),
    FOREIGN KEY (session_exercise_id) REFERENCES session_exercises(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS session_exercises_session_idx
    ON session_exercises (session_id, order_index);
  CREATE INDEX IF NOT EXISTS performed_sets_exercise_idx
    ON performed_sets (session_exercise_id, set_index);

  INSERT INTO schema_metadata (key, value) VALUES ('version', '1')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value;
`;

export async function initializeDatabase(database: Database): Promise<void> {
  await database.execAsync(SCHEMA_V1);
}
