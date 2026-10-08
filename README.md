# gymRegister

Aplicación personal y local-first para registrar sesiones de entrenamiento de fuerza de forma manual.

## Objetivo

gymRegister no genera entrenamientos ni recomienda ejercicios. Su función es permitir:

1. crear una sesión manual;
2. añadir ejercicios sin límite;
3. seleccionar cada ejercicio mediante **grupo → ejercicio → configuración**;
4. registrar las series realizadas durante el entrenamiento;
5. consultar el historial;
6. exportar los datos.

La aplicación está pensada para un único usuario.

## Flujo principal

```text
Inicio
  ↓
Crear sesión
  ↓
Añadir ejercicio
  ↓
Grupo
  ↓
Ejercicio
  ↓
Equipamiento + lateralidad + agarre, cuando proceda
  ↓
Añadir a sesión
  ↓
Registrar series realizadas
  ↓
Finalizar sesión
  ↓
Historial
```

No se planifican series, pesos, repeticiones ni RIR. Estos datos se introducen al realizar cada serie.

## Alcance del MVP local

**Estado: completado.** El MVP local cubre catálogo, sesiones manuales, ejecución,
historial y exportación CSV/JSON. La aplicación funciona sobre SQLite sin depender
de servicios externos.

Incluye:

- catálogo inicial de 29 ejercicios base y 108 configuraciones derivado de gymCoach v2.2;
- 9 grupos simples de selección;
- creación manual de sesiones;
- número ilimitado de ejercicios por sesión;
- registro de series, carga, RIR y dosis realizada;
- ejercicios con repeticiones, segundos o metros según corresponda;
- descanso automático a pantalla completa con temporizador y pantalla activa;
- notas opcionales;
- historial de sesiones;
- alta manual y borrado explícito de sesiones históricas;
- exportación CSV y JSON;
- persistencia SQLite local;
- posibilidad de añadir ejercicios y configuraciones personalizadas.

No incluye:

- objetivos de entrenamiento;
- generación o recomendación de sesiones;
- progresión automática;
- recovery/autoregulación;
- ciclismo, MTB u otras actividades;
- IA ni explicaciones metodológicas;
- sincronización cloud en la primera fase.

## Persistencia

El MVP usa SQLite para que la ejecución de una sesión no dependa de Internet.

La fase cloud usará **Neon en el plan Free**, en lugar de Supabase, para almacenar
datos en PostgreSQL. SQLite seguirá siendo la base operativa. La autenticación y
el acceso seguro desde Expo deben validarse antes de implementar la integración;
no se incluirán credenciales PostgreSQL en la app. El modelo local conserva IDs
globales y timestamps para facilitar futura sincronización y restauración.

Esta fase posterior no se ha iniciado; no existe autenticación, sincronización ni
backup cloud en la versión actual.

No se autoriza pasar a un plan de pago ni contratar servicios auxiliares de pago.
Si los límites gratuitos impiden continuar, detenerse y avisar. El alcance y las
decisiones de arquitectura pendientes están en el plan de implementación.

## Documentación

- [Producto y UX](docs/PRODUCT.md)
- [Catálogo](docs/CATALOG.md)
- [Modelo de datos](docs/DATA_MODEL.md)
- [Plan de implementación](docs/IMPLEMENTATION_PLAN.md)

El estado operativo, las verificaciones y los pendientes se mantienen en el plan
de implementación. Las instrucciones para agentes están en [AGENTS.md](AGENTS.md).

## Desarrollo y verificaciones

El proyecto utiliza npm y `package-lock.json`. Para preparar un entorno de
desarrollo autorizado, instalar las dependencias bloqueadas con `npm ci`.
El runner de tests necesita Node con soporte de TypeScript y `node:sqlite`;
el repositorio todavía no fija una versión de Node.

Para la verificación de mantenimiento se utilizó una instalación con caché local:
`npm ci --cache ./node_modules/.cache/npm --ignore-scripts --no-audit --no-fund --update-notifier=false`.
Tests, lint, typecheck y bundles locales funcionaron con esa instalación. Al omitir
scripts, no se garantiza la preparación de cualquier dependencia nativa futura;
no se realizó una auditoría de vulnerabilidades ni una actualización de versiones.

Comandos existentes:

- `npm run start`: iniciar Expo;
- `npm run android` / `npm run ios`: iniciar Expo para la plataforma indicada;
- `npm run test`: pruebas de dominio, repositorios y lógica de features;
- `npm run lint`: ESLint, requiere dependencias instaladas;
- `npm run typecheck`: TypeScript sin emitir archivos, requiere dependencias instaladas;
- `git diff --check`: comprobar errores de whitespace en el diff.

Los tests usan SQLite en memoria y no sustituyen la validación de UI, persistencia
tras cerrar el proceso ni capacidades nativas en dispositivo. Exportar CSV/JSON
no implica que exista importación o restauración.

## Relación con gymCoach

El repositorio `jmtuda/gymCoach` se utiliza únicamente como referencia para reutilizar conocimiento, catálogo y patrones de implementación útiles.

gymRegister es un proyecto independiente. No conserva el motor metodológico, la planificación automática ni la complejidad histórica de gymCoach.
