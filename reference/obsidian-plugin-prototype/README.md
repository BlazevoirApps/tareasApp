# Tareas visual

Prototipo de plugin para Obsidian: alta rápida y tablero por estado. Conserva las tareas en los archivos Markdown del repositorio tareas, con prioridad P0–P3 y fecha límite opcional.

## Uso previsto

La carpeta del repositorio debe estar dentro de la bóveda de Obsidian o ser una subcarpeta visible para ella. Abre como bóveda la carpeta padre del repositorio (por ejemplo, Documents/ChatGPT), instala el plugin y configura la ruta relativa del repositorio; el valor inicial es Tareas. El plugin solo accede a areas/<área>/tareas.md y no copia ni migra datos. No añadas la configuración de Obsidian a ese repositorio Markdown.

## Desarrollo

1. Instala Node.js 18 o posterior y ejecuta npm install.
2. Ejecuta npm run build.
3. Copia manifest.json, main.js y styles.css a .obsidian/plugins/tareas-visual en la bóveda anfitriona.
4. Activa Tareas visual en Ajustes → Plugins de la comunidad.

## Alcance de este prototipo

Permite crear tareas y las presenta en cuatro columnas de estado, ordenadas por prioridad y fecha. El estado se deriva del apartado Markdown; el checkbox indica completadas. Aún no edita ni mueve tareas existentes y no incluye sincronización Git (Pullear/Pushear), búsqueda ni calendario.
