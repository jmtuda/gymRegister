# Instrucciones de mantenimiento de gymRegister

## Fuentes de verdad y lectura previa

- GitHub (`jmtuda/gymRegister`) y la rama `main` son la fuente de verdad del proyecto. No asumir que las referencias locales están actualizadas.
- Antes de modificar, leer `README.md` y los cuatro documentos de `docs/`: `PRODUCT.md`, `CATALOG.md`, `DATA_MODEL.md` e `IMPLEMENTATION_PLAN.md`.
- Revisar `git status`, rama, historial reciente y diferencias respecto a `origin/main`. Consultar `git ls-remote origin refs/heads/main` para verificar el remoto sin alterar el checkout. Si hay divergencia o cambios ajenos, informar y no sobrescribirlos.
- Leer la issue y sus comentarios cuando la tarea esté asociada a GitHub. Contrastar documentación con código y tests; una issue abierta no prueba que su funcionalidad siga pendiente.
- El estado operativo y los pendientes se mantienen en `docs/IMPLEMENTATION_PLAN.md`. No duplicarlos en otro documento de estado.

## Alcance y seguridad

- gymRegister registra entrenamiento de fuerza manual para un único usuario. No añadir prescripciones, recomendaciones, progresión automática, IA ni funcionalidades de gymCoach fuera del alcance aprobado.
- Operar únicamente dentro del directorio autorizado del proyecto. Pedir aprobación antes de operaciones en el Mac fuera de ese directorio, incluidas instalaciones globales y cambios de configuración del usuario.
- No contratar servicios ni iniciar operaciones que impliquen un coste adicional sin aprobación expresa. Detenerse y avisar si la continuación lo requiere.
- No leer ni imprimir secretos. No versionar credenciales; nunca incluir claves de servidor/service-role en una aplicación cliente.
- No instalar dependencias ni generar builds remotas durante una inspección de solo lectura. Para preparar el entorno, acordar la instalación y sus rutas de caché; usar el lockfile existente y no actualizar versiones incidentalmente.
- Trabajar en una rama de tarea basada en `main` verificada, no implementar directamente sobre `main`. No hacer commit, push, abrir/cerrar issues o PR, ni fusionar cambios sin autorización.

## Mapa del repositorio

- `app/`: rutas y layouts de Expo Router; el layout raíz inicializa SQLite.
- `src/domain/`: tipos y contratos de dominio.
- `src/data/`: esquema SQLite, seed y repositorios. SQL solo en esta capa.
- `src/features/`: pantallas, presentación y servicios por funcionalidad.
- `data/catalog.v0.2.json`: catálogo SYSTEM aprobado; conservar sus IDs.
- `tests/`: pruebas con `node:test` y SQLite en memoria mediante `node:sqlite`.
- `app.json` y `eas.json`: configuración de app y builds. La configuración de un perfil no demuestra que una build haya sido ejecutada.

## Contratos que no deben romperse

- SQLite sigue siendo la fuente operativa del entrenamiento; el flujo local no debe depender de red, Auth ni cloud.
- Navegación del catálogo: grupo → ejercicio → configuración. Mantener separados configuración y selecciones concretas.
- Solo los datos confirmados son hechos. Los defaults y formularios sin guardar no crean series ni cuentan en el historial.
- Mantener IDs globales para datos del usuario, timestamps e idempotencia de confirmación. Una doble acción no debe duplicar hechos.
- Respetar los estados y capacidades documentados: `draft` → `in_progress` → `completed`; una única sesión `in_progress`.
- El historial completado no se edita ni reabre. El borrado explícito de una sesión completada es una excepción destructiva, con confirmación y transacción.
- Nombres históricos proceden de snapshots; dosis, carga y RIR de cada serie proceden de sus valores persistidos. Renombrar o desactivar catálogo no reinterpreta hechos anteriores.
- Los elementos SYSTEM no se modifican desde operaciones CUSTOM; desactivar catálogo no borra historial.
- Usar `withExclusiveTransactionAsync` y su handle transaccional para operaciones atómicas. Cubrir rollback e integridad con tests.
- CSV: una fila por serie confirmada. JSON: estructura de sesiones completadas, incluso sin series. Exportar no modifica SQLite; no confundir exportación con restauración implementada.
- Descanso efímero con deadline; solo una serie nueva inicia descanso. Editar o repetir una confirmación no lo inicia de nuevo.
- Todo cambio futuro de esquema debe definir migración y preservación de datos existentes; la inicialización v1 no reemplaza una estrategia de migraciones.

