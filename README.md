# Tareas — aplicación de escritorio

Aplicación de escritorio local basada en Electron. Lee y actualiza los Markdown existentes del repositorio Tareas; no necesita Obsidian ni Codex para funcionar. Obsidian se usó como referencia de interfaz y organización después del análisis estático ya realizado. REA no forma parte del flujo de desarrollo de esta app.

## Ejecutarla

Requiere Node.js 24.22.2 o posterior de la rama 24, npm y Git instalado en el ordenador. La app localiza Git mediante `PATH` y rutas habituales de Git for Windows. Si usas una instalación personalizada, define `TAREAS_GIT_PATH` con la ruta completa a `git.exe` antes de abrir la app.

1. Ejecuta npm install una sola vez.
2. Abre abrir-tareas.bat, o ejecuta npm start desde una terminal.
3. La primera vez intenta localizar Tareas como carpeta hermana de este proyecto. Si no la encuentra, pulsa Elegir carpeta Markdown y selecciona la raíz del repositorio, la que contiene areas/.

La ruta elegida se guarda en la configuración local de Electron, fuera del repositorio Markdown. En el segundo ordenador, clona ambos repositorios en ubicaciones paralelas o elige la carpeta Tareas allí también.

## Prototipo actual

- Lee las tareas de areas/finanzas, areas/titan13, areas/negocios y areas/personal.
- Incluye tablero por estado y calendario mensual con pequeñas etiquetas en las fechas límite.
- Permite arrastrar tarjetas entre estados; cada movimiento se guarda en Markdown.
- Las tareas sin fecha aparecen en una lista separada y se pueden arrastrar a un día del calendario para asignar su fecha límite. Las etiquetas de fecha también se pueden arrastrar a otro día.
- Incluye tema claro/oscuro y recuerda la elección localmente.
- Permite añadir tareas con prioridad P0–P3 y fecha límite opcional.
- Permite editar descripción, prioridad, fecha y estado desde las tarjetas. El área queda fija para conservar el identificador asignado.
- Escribe los cambios en el archivo tareas.md del área correspondiente, conserva los identificadores y el resto del Markdown, y detecta si el archivo cambió desde que se cargó.
- Pullear descarga los cambios remotos solo si el árbol local está limpio y la integración puede avanzar por fast-forward.
- Pushear prepara y crea un commit solo con archivos areas/*/tareas.md modificados y hace push normal; nunca usa push --force.
- Si hay archivos ajenos modificados, cambios ya preparados, conflictos o GitHub avanzó, la app se detiene y conserva los cambios.

## Formato Markdown

Una tarea queda en el apartado que refleja su estado:

- [ ] **FIN-001** — Revisar factura · P1 · Vence: 2026-12-01

Los identificadores por área son FIN, T13, NEG y PER. La fecha es opcional y usa AAAA-MM-DD. El estado Completadas se guarda en su propio apartado y con checkbox marcado.

## Seguridad local

La ventana usa aislamiento de contexto, no habilita Node.js en el renderer, y expone por preload solo las operaciones necesarias para elegir el repositorio y leer/escribir tareas. El Markdown permanece en tu disco. Los detalles del modelo de procesos y el puente de preload siguen el patrón de seguridad recomendado por Electron: https://www.electronjs.org/docs/latest/tutorial/process-model
