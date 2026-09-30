# Plan de implementación

## Estrategia

Primero se construye un MVP completamente local.

Supabase se pospone hasta que estén estabilizados:

- catálogo;
- creación de sesión;
- ejecución;
- historial;
- exportación.

Esto reduce el riesgo y permite reutilizar las partes útiles de gymCoach sin arrastrar su motor metodológico.

## Stack propuesto

Mantener la base tecnológica conocida de gymCoach salvo motivo técnico claro para cambiarla:

- React Native
- Expo
- TypeScript
- Expo Router
- SQLite local

gymCoach es referencia de implementación, no dependencia del nuevo proyecto.

## TASK-001 — Proyecto base y persistencia ✅

Objetivo:

- inicializar la app;
- configurar navegación mínima;
- configurar SQLite;
- crear schema v1 limpio;
- repositorios básicos;
- UUID y timestamps;
- pruebas de persistencia.

Criterios:

- arranque limpio;
- migración inicial reproducible;
- ninguna dependencia de gymCoach en runtime.

## TASK-002 — Catálogo ✅

Objetivo:

- incorporar el catálogo aprobado;
- 9 grupos;
- 29 ejercicios base;
- mínimo 108 configuraciones;
- navegación grupo → ejercicio → configuración;
- soporte SYSTEM/CUSTOM;
- alta de nuevo ejercicio;
- alta de nueva configuración.

Criterios:

- no hay recomendaciones;
- campos no aplicables no se muestran;
- IDs estables;
- desactivar no borra historial.

## TASK-003 — Crear sesión manual ✅

Objetivo:

- botón Crear sesión;
- sesión `draft`;
- añadir ejercicios sin límite;
- guardar elección concreta de equipamiento/lateralidad/agarre;
- reordenar;
- eliminar;
- nota opcional;
- iniciar sesión.

Criterios:

- no se crean series automáticamente;
- no se pide número de series;
- no se pide carga o RIR antes de entrenar.

## TASK-004 — Ejecución y series ✅

Objetivo:

- sesión `in_progress`;
- registrar series una a una;
- dosis según reps/seconds/meters;
- carga según `load_mode`;
- RIR opcional;
- confirmar, editar y eliminar;
- añadir ejercicios durante la sesión;
- temporizador de descanso;
- notas de ejercicio.

Reutilizar conceptualmente de gymCoach:

- serie confirmada como hecho;
- validación por capacidad de ejecución;
- idempotencia;
- restauración del estado desde persistencia;
- temporizador efímero.

No reutilizar:

- prescripciones;
- progresión;
- recovery;
- contexto;
- motor adaptativo.

## TASK-005 — Finalización e historial ✅

Objetivo:

- finalizar sesión;
- estado `completed`;
- nota opcional;
- lista cronológica;
- detalle de sesión;
- reconstrucción exacta de ejercicios/configuraciones/series.

Criterios:

- solo cuentan series confirmadas;
- historial independiente de cambios posteriores del catálogo;
- no existe feedback metodológico obligatorio.

## TASK-006 — Exportación ✅

Objetivo:

- exportar CSV;
- exportar JSON;
- compartir/guardar archivo desde el dispositivo.

Criterios:

- CSV: una fila por serie;
- JSON: estructura completa;
- exportación no altera datos.

## TASK-007 — Pulido y pruebas del MVP ✅

Objetivo:

- pruebas de flujos completos;
- validaciones;
- errores de entrada;
- recuperación tras cerrar/reabrir app;
- doble pulsación;
- sesión activa;
- catálogo custom;
- revisión UX.

Contratos que deben estar cubiertos por tests:

- una serie confirmada no se duplica;
- lo no confirmado no cuenta como realizado;
- no hay límite de ejercicios ni series impuesto por lógica de negocio;
- configuración elegida conserva su identidad;
- editar catálogo no reescribe historial;
- una sesión completada conserva sus datos;
- solo existe una sesión activa.

## Estado final del MVP local

TASK-001 a TASK-007 están completadas. El producto permite gestionar el catálogo
SYSTEM/CUSTOM, crear y ejecutar sesiones manuales, conservar un historial cerrado
y exportarlo en CSV o JSON mediante las capacidades nativas del dispositivo.

SQLite es la única fuente operativa. Los snapshots de nombres y la semántica
persistida de cada serie mantienen estable el historial aunque cambie el catálogo.
Las pruebas cubren recuperación tras recrear repositorios, idempotencia, rollback,
inmutabilidad de sesiones completadas y exportación de solo lectura.

## Ajustes posteriores al MVP móvil ✅

- descanso automático de 60 segundos tras una serie nueva, calculado con deadline;
- vista de descanso a pantalla completa, ajustes ±15 s y keep-awake limitado a la cuenta activa;
- precarga editable de los últimos valores semánticamente compatibles;
- borrado transaccional explícito de sesiones completadas;
- alta histórica manual construida en memoria y persistida atómicamente;
- cobertura de idempotencia, prioridad de defaults, rollback, coexistencia con una
  sesión activa y exportación posterior.

## Fase posterior — Supabase (no iniciada)

No iniciar hasta aprobar el MVP local.

Alcance previsto:

- Supabase Auth para una única cuenta;
- tablas cloud equivalentes;
- RLS;
- sincronización de sesiones completadas;
- cola de pendientes;
- upsert idempotente;
- restauración en nueva instalación;
- estrategia explícita para datos custom del catálogo.

SQLite seguirá siendo la base operativa durante el entrenamiento.

## Orden de reutilización desde gymCoach

### Reutilizar/adaptar

- componentes visuales útiles;
- navegación si encaja;
- mecánica de ejecución;
- temporizador;
- contratos de series realizadas;
- patrones de repositorios SQLite;
- tests de idempotencia e integridad;
- nombres y amplitud del catálogo v2.2.

### No trasladar

- `baseSessionProposal`;
- `adaptiveSession`;
- `baseSelectionHierarchy`;
- planificación;
- progression engine;
- recovery;
- actividades;
- preferencias metodológicas;
- migraciones legacy;
- compatibilidad v2.1;
- explicaciones del motor.

## Regla de documentación

Antes de crear un documento nuevo, ampliar uno de estos cuatro cuando sea posible:

- PRODUCT
- CATALOG
- DATA_MODEL
- IMPLEMENTATION_PLAN

El objetivo es mantener la documentación pequeña, vigente y ejecutable por Codex.
