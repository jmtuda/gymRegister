# Plan de implementación

## Base consolidada vigente — 13 de octubre de 2026

**Producto entregado: MVP local con SQLite, probado satisfactoriamente en un
Android físico por el propietario.** El propietario confirma expresamente que el
APK probado no incluía integración Neon. TASK-001–TASK-007 y los ajustes móviles
de la PR #18 forman la base local; no hay un cambio funcional nuevo en este hito.

Referencia de código: `65aea9e768a1ef48468e0eae93fb6df0d938064b` (PR #18).
La `main` verificada antes de consolidar estaba en
`9ef64e1c6ac029a6e4b4ee230b6c5f558b7663fc`; Git confirmó que todos los archivos
no Markdown eran idénticos, incluidos fuentes, datos, assets, manifiestos y
lockfile. El hito `mvp-local-android-20261013` conserva ese código y unifica la
documentación; no reinterpreta el catálogo ni cambia el esquema SQLite.

La aceptación Android es confirmación del propietario, no una prueba ejecutada
por esta sesión. No se ha aportado el APK, ID de build ni checksum: la igualdad
de fuentes no acredita identidad binaria ni una build reproducible. No se
repite la prueba física ni se genera un APK para sustituir el que ya funciona.

Las 78 pruebas, lint, tipos y bundles que aparecen abajo son resultados históricos
fechados. En esta consolidación sólo se verifican diff, preservación de código,
coherencia documental y referencias Git/GitHub; no se ejecutan suites ni builds
ni se declara CI verde: no hay workflow versionado en este proyecto.

### Qué queda y qué no bloquea esta base

- El MVP local está terminado y aceptado por el propietario. Las issues #9 y #11
  describen historial/exportación ya implementados; su estado abierto es
  seguimiento pendiente de reconciliar, no funcionalidad ausente. No se cierran
  como efecto incidental de esta consolidación.
- La investigación TASK-008 / #15 queda fuera del APK validado y sigue parcial.
  Primero decidir el cierre de la rama de pruebas que todavía existe y validar
  acceso, sesión durable, renovación/logout y foreground/background en Android;
  aprobar la arquitectura antes de implementar integración o sincronización.
- No hay importación/restauración ni backup cloud del inventario de entrenamientos.
  Exportar CSV/JSON no acredita recuperar una instalación perdida.
- Mantener las limitaciones de presentación, migraciones incrementales, iOS y
  entorno reproducible como mantenimiento futuro, sin modificar esta versión.
- No borrar recursos, subir entrenamientos, provisionar, instalar SDKs o activar
  servicios sólo porque estén descritos en este plan.

Los apartados siguientes conservan el historial y requisitos del proyecto.
Las conclusiones de los ensayos del 8 de octubre deben leerse junto con la
actualización del 13 de octubre; no son una instantánea actual del servicio.

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

## Fase posterior — Neon Free (investigación parcial; app no integrada)

Decisión del propietario, 8 de octubre de 2026: usar Neon en el plan Free en lugar
de Supabase. El proyecto Neon se creó posteriormente con autorización expresa
(ver registro de provisión abajo); aún no hay integración implementada en la app.
SQLite seguirá siendo la base operativa durante el entrenamiento.

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

### Puerta A — investigación del 8 de octubre de 2026 (parcial)

Base verificada: `main` / `origin/main` / GitHub en `9ef64e1`; árbol limpio antes
de abrir `task/008-neon-foundation`. Leídos README, los cuatro documentos, la
issue #15 y sus comentarios, manifiesto, layout SQLite y prueba de flujo local.
No se instalaron SDKs, no se modificó la app ni se provisionaron recursos.

Resultado documental, no prueba móvil end-to-end:

- Neon Managed Better Auth enumera Next.js y frameworks React web; no enumera
  Expo/React Native. Su roadmap describe sesiones con cookies HTTP-only y limita
  arquitecturas frontend/backend separadas. No demuestra imposibilidad móvil,
  pero tampoco justifica integrar el SDK web como si el soporte estuviera probado.
- Neon gestiona un subconjunto de plugins Better Auth. No basta con que Better
  Auth tenga una integración Expo para asumir que el servicio gestionado admite
  sus requisitos de servidor.
- Data API documenta proveedores JWT externos, incluido Clerk, validación por
  JWKS y audiencia configurable. El control real es GRANT + RLS: al habilitar
  la API desde Console puede aplicar privilegios amplios por defecto en `public`.
  Revisarlos y restringirlos antes de exponer tablas; no copiar los GRANT de
  ejemplo que permiten UPDATE/DELETE indiscriminadamente.
- Clerk documenta SDK Expo y caché de tokens con `expo-secure-store`; su plan
  Hobby es gratuito sin tarjeta. Esto hace que Clerk + Data API sea un candidato
  para una prueba aislada, no una arquitectura aprobada ni una integración probada.
  La allowlist de Clerk requiere pago en producción: no basar la cuenta única
  en esa función. Verificar acceso por invitación sin signup público y coste cero,
  requisitos de producción/dominio y versiones antes de instalar. Clerk publica
  una guía de compatibilidad Expo 54/55, pero falta probar las versiones exactas
  contra este proyecto. Si cualquiera exige pago, detenerse.

La propuesta inicial de evaluar Clerk queda retirada como siguiente paso por
aclaración del propietario: aplicación personal, sin flujo de cuentas ni login
para entrenar; objetivo de almacenamiento cloud privado con configuración mínima.
Priorizar prueba de Neon Auth + Data API, conservando SQLite. Clerk no está
aprobado ni instalado. Configurar acceso cloud una vez es un objetivo, no una
garantía de sesión permanente: hay que probar renovación y reautorización.
Nunca resolverlo con tablas públicas o credenciales PostgreSQL dentro del APK.
La issue #15 conserva sus criterios originales hasta reconciliarlos con este
alcance y con la arquitectura validada; no se ha modificado en GitHub.

Para superar Puerta A faltan recursos de prueba autorizados y ejecución real:
login de la cuenta personal, persistencia tras reinicio, logout, expiración,
foreground/background, consulta de tabla desechable, rechazo de anónimo/token
inválido y aislamiento de una segunda identidad de prueba. No usar entrenamientos
reales ni subir SQLite. La prueba debe ejecutarse en Android; los tests locales
no acreditan Auth/JWT/RLS. Puerta B y cierre de #15 permanecen bloqueados.

Fuentes oficiales consultadas:

- Roadmap, overview y plugins de Neon Auth, Data API overview/access-control y
  [proveedores JWT externos](https://neon.com/docs/data-api/custom-authentication-providers).
- [Clerk Expo quickstart](https://clerk.com/docs/expo/getting-started/quickstart),
  [guía Expo](https://docs.expo.dev/guides/using-clerk/),
  [Clerk Hobby](https://clerk.com/pricing) y
  [restricciones de acceso](https://clerk.com/docs/guides/secure/restricting-access) y
  [compatibilidad Expo 54/55](https://clerk.com/articles/clerk-compatibility-in-expo-54-and-55).

Verificación local de esta revisión: Node `v26.7.0`, npm `11.19.0`; 78 tests
aprobados, lint, typecheck y `git diff --check` correctos. Solo se modifica este
documento; no se regeneran bundles porque no cambia código ni integración nativa.
No se ha realizado commit, push ni cambio de estado de la issue.

### Puerta A — pruebas aisladas de Neon, 8 de octubre de 2026

El propietario autoriza realizar las pruebas necesarias. Sin recursos cloud
accesibles aún, se ejecutó una comprobación de helpers oficiales de Neon, no
una integración simulada. Fuente fijada al commit
`029a3367ee140d2c8987601b0e338000fe6db1e6` de `neondatabase/neon-js`.
Se descargan cinco archivos públicos, se calculan sus hashes y se transpilan
en memoria con TypeScript ya instalado; no se instalan dependencias.

Comando reproducible del experimento local:
`node node_modules/.cache/neon-probe/check.cjs`.
El script queda en caché ignorada, no es código productivo ni artefacto versionado.
Antes de reutilizarlo tras borrar la caché, recuperar o reconstruir el experimento;
este comando no es una nueva verificación permanente del repositorio.

Siete comprobaciones aprobadas: detección de navegador sin DOM en Node y con
`window` vacío, caché de sesión en memoria, ausencia de recuperación en una nueva
instancia, expiración, invalidación ante respuesta tardía y vaciado explícito.
La expiración usa reloj controlado y un payload JWT sintético local; no se firma,
valida ni envía a ningún servicio. No acredita seguridad JWT, login, renovación,
persistencia móvil ni compatibilidad del SDK completo. La caché probada no es
almacenamiento durable; hace falta verificar el mecanismo de sesión real tras
cierre/reinicio de Android, no concluir que todo el SDK carezca de persistencia.

También se inspeccionaron los adaptadores: el SDK gestiona plugins predeterminados
y obtiene JWT de la sesión; no hay una integración Expo demostrada por este
experimento. Mantener la ruta Neon como candidata, sin declarar compatibilidad
ni incompatibilidad definitivas.

Prueba de acceso real: la consola redirige al login Google y no hay sesión
autenticada en el navegador del agente. No se introdujeron credenciales ni se
creó un proyecto. Hace falta que el propietario complete Google SSO en ese
navegador. Después comprobar organización Free y acordar el recurso desechable
antes de habilitar Auth/Data API o escribir una tabla de prueba sin datos reales.
Login móvil, persistencia tras reinicio, renovación, revocación y controles
Data API/RLS están bloqueados por este acceso y por la prueba Android pendiente.

Regresión local ejecutada nuevamente: 78 tests aprobados, lint y typecheck
correctos. No cambios funcionales, lockfile intacto ni recursos externos creados.
Puerta A sigue parcial; Puerta B, sincronización y restauración no se implementan.

Fuentes de código:
[SDK Neon](https://github.com/neondatabase/neon-js/tree/029a3367ee140d2c8987601b0e338000fe6db1e6/packages/auth/src)
y [contrato de adaptadores](https://github.com/neondatabase/neon-js/blob/029a3367ee140d2c8987601b0e338000fe6db1e6/packages/auth/neon-auth_vs_better-auth.md).

### Provisión autorizada — 8 de octubre de 2026

Tras completar Google SSO, el propietario confirma que no existe un proyecto
gymRegister y autoriza crearlo en su cuenta. Se verifica en Billing que la
organización `org-nameless-cherry-58140449` está en Free, 0 USD/mes.

Proyecto creado y comprobado leyendo su overview después de la creación:

- Cuenta: JMTuda.
- Nombre: `gymregister`.
- ID: `frosty-cloud-12696824`.
- Región: AWS Europe Central 1 (Frankfurt), seleccionada explícitamente.
- Base solicitada: `gymregister`, PostgreSQL 18, según formulario de creación.
- Rama inicial verificada: `production`, ID `br-spring-snow-b2fte0gh`.
- Overview: Free plan; 1 base y 1 compute. Better Auth aún muestra Get started.

Se crea únicamente PostgreSQL, sin activar Object Storage, Functions, AI Gateway
ni Auth. No se cambia plan/facturación, no se muestran/copían credenciales ni se
tocan los proyectos de otras aplicaciones. No hay tablas de entrenamiento,
subida de datos, integración móvil ni sincronización implementadas por esta acción.
La creación no supera Puerta A: quedan las pruebas de acceso seguro y Android.

Este registro sustituye el bloqueo anterior de acceso a consola: la sesión de
administración está disponible en Google Chrome del propietario, no en el
navegador aislado del agente. La documentación queda local, sin commit/push.

### Puerta A — pruebas reales de almacenamiento y Data API, 8 de octubre de 2026

Base de código y remoto comprobada: `9ef64e1`. Ejecución propia en Neon Free,
solo con datos sintéticos y ramas desechables del proyecto anterior; sin cambiar
la app, SQLite, dependencias o lockfile.

- Rama `auth-probe-20261008` (`br-long-cloud-b2m95brv`), creada con
  `schema-only`: escritura y lectura reales en
  `gymregister_probe.storage_check`; RLS habilitada y verificada en PostgreSQL.
- Ocho comprobaciones reales de permisos/RLS aprobadas con un rol `NOLOGIN`,
  `NOBYPASSRLS`, no propietario: lectura propia, ocultación de fila ajena,
  inserción propia, rechazo de inserción ajena, rechazo de UPDATE y DELETE, y
  rechazo de lectura e inserción sin identidad. La identidad se simuló mediante
  una variable de sesión SQL; esto no valida JWT ni Neon Auth.
- El test transaccional hizo rollback de rol, política y filas temporales. Una
  lectura independiente confirmó una fila original, ningún rol de prueba ni
  política temporal restante. Se conserva RLS habilitada sin políticas de
  acceso cliente en esta tabla de prueba.
- El primer POST de Data API devolvió HTTP 400 porque no permite ramas con
  borrado automático. Se quitó temporalmente la caducidad; después devolvió
  HTTP 412, `database CREATE permission is required for neon_superuser`.
  Omitir la inicialización del esquema Auth produjo el mismo error. La
  comprobación SQL de privilegio efectivo CREATE devolvió verdadero y la ACL
  incluía CREATE para ese rol: la causa exacta de esta discrepancia no está
  confirmada. No se alteraron privilegios para intentar eludirla.
- Comparación controlada: rama `api-probe-data-20261008`
  (`br-small-haze-b2q0c3ss`), creada desde `production` con `parent-data`,
  sin caducidad automática y compute de 0,25 CU. Data API se creó con HTTP 201;
  GET independiente confirmó HTTP 200 y estado `active`. Se deshabilitaron
  grants automáticos y OpenAPI, se limitó a diez filas y al esquema `public`;
  no se habilitó Neon Auth ni se emitieron tokens válidos.
- En esa segunda rama se creó una tabla sintética con RLS basada en
  `auth.user_id()`, restringida a una identidad ficticia concreta, sin acceso
  PUBLIC y con SELECT/INSERT para `authenticated`. Ocho peticiones HTTP reales
  (GET y POST sin token, con token malformado, JWT sin firma y JWT con clave
  ficticia) fueron rechazadas con HTTP 400. Los errores fueron respectivamente
  credenciales ausentes, codificación inválida, `missing key id` y
  `jwk not found`. No demuestran validación de una firma frente a una clave
  registrada ni acceso de un usuario legítimo: no había un emisor configurado.
  Una lectura posterior por propietario confirmó solo la fila original,
  sin inserciones de las peticiones rechazadas.
- Limpieza verificada: se eliminó únicamente la rama comparativa, incluyendo
  su API y tabla; GET posterior devolvió 404. Se restauró y leyó de nuevo la
  caducidad original de la rama `auth-probe-20261008`:
  `2026-10-09T08:35:52Z` (9 de octubre, 10:35:52 CEST).
  La consulta de Data API de `production` siguió devolviendo 404. No se
  conectaron entrenamientos reales ni se modificó `production`.

Artefactos locales ignorados, sin credenciales, en
`node_modules/.cache/neon-probe/`: `storage.sql`, `rls.sql`, `api-storage.sql`,
`api-denial.cjs` y `api-denial-results.json`. El script HTTP usa un endpoint
limitado explícitamente a la rama comparativa ya eliminada; no debe ejecutarse
contra `production` ni reinterpretarse como una suite de Auth completa.

**Conclusión parcial:** almacenamiento SQL, aislamiento transaccional y rechazo
de acceso HTTP no autorizado probados. Data API funcionó en la rama comparativa
normal; no se ha confirmado que el modo `schema-only` sea la única causa del
error anterior. Falta probar emisión de identidad válida, autorización exclusiva
del propietario, acceso positivo por Data API y persistencia/renovación desde
Expo/Android. Puerta A permanece abierta; no se aprueba la arquitectura ni se
implementa fundación, sincronización o restauración con estas pruebas.

### Actualización Auth y cierre remoto — 13 de octubre de 2026

La sesión de investigación `20261007_170753_bb72ae` continuó después del último
ensayo documentado arriba. Se recuperaron sus resultados históricos de Auth y
Data API: trece comprobaciones aprobadas con dos identidades sintéticas,
lectura/escritura legítima del propietario, aislamiento y rechazo de escrituras
de otra identidad, altas públicas cerradas y revocación de la sesión Auth al
salir. Recuperar una cookie en otro cliente HTTP sólo se probó en memoria; no es
persistencia móvil. Un JWT emitido antes del logout todavía permitía leer: no se
midió su duración ni la revocación efectiva del acceso por ese JWT.

El ensayo terminó interrumpido y no quedó documentada una limpieza final.
La consulta propia del 13 de octubre, por MCP OAuth limitado a lectura y al
proyecto `gymregister` (`frosty-cloud-12696824`), confirmó:

- Plan observado: `free_v3`. Dos ramas presentes, ambas `ready` y con compute
  `idle`; no se ejecutó SQL ni se leyeron entrenamientos.
- `production` (`br-spring-snow-b2fte0gh`): Neon Auth no habilitado y Data API
  inexistente, con respuestas 404 explícitas en sus consultas de configuración.
- `auth-data-probe-20261008` (`br-raspy-frog-b2vn0hh7`): rama de prueba todavía
  presente; Better Auth configurado, email/password habilitado y registro público
  cerrado; Data API `active`, esquema `public`, máximo diez filas y OpenAPI
  deshabilitado. `idle` no significa rama ni servicios eliminados.
- Las ramas `auth-probe-20261008` y `api-probe-data-20261008` ya no aparecen en
  el listado; las consultas por sus IDs originales confirmaron 404 / branch not
  found. No se atribuye una fecha ni causa de eliminación no comprobada.

**Conclusión vigente:** el acceso real de identidades se probó históricamente en
la rama aislada, pero la limpieza está pendiente y la app sigue sin integrar
cloud. No se han validado Neon Auth, persistencia/renovación o revocación desde
Android; la aceptación del APK local no sustituye esa puerta. Conservar estos
resultados y decidir por separado si eliminar sólo la rama de prueba restante;
no se ha autorizado ni ejecutado su eliminación en esta consolidación.

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
frameworks pueden cambiar. La preparación documental inicial no creó infraestructura;
la provisión autorizada posterior se registra explícitamente arriba.

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
