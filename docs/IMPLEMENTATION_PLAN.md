# Plan de implementación

## Estrategia

Primero se construye un MVP completamente local.

La integración cloud con Neon Free se pospone hasta que estén estabilizados:

- catálogo;
- creación de sesión;
- ejecución;
- historial;
- exportación.

Esto reduce el riesgo y permite reutilizar las partes útiles de gymCoach sin arrastrar su motor metodológico.

## Stack implementado

La aplicación utiliza:

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
- captura inline en la tarjeta del ejercicio activo, con edición en la misma zona
  y descarte del formulario no guardado al cambiar de ejercicio (PR #18);
- cobertura de idempotencia, prioridad de defaults, rollback, coexistencia con una
  sesión activa y exportación posterior.

## Estado operativo de referencia — 7 de octubre de 2026

Base inspeccionada: `main` en `65aea9e` (PR #18). En esta revisión, HEAD local,
`origin/main` y `main` consultada directamente en GitHub coinciden. Este apartado
es una referencia fechada, no una garantía de que futuros checkouts sigan
sincronizados; volver a comprobar GitHub antes de modificar.

### Verificaciones y límites

- `npm run test`: 78 tests aprobados, sin fallos, con Node `v26.7.0` y npm `11.19.0`.
- `git diff --check`: sin errores tras los cambios documentales.
- Tras la inspección de solo lectura, se autorizó preparar el entorno y se ejecutó
  `npm ci --cache ./node_modules/.cache/npm --ignore-scripts --no-audit --no-fund --update-notifier=false`.
  Se instalaron 901 paquetes sin cambiar `package.json` ni `package-lock.json`.
  La caché permanece dentro del proyecto; no se ejecutaron scripts de instalación
  ni una auditoría de vulnerabilidades. Esta instalación se verificó para los
  comandos siguientes, no para cualquier uso futuro de dependencias nativas.
- `npm run lint` y `npm run typecheck`: correctos después de la instalación.
- Bundles locales Android/iOS: correctos mediante el CLI instalado de Expo,
  `export --platform android --platform ios --max-workers 2 --output-dir dist/verification`.
  Se ejecutó offline, sin telemetría ni carga de `.env`, con HOME, temporales y
  cachés redirigidos al proyecto. Los bundles Hermes y `metadata.json` están en
  `dist/verification`, excluido de Git. No son un APK/IPA ni una build nativa.
- La PR #18 declara también Expo Doctor correcto; no se reprodujo Expo Doctor
  en esta revisión.
- Las pruebas cubren SQLite en memoria, reconstrucción de repositorios, rollback,
  idempotencia, semántica histórica, exportación y lógica de captura/descanso.
  Parte de la cobertura de UI comprueba texto fuente, no interacción real.
- El propietario confirma en esta revisión que el APK ya fue generado y probado
  con éxito en un Android físico. Es validación comunicada por el propietario,
  no una prueba ejecutada por el agente. No se ha registrado aquí el identificador
  de build/commit ni el detalle de los flujos probados.
- No se ha comunicado una prueba en dispositivo iOS. No hay workflows de CI
  versionados.

### Seguimiento y siguiente paso

- No hay PR abiertas ni se identificó una funcionalidad parcialmente integrada
  en la base inspeccionada.
- Las issues #9 (TASK-005) y #11 (TASK-006) siguen abiertas pese a tener
  implementación y pruebas en `main`. Reconciliar su seguimiento con aprobación;
  no tratarlas automáticamente como trabajo funcional pendiente.
- El entorno permite ejecutar tests, lint, typecheck y bundles locales, y el
  propietario confirma la prueba satisfactoria del APK en Android físico.
  No repetir esa validación por defecto. Para futuras regresiones, comprobar los
  flujos afectados: arranque offline, captura inline y edición, descanso/keep-awake,
  cierre/reapertura y exportación.
- Actualización del 8 de octubre de 2026: la issue #15 ya se reformuló como
  TASK-008 — Fundación Neon Free y validación de acceso móvil. El siguiente trabajo
  es validar Auth/acceso móvil (Puerta A) y aprobar la arquitectura antes de
  implementar la fundación (Puerta B). El cambio de proveedor fue aprobado por
  el propietario; no hay integración, sincronización ni restauración implementadas.

### Riesgos y decisiones pendientes

- La UI de entrada distingue los modos de carga, pero el resumen de series
  durante entrenamiento muestra cargas numéricas como `kg` genéricos en
  `SessionExecutionScreen.tsx`. Revisar la presentación sin reinterpretar datos.
- El historial local permite borrado explícito; la propuesta original de la
  issue #15 no permitía DELETE cloud. La especificación Neon deja la propagación
  de eliminaciones para una tarea posterior, antes de sincronizar o restaurar.
- Existe exportación, no importación/restauración ni recuperación probada de una
  instalación perdida. No presentar el JSON como backup restaurable implementado.
- El esquema local usa inicialización v1, sin migraciones incrementales. Cualquier
  cambio de esquema futuro debe preservar datos de instalaciones existentes.
- No hay versión de Node fijada. Acordar un entorno reproducible antes de añadir
  CI; el runner actual depende de TypeScript nativo y `node:sqlite`.
- npm informó de dependencias obsoletas durante la instalación y Node emitió
  `MODULE_TYPELESS_PACKAGE_JSON` durante los tests. No se actualizaron versiones
  ni se cambió el tipo de módulo para silenciar avisos; revisar compatibilidad y
  seguridad en una tarea separada, sin confundir estos avisos con una auditoría.

## Fase posterior — Neon Free (planificada, no implementada)

Decisión del propietario, 8 de octubre de 2026: usar Neon en el plan Free en lugar
de Supabase. No hay cuenta/proyecto cloud provisionado ni integración implementada
por el agente. SQLite seguirá siendo la base operativa durante el entrenamiento.

### Presupuesto y viabilidad

- Usar exclusivamente el plan Free. No cambiar de plan, introducir facturación
  ni contratar servicios auxiliares de pago. Si una solución exige coste adicional,
  detenerse y comunicar el bloqueo antes de actuar.
- Verificar las cuotas vigentes de compute, almacenamiento y transferencia antes
  de provisionar; comprobar que la organización elegida realmente está en Free.
  La documentación oficial indica suspensión de compute o bloqueo de escrituras
  al alcanzar determinadas cuotas gratuitas: la app debe conservar el uso local
  y mostrar un fallo cloud controlado, sin pérdida de datos ni upgrade automático.
- No tratar la retención del proveedor como backup/restauración de la app
  implementados. Diseñar y probar la recuperación como una tarea posterior.

### TASK-008 — Fundación Neon y validación de acceso móvil

La issue #15 contiene la especificación actualizada para Neon Free y los criterios
de aceptación. La propuesta original para Supabase queda sustituida. No instalar
SDKs ni crear migraciones según su texto anterior.

La tarea tiene dos puertas: primero validar arquitectura móvil con evidencia
reproducible (Puerta A); solo tras su aprobación, implementar configuración,
servicios, migraciones y permisos (Puerta B). Provisionar recursos concretos
requiere autorización; actualizar la issue no inicia la implementación.

1. Validar autenticación para una única cuenta en Expo SDK 54/React Native:
   login, persistencia segura de sesión, recuperación tras reinicio, logout y
   expiración/renovación. Neon Managed Better Auth y Data API son candidatos, no
   una elección cerrada: el roadmap consultado no enumera Expo/React Native como
   framework soportado. Una guía React/Vite no demuestra compatibilidad móvil.
   Documentar el resultado; si requiere otra arquitectura o servicios adicionales,
   aprobarlos antes de avanzar y mantener el coste cero.
2. Elegir acceso seguro mediante API autenticada, nunca una conexión PostgreSQL
   con credenciales dentro del APK. Si se elige Neon Data API, validar JWT,
   GRANT de privilegios mínimos y RLS por `auth.user_id()`; no copiar `auth.uid()`
   ni FK a `auth.users` de Supabase. No exponer tablas antes de probar las policies.
3. Crear configuración opcional y servicios aislados de UI, sin login obligatorio.
   Sin configuración o sin red, Entrenar, Historial, Ejercicios y exportación
   deben seguir funcionando. No iniciar sincronización automática al arrancar.
4. Definir migraciones PostgreSQL reproducibles para catálogo CUSTOM e historial
   `completed`, con IDs locales intactos, snapshots, semántica de series,
   constraints, ownership coherente de padres/hijos y permisos mínimos. Catálogo
   SYSTEM permanece local; permitir configuraciones CUSTOM sobre ejercicios SYSTEM.
5. Cubrir ausencia de configuración, sesión Auth y seguridad; probar que un usuario
   no puede leer/escribir datos ajenos, que ownership hijo/padre no puede mezclarse
   y que anónimos no acceden a datos privados. Reportar pruebas SQL bloqueadas como
   bloqueadas, no como aprobadas. Mantener tests, lint, tipos y bundles locales.

Esta tarea no implementa subida de sesiones, cola, sincronización de catálogo,
resolución de conflictos ni restauración. Sus criterios detallados y SDKs se
cerrarán tras la validación de arquitectura móvil, no por suposición.

### Tareas posteriores

- Sincronización idempotente de sesiones completadas y catálogo CUSTOM.
- Cola de pendientes y reintentos controlados compatibles con las cuotas Free.
- Estrategia de borrados/tombstones que impida resucitar historial eliminado.
- Restauración comprobada en una instalación nueva.

### Referencias oficiales consultadas — 8 de octubre de 2026

- [Planes y cuotas](https://neon.com/pricing).
- [Managed Better Auth](https://neon.com/docs/auth/overview).
- [Roadmap de Auth y frameworks](https://neon.com/docs/auth/roadmap).
- [Neon Data API](https://neon.com/docs/data-api/overview).
- [Privilegios, identidad JWT y RLS](https://neon.com/docs/data-api/access-control).

Revisar estas fuentes antes de implementar: precios, cuotas, SDKs y soporte de
frameworks pueden cambiar. No se crea infraestructura cloud en esta tarea documental.

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

El objetivo es mantener la documentación pequeña, vigente y ejecutable por agentes
como Hermes o Codex. `AGENTS.md` contiene instrucciones de trabajo, no un segundo
plan de producto. El estado se mantiene en este documento, sin duplicarlo en
`docs/PROJECT_STATUS.md`. Actualizar la fecha, commit de referencia, verificaciones
y pendientes al realizar una nueva revisión de estado o integrar una tarea.
