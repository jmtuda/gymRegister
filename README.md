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

El MVP se desarrollará primero sobre SQLite para que la ejecución de una sesión no dependa de Internet.

Supabase se incorporará posteriormente como capa de autenticación, backup/sincronización y restauración. El modelo local se diseña desde el principio con IDs globales y timestamps para evitar rehacer el dominio cuando se añada la nube.

Esta fase posterior no se ha iniciado; no existe autenticación, sincronización ni
backup cloud en la versión actual.

## Documentación

- [Producto y UX](docs/PRODUCT.md)
- [Catálogo](docs/CATALOG.md)
- [Modelo de datos](docs/DATA_MODEL.md)
- [Plan de implementación](docs/IMPLEMENTATION_PLAN.md)

## Relación con gymCoach

El repositorio `jmtuda/gymCoach` se utiliza únicamente como referencia para reutilizar conocimiento, catálogo y patrones de implementación útiles.

gymRegister es un proyecto independiente. No conserva el motor metodológico, la planificación automática ni la complejidad histórica de gymCoach.
