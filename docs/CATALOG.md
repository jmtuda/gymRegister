# Catálogo

## Fuente

El catálogo inicial de gymRegister se deriva del catálogo v2.2 de `jmtuda/gymCoach`.

La versión aprobada para gymRegister contiene:

- **9 grupos de selección**
- **29 ejercicios base**
- **108 configuraciones/variantes como mínimo**

gymCoach es la fuente de conocimiento inicial, pero gymRegister mantiene su propio catálogo independiente.

## Principio de simplificación

Los patrones técnicos de gymCoach no forman parte del flujo principal de selección.

Se conservan únicamente como metadata interna opcional.

La navegación visible es:

```text
grupo → ejercicio → configuración
```

## Grupos

| ID | Nombre |
|---|---|
| LEGS_QUADS | Piernas — cuádriceps y rodilla |
| POSTERIOR_CHAIN | Glúteos, isquios y cadera |
| CHEST | Pecho |
| BACK | Espalda |
| SHOULDERS | Hombros |
| ARMS | Brazos |
| CORE | Core |
| CALF_FOOT | Pantorrilla y pie |
| GRIP_FOREARM | Agarre y antebrazo |

Los grupos sirven únicamente para localizar ejercicios rápidamente. No representan una prescripción.

## Ejercicio base

Campos mínimos:

- `id`
- `group_id`
- `name_es`
- `technical_pattern` opcional
- músculos principales opcionales
- `active`
- `origin = SYSTEM | CUSTOM`

Ejemplos:

- Sentadilla trasera
- Prensa de piernas
- Peso muerto rumano
- Hip thrust
- Remo horizontal
- Jalón al pecho
- Dominada
- Curl de bíceps

## Configuración

Una configuración describe una forma válida de realizar un ejercicio.

Campos mínimos:

- `id`
- `exercise_id`
- `name_es`
- opciones de equipamiento
- opciones de lateralidad
- opciones de agarre
- opciones de anchura de agarre
- accesorio/configuración
- tipo de banda
- necesidad y altura de anclaje
- `dose_unit`
- `load_mode`
- `active`
- `origin = SYSTEM | CUSTOM`

## Configuración frente a elección concreta

El catálogo no debe crear una fila diferente para cada combinación posible si varias opciones pertenecen a la misma configuración.

Ejemplo conceptual:

```text
Curl de bíceps con mancuernas
equipamiento: DUMBBELL
lateralidad: BILATERAL | UNILATERAL | ALTERNATING
agarre: SUPINATED | NEUTRAL
```

Al añadir el ejercicio a una sesión se guarda la elección concreta:

```text
configuration_id = BICEPS_CURL.DUMBBELL
selected_laterality = ALTERNATING
selected_grip = SUPINATED
```

Esto evita multiplicar variantes innecesariamente y mantiene el historial inequívoco.

## Equipamiento

Valores iniciales:

- `BARBELL`
- `DUMBBELL`
- `KETTLEBELL`
- `MACHINE`
- `CABLE`
- `BAND`
- `BODYWEIGHT`

El modelo debe permitir añadir nuevos tipos sin rehacer las sesiones históricas.

## Lateralidad

Valores iniciales:

- `BILATERAL`
- `UNILATERAL`
- `ALTERNATING`

Solo se pregunta al usuario cuando exista más de una opción válida o cuando sea relevante para el registro.

## Agarres

Valores iniciales:

- `PRONATED`
- `SUPINATED`
- `NEUTRAL`
- `MIXED`
- `BY_ATTACHMENT`

Anchura:

- `NARROW`
- `MEDIUM`
- `WIDE`

Solo aparecen cuando proceda.

## Bandas

No se intenta convertir bandas a kg.

Una serie puede registrar una etiqueta de resistencia:

- color;
- nombre;
- nivel;
- etiqueta personalizada.

Ejemplos:

- amarilla
- roja
- fuerte
- banda 25 kg

El valor es descriptivo y no se interpreta automáticamente como una resistencia universal.

## Máquinas

Una máquina nueva puede añadirse como nueva configuración de un ejercicio existente.

Ejemplo:

```text
Ejercicio: Press de pecho horizontal
Configuración custom: Press convergente Hammer Strength
Equipamiento: MACHINE
Load mode: DISPLAYED_KG
```

La app debe permitir hacerlo sin modificar código ni migrar el esquema.

## Dosis

`dose_unit` inicial:

- `reps`
- `seconds`
- `meters`

Cada serie almacena la cantidad realmente realizada.

## Carga

`load_mode` inicial:

- `TOTAL_KG`
- `IMPLEMENT_KG`
- `DISPLAYED_KG`
- `ASSISTANCE_KG`
- `BAND_LABEL`
- `BODYWEIGHT`
- `NONE`

La UI debe adaptar el campo de entrada al modo de carga.

## Extensibilidad

Debe ser sencillo:

1. crear un ejercicio personalizado dentro de un grupo;
2. crear una configuración personalizada para un ejercicio;
3. desactivar una configuración sin borrar el historial;
4. conservar IDs estables una vez usados.

Nunca se deben reescribir sesiones históricas porque cambie el catálogo actual.
