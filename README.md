# VolleyStats · MVP 0.1

Aplicación local orientada a tablet horizontal. Sin dependencias externas, con módulos ES preparados para ampliar el producto. La aplicación mantiene una plantilla general del equipo guardada localmente y un roster independiente para cada partido.

## Ejecutar

Con Node.js instalado, desde esta carpeta: `npm run dev`. Abrir http://127.0.0.1:5173. `npm test` comprueba las transiciones del partido; `npm run build` crea la aplicación distribuible en `dist/`.

## Incluido

- Cancha propia, red en el borde superior, zonas 4–3–2 / 5–6–1 y dorsales interactivos.
- Marcador, saque, R/K1-K2; puntos manuales, errores rivales y acciones básicas por jugador.
- Sustitución con confirmación, deshacer con confirmación, cierre explícito y siguiente set.
- Plantilla general persistente con alta de jugadores, dorsal y posición; historial de operaciones y estadísticas por jugador, fase y rotación con filtro por set.
- Persistencia local tras cada operación, recuperación al recargar y caché del interfaz mediante service worker tras la primera carga correcta.

## Arquitectura y siguiente fase

`src/domain.js` contiene estado versionado y transiciones puras, con eventos que conservan jugador, set, rotación, fase y marcador anterior/posterior. `src/storage.js` separa la persistencia del interfaz. `src/app.js` contiene navegación y vistas. `src/styles.css` contiene el diseño adaptable. `sw.js` conserva los recursos necesarios sin conexión.

El estado actual usa localStorage para guardar por separado la plantilla general del equipo y un único partido activo. No está diseñado aún para varios dispositivos ni pestañas simultáneas. La siguiente fase debe migrar el repositorio a IndexedDB, añadir archivo por partido, identificadores de operación idempotentes y cola de sincronización con resolución de conflictos antes de habilitar cuenta compartida. No se conecta a ningún servidor de datos. La caché offline requiere localhost o HTTPS y una primera carga con conexión; borrar datos del navegador elimina la copia local.

Pendiente: creación de partidos, edición y eliminación de jugadores de la plantilla, roles efectivos, preparación completa de seis zonas, líbero automático, PDF regenerable, cierre/reapertura del partido y sincronización.

Los sets de prueba permiten cierre a cualquier marcador para revisar el flujo. Los cinco sets son navegables; todavía no se aplica victoria del partido al mejor de cinco. No usar esta versión como único registro de un encuentro real.

## Requisito permanente de interfaz en tablet

La vista de partido debe caber entera en la altura visible del navegador, sin scroll de página ni controles recortados, tanto en horizontal como en vertical. Toda modificación debe conservar esta condición: usar la altura dinámica del viewport, reservar espacio para marcador y botones y dejar que la cancha absorba el espacio restante. No añadir alturas mínimas o márgenes que obliguen a desbordar la pantalla. Mantener los cuatro botones inferiores accesibles y grandes.

Validar al menos 1024×600, 1024×768, 1280×800, 768×1024 y 800×1280, también con cuatro sets terminados y después de cambiar de orientación. Comprobar los límites visibles de los controles y de sus contenedores; ocultar el overflow por sí solo no basta. El historial extenso y los diálogos pueden desplazarse internamente sin mover la página principal.

## Comprobaciones de regresión

- `npm test`: reglas del marcador, rotación, deshacer, sustitución, cambios de set, errores no forzados y validación del guardado local.
- `npm run test:browser`: pruebas en Chromium con un perfil aislado, sin tocar el partido del navegador habitual. Requiere Playwright y su Chromium de pruebas disponibles en el entorno. Si Playwright está instalado fuera del proyecto, usar `npm run test:browser -- /ruta/absoluta/a/playwright/index.mjs`.
- La comprobación de navegador cubre doble toque, todas las valoraciones de acciones, errores propios y rivales, sustitución, cancelación, historial, navegación, cierre de set, persistencia, recarga offline, fallos de guardado, datos corruptos y ocho tamaños de tablet. Arranca y cierra su propio servidor local.
- `npm run build`: genera la versión distribuible después de las comprobaciones.

Si falla una escritura, el marcador no cambia y el indicador muestra que el guardado no está disponible; una escritura posterior correcta lo restablece. Si el partido guardado está dañado, se muestra la interfaz de demostración con el guardado bloqueado para conservar los datos originales y evitar sobrescribirlos.

## Estadísticas y corrección del historial

Estadísticas abre en la pestaña General y muestra las pestañas General, K1/K2, Rotaciones y Errores, filtrables por set. La pestaña General muestra la tabla de jugadores y su fila Total del equipo. Organiza Puntos (Tot, BP y G-P), Saque, Recepción, Ataque y Bloqueo con cabeceras agrupadas y separadores visibles. La ventana se adapta a la tablet para mostrar toda la tabla sin scroll. Errores no muestra el recuento de sustituciones. Los puntos se calculan con las variaciones del marcador de acciones y puntos; los cierres y aperturas de set no cuentan como puntos. Porcentaje de ataque excelente: puntos directos de ataque / intentos de ataque. Recepción positiva: valoraciones # y + / recepciones. Los porcentajes sin intentos se muestran como —. El Total de Puntos y BP suma solo los puntos registrados a nombre de jugadores; excluye los puntos manuales y los errores rivales. G-P suma por jugador las acciones # y + y resta −, = y Blo. Los puntos manuales no se atribuyen a G-P de ningún jugador. General, Rotaciones y Errores muestran una fila Total. K1/K2 utiliza dos tarjetas de fase con porcentaje, barra y puntos a favor/en contra, además de un resumen Total de fases. En K1/K2 se muestran todos los puntos disputados registrados, incluidos los errores rivales; en General, el Total de Puntos suma solo los puntos atribuidos a jugadores. Las rotaciones mantienen el contador R1–R6 del MVP.

Desde Historial o Corrección / Historial se pueden editar puntos, acciones, sustituciones y el saque inicial de los sets, o eliminar puntos, acciones y sustituciones. Se revisa el resultado antes de guardar. La reproducción conserva identificadores y horas y recalcula marcador, saque, alineación, rotación, cierres y estadísticas. Las correcciones que invaliden una acción o sustitución posterior se rechazan sin modificar el partido. Los cierres de set se recalculan y no se eliminan desde este editor.

Deshacer restaura la última corrección, incluso tras recargar y aunque se haya eliminado el único registro. Esta copia de recuperación se sustituye con una nueva corrección y se descarta al registrar una nueva operación. La edición solo se aplica cuando el guardado local tiene éxito.