## Procedimiento de cambio y verificación

1. Acordar alcance y localizar definiciones, usos y tests antes de editar. Mantener cambios pequeños, sin refactors incidentales.
2. Para cambios de comportamiento, añadir una prueba de regresión que falle antes de la corrección y verificarla después.
3. Ejecutar las verificaciones existentes:
   - `npm run test`
   - `npm run lint`
   - `npm run typecheck`
   - `git diff --check`
4. Si cambia UI o integración nativa, verificar además el flujo afectado en dispositivo/emulador y los bundles pertinentes cuando el entorno y la autorización lo permitan. No usar tests de texto fuente como sustituto de interacción real.
5. Si falta una herramienta o dependencia, reportar el bloqueo. No afirmar que una verificación pasó basándose solo en una PR previa ni instalar automáticamente para ocultar el bloqueo.
6. Actualizar la documentación existente cuando cambien contratos o alcance. Registrar fecha y commit de referencia para un diagnóstico de estado, diferenciando ejecución propia, evidencia histórica y pendientes.
7. Revisar diff y estado final. Informar qué cambió, resultados reales y límites de validación; no marcar terminadas funcionalidades solo especificadas en una issue.

## Entorno de desarrollo

- El proyecto usa npm y `package-lock.json`. Tras autorizar la preparación, `npm ci` instala las dependencias bloqueadas.
- Para mantener la caché dentro del proyecto, la instalación verificada es `npm ci --cache ./node_modules/.cache/npm --ignore-scripts --no-audit --no-fund --update-notifier=false`. Omitir scripts reduce efectos secundarios, pero no garantiza la preparación de dependencias nativas futuras; validar el comando que se vaya a utilizar y no habilitar scripts automáticamente ante un fallo.
- Para bundles locales sin servicios cloud, usar el CLI ya instalado: `node ./node_modules/expo/bin/cli export --platform android --platform ios --max-workers 2 --output-dir dist/verification`. Antes de ejecutarlo, crear directorios dentro de `node_modules/.cache/` y redirigir HOME, TMPDIR y XDG_CACHE_HOME a ellos, con `EXPO_NO_TELEMETRY=1`, `EXPO_OFFLINE=1`, `EXPO_NO_DOTENV=1` y `CI=1`. El resultado no acredita una build nativa ni pruebas en dispositivo.
- El runner actual necesita un Node con soporte de ejecución de TypeScript y `node:sqlite`. No hay versión de Node fijada en el repositorio; documentar la usada en cada verificación sin inventar una compatibilidad mínima.
- `npm run start`, `npm run android` y `npm run ios` arrancan Expo según los scripts actuales; no confundirlos con validaciones de build.
- La fase cloud usará Neon exclusivamente en el plan Free. No activar planes de pago ni servicios auxiliares de pago; si el presupuesto gratuito impide continuar, detenerse y avisar. No provisionar recursos ni modificar facturación solo porque exista un plan documental.
- La incorporación de Neon requiere una tarea aprobada y aislada. La issue #15 nació para Supabase y debe reformularse antes de implementarla; no trasladar sus SDK, `auth.users.id` o `auth.uid()` por sustitución textual. Validar Auth y acceso seguro en Expo/React Native, sin credenciales PostgreSQL ni `DATABASE_URL` en el cliente, sin adelantar sincronización/restauración ni suponer políticas de borrado cloud.
