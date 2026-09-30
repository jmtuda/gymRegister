# Modelo de datos

## Principios

El MVP usa SQLite como fuente operativa local.

El modelo debe:

- ser pequeño;
- separar catálogo e historial;
- conservar hechos realizados;
- soportar funcionamiento offline;
- usar IDs globales desde el primer día;
- permitir añadir Supabase después sin rediseñar el dominio.

Se recomienda UUID para entidades creadas por el usuario.

## Entidades

### exercise_groups

Primer nivel del catálogo.

Campos:

- `id TEXT PRIMARY KEY`
- `name_es TEXT NOT NULL`
- `sort_order INTEGER NOT NULL`
- `active INTEGER NOT NULL DEFAULT 1`

### exercises

Ejercicio base.

Campos:

- `id TEXT PRIMARY KEY`
- `group_id TEXT NOT NULL`
- `name_es TEXT NOT NULL`
- `technical_pattern TEXT NULL`
- `primary_muscles TEXT NULL`
- `secondary_muscles TEXT NULL`
- `origin TEXT NOT NULL` — `SYSTEM | CUSTOM`
- `active INTEGER NOT NULL DEFAULT 1`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

### exercise_configurations

Configuraciones/variantes disponibles para un ejercicio.

Campos:

- `id TEXT PRIMARY KEY`
- `exercise_id TEXT NOT NULL`
- `name_es TEXT NOT NULL`
- `equipment_options TEXT NOT NULL`
- `laterality_options TEXT NULL`
- `grip_options TEXT NULL`
- `grip_width_options TEXT NULL`
- `attachment TEXT NULL`
- `auxiliary_equipment TEXT NULL`
- `band_type TEXT NULL`
- `anchor_required INTEGER NOT NULL DEFAULT 0`
- `anchor_height_options TEXT NULL`
- `dose_unit TEXT NOT NULL`
- `load_mode TEXT NOT NULL`
- `origin TEXT NOT NULL` — `SYSTEM | CUSTOM`
- `active INTEGER NOT NULL DEFAULT 1`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Las colecciones pequeñas pueden persistirse como JSON serializado en SQLite durante el MVP.

### training_sessions

Campos:

- `id TEXT PRIMARY KEY`
- `status TEXT NOT NULL` — `draft | in_progress | completed`
- `note TEXT NULL`
- `created_at TEXT NOT NULL`
- `started_at TEXT NULL`
- `completed_at TEXT NULL`
- `updated_at TEXT NOT NULL`

Regla: solo puede existir una sesión `in_progress`.

### session_exercises

Representa un ejercicio concreto dentro de una sesión.

Campos:

- `id TEXT PRIMARY KEY`
- `session_id TEXT NOT NULL`
- `exercise_id TEXT NOT NULL`
- `configuration_id TEXT NOT NULL`
- `order_index INTEGER NOT NULL`
- `selected_equipment TEXT NULL`
- `selected_laterality TEXT NULL`
- `selected_grip TEXT NULL`
- `selected_grip_width TEXT NULL`
- `note TEXT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Además de las referencias al catálogo, la implementación debe valorar guardar un pequeño snapshot textual de nombre/configuración para que el historial siga siendo legible si un elemento se renombra posteriormente.

### performed_sets

Cada fila representa una serie realmente registrada.

Campos:

- `id TEXT PRIMARY KEY`
- `session_exercise_id TEXT NOT NULL`
- `set_index INTEGER NOT NULL`
- `dose_unit TEXT NOT NULL`
- `dose_value REAL NOT NULL`
- `per_side INTEGER NOT NULL DEFAULT 0`
- `load_mode TEXT NOT NULL`
- `load_value REAL NULL`
- `load_label TEXT NULL`
- `rir INTEGER NULL`
- `confirmed_at TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Restricciones:

- `dose_value > 0`;
- `rir` entre 0 y 5 cuando exista;
- `load_value >= 0` cuando exista;
- una serie debe tener ID único para que confirmar dos veces no produzca duplicados.

## Planificado frente a realizado

gymRegister no planifica series.

Por tanto, una serie solo existe en `performed_sets` cuando el usuario la confirma.

Los campos vacíos de UI no se convierten en datos históricos.

## Edición durante la sesión

Mientras la sesión está `draft` o `in_progress`:

- se pueden añadir/eliminar/reordenar ejercicios;
- se pueden añadir/editar/eliminar series;
- se pueden editar notas.

Al completar la sesión se considera cerrada para el flujo normal.

El alta histórica manual no utiliza estados `draft` ni `in_progress`: construye
la entrada en memoria y crea en una única transacción la sesión `completed`, sus
ejercicios y sus series. `completed_at` procede del usuario; `started_at` se
calcula solo si indica duración; `created_at`, `updated_at` y `confirmed_at`
representan el momento real de guardado.

## Borrado y desactivación

Los elementos del catálogo que ya aparezcan en historial no deben borrarse físicamente.

Se usa `active = 0`.

Las sesiones completadas tampoco deben depender de que una configuración siga activa.
Permanecen inmutables para la edición ordinaria, pero pueden borrarse explícitamente.
La eliminación valida el estado y se ejecuta en una transacción exclusiva; las
cascadas de `session_exercises` y `performed_sets` evitan datos huérfanos.

## Defaults de captura

La consulta de últimos valores reutilizables vive en el repositorio. Prioriza la
última serie del mismo `session_exercise` y después la última sesión `completed`
con igual ejercicio, configuración y selecciones concretas. Solo devuelve datos
si `dose_unit` y `load_mode` siguen siendo idénticos. Es una lectura: no crea
ningún hecho en `performed_sets`.

## Exportación

### CSV

Una fila por serie confirmada. Las sesiones y ejercicios sin series no generan
filas ficticias. El orden es sesión, ejercicio y serie, y los valores de texto se
escapan conforme a CSV UTF-8.

Columnas mínimas:

- session_id
- fecha
- exercise_order
- grupo
- ejercicio
- configuración
- equipamiento
- lateralidad
- agarre
- set_index
- dose_unit
- dose_value
- load_mode
- load_value
- load_label
- rir
- exercise_note
- session_note

### JSON

Es un documento con `exportVersion = 1`, `generatedAt` ISO y la estructura completa:

```text
sessions[]
  ├── session
  └── exercises[]
       └── sets[]
```

El JSON conserva también sesiones y ejercicios sin series. Será el formato de
mayor fidelidad para una futura tarea de backup/restauración; TASK-006 no incluye
importación.

## Preparación para Supabase

Supabase queda fuera del MVP local, pero desde el primer día:

- todos los IDs de datos del usuario serán globales;
- todas las entidades mutables tendrán `created_at` y `updated_at`;
- UI y dominio no ejecutarán SQL directamente;
- la persistencia se encapsulará en repositorios/servicios;
- el catálogo del sistema tendrá IDs estables.

Así podrá añadirse más adelante una capa de sincronización sin cambiar el modelo funcional.
