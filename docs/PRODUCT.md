# Producto y UX

## Propósito

gymRegister es un registro personal de entrenamiento de fuerza. El usuario construye cada sesión manualmente y registra lo que realmente realiza.

La aplicación no prescribe, no recomienda y no adapta el entrenamiento.

## Navegación principal

El MVP tendrá tres áreas principales:

1. **Entrenar**
2. **Historial**
3. **Ejercicios**

## 1. Entrenar

### Estado sin sesión activa

La pantalla muestra un botón principal:

**Crear sesión**

Al pulsarlo se crea una sesión en estado `draft`.

### Sesión en borrador

La sesión empieza vacía.

Acciones:

- añadir ejercicio;
- eliminar ejercicio;
- reordenar ejercicios;
- añadir nota de sesión;
- iniciar sesión.

No existe límite de ejercicios.

No se planifican series, repeticiones, carga ni RIR.

### Añadir ejercicio

Flujo:

```text
Grupo
→ Ejercicio
→ Configuración
→ Añadir a sesión
```

#### Paso 1 — Grupo

Se muestran 9 grupos:

- Piernas — cuádriceps y rodilla
- Glúteos, isquios y cadera
- Pecho
- Espalda
- Hombros
- Brazos
- Core
- Pantorrilla y pie
- Agarre y antebrazo

#### Paso 2 — Ejercicio

Se muestran los ejercicios base pertenecientes al grupo elegido.

#### Paso 3 — Configuración

En una única pantalla se seleccionan únicamente los campos aplicables:

- equipamiento;
- lateralidad;
- agarre;
- anchura de agarre, cuando sea relevante;
- accesorio/configuración, cuando sea relevante.

La configuración se construye a partir de las opciones válidas declaradas en el catálogo.

La app no recomienda ninguna opción.

### Inicio de sesión

Al pulsar **Iniciar**, el estado pasa a `in_progress`.

## Registro durante el entrenamiento

Cada ejercicio muestra sus series realizadas.

El usuario puede:

- añadir una serie;
- introducir repeticiones, segundos o metros según el ejercicio;
- introducir carga cuando proceda;
- introducir RIR opcional;
- confirmar la serie;
- editar una serie confirmada;
- eliminar una serie;
- añadir tantas series como necesite;
- añadir una nota del ejercicio;
- saltar a otro ejercicio;
- añadir nuevos ejercicios a la sesión;
- reordenar ejercicios si fuera necesario;
- iniciar automáticamente un descanso de 60 segundos después de confirmar una serie nueva.

El descanso se muestra a pantalla completa, permite sumar o restar 15 segundos y
puede omitirse. La cuenta usa una hora de finalización, mantiene la pantalla
despierta solo mientras está activa y nunca se muestra fuera de gymRegister.

Al preparar la siguiente serie se precargan, como ayuda editable, los últimos
valores compatibles del mismo ejercicio en la sesión actual o, si aún no existe
ninguno, de la última sesión completada con la misma configuración concreta.
Estos valores no cuentan como realizados hasta confirmar la nueva serie.

No existe un número de series previsto.

### Carga

La interfaz depende del `load_mode` de la configuración:

- `TOTAL_KG`: kg totales;
- `IMPLEMENT_KG`: kg del implemento;
- `DISPLAYED_KG`: valor mostrado por máquina/polea;
- `ASSISTANCE_KG`: kg de asistencia;
- `BAND_LABEL`: etiqueta de banda;
- `BODYWEIGHT`: peso corporal;
- `NONE`: sin carga.

La aplicación debe mostrar una etiqueta clara para evitar ambigüedades.

### RIR

El RIR es opcional y se registra por serie.

No produce recomendaciones ni progresión automática.

## Finalizar sesión

Al pulsar **Finalizar sesión**:

- se confirma la intención del usuario;
- el estado pasa a `completed`;
- se registra `completed_at`;
- la sesión aparece en Historial.

Puede existir una nota final opcional.

No existe feedback obligatorio.

## 2. Historial

Lista cronológica de sesiones completadas.

Cada elemento muestra como mínimo:

- fecha;
- duración si está disponible;
- número de ejercicios;
- número de series realizadas.

El detalle de sesión muestra:

- ejercicios en orden;
- configuración utilizada;
- nota del ejercicio;
- series realizadas;
- dosis;
- carga;
- RIR;
- nota de sesión.

Solo los datos realmente confirmados cuentan como realizados.

Desde esta pestaña se puede exportar todo el historial completado en CSV o JSON y
abrir la hoja nativa para compartir o guardar el archivo. La exportación funciona
offline. Si todavía no existen sesiones completadas, se informa al usuario y no se
genera ningún archivo.

Desde Historial también se puede añadir a posteriori una sesión ya realizada sin
interferir con una sesión en curso. El borrador se mantiene exclusivamente en la
interfaz y se guarda de forma atómica como `completed`. El detalle permite borrar
explícitamente una sesión completada, con confirmación destructiva.

## 3. Ejercicios

Permite explorar el catálogo con el mismo flujo:

**grupo → ejercicio → configuraciones**.

Además permitirá:

- crear un nuevo ejercicio personalizado;
- añadir una nueva configuración a un ejercicio existente;
- editar elementos personalizados;
- desactivar elementos personalizados.

Los elementos del catálogo del sistema no se eliminan físicamente porque pueden existir en el historial.

## Estados de sesión

```text
draft → in_progress → completed
```

Reglas:

- solo puede existir una sesión activa `in_progress`;
- una sesión `completed` no se edita ni reabre; solo puede eliminarse mediante la acción destructiva explícita;
- las series confirmadas son hechos realizados;
- no se crean series automáticamente;
- no se rellenan valores no introducidos por el usuario.

## Fuera del MVP

- plantillas o rutinas;
- sesiones automáticas;
- objetivos;
- recuperación;
- ciclismo/MTB;
- recomendaciones;
- progresión automática;
- gráficas avanzadas;
- IA;
- Supabase.
