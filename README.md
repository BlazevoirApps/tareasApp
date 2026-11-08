# Tareas — aplicación de escritorio

Aplicación de escritorio local basada en Electron. Lee y actualiza los Markdown existentes del repositorio Tareas; no necesita Obsidian ni Codex para funcionar. Obsidian se usó como referencia de interfaz y de organización en vistas, después del análisis estático ya realizado. REA no forma parte del flujo de desarrollo de esta app.

## Ejecutarla

Requiere Node.js 24.22.2 o posterior de la rama 24 y npm.

1. Ejecuta npm install.
2. Ejecuta npm start.
3. La primera vez intenta localizar Tareas como carpeta hermana de este proyecto. Si no la encuentra, pulsa Elegir carpeta Markdown y selecciona la raíz del repositorio, la que contiene areas/.

La ruta elegida se guarda en la configuración local de Electron, fuera del repositorio Markdown. En el segundo ordenador, clona ambos repositorios en ubicaciones paralelas o elige la carpeta Tareas allí también.

## Prototipo actual

- Lee las tareas de areas/finanzas, areas/titan13, areas/negocios y areas/personal.
- Visualiza tareas en columnas Pendientes, En curso, En espera y Completadas.
- Permite añadir tareas con prioridad P0–P3 y fecha límite opcional.
- Permite editar descripción, prioridad, fecha y estado desde las tarjetas. El área queda fija para conservar el identificador asignado.
- Escribe los cambios en el archivo tareas.md del área correspondiente, conserva los identificadores y el resto del Markdown, y detecta si el archivo cambió desde que se cargó.
- No sincroniza Git todavía. La sincronización mediante acciones separadas Pullear/Pushear será una funcionalidad posterior.

## Formato Markdown

Una tarea queda en el apartado que refleja su estado:

- [ ] **FIN-001** — Revisar factura · P1 · Vence: 2026-12-01

Los identificadores por área son FIN, T13, NEG y PER. La fecha es opcional y usa AAAA-MM-DD. El estado Completadas se guarda en su propio apartado y con checkbox marcado.

## Seguridad local

La ventana usa aislamiento de contexto, no habilita Node.js en el renderer, y expone por preload solo las operaciones necesarias para elegir el repositorio y leer/escribir tareas. El Markdown permanece en tu disco. Los detalles del modelo de procesos y el puente de preload siguen el patrón de seguridad recomendado por Electron: https://www.electronjs.org/docs/latest/tutorial/process-model
