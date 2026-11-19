"use strict";

const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const execFileAsync = promisify(execFile);

const AREAS = [
  { slug: "finanzas", name: "Finanzas", prefix: "FIN" },
  { slug: "titan13", name: "Titan13", prefix: "T13" },
  { slug: "negocios", name: "Negocios", prefix: "NEG" },
  { slug: "personal", name: "Personal", prefix: "PER" }
];
const STATUSES = ["Pendientes", "En curso", "En espera", "Completadas"];
const PRIORITIES = ["P0", "P1", "P2", "P3"];
const TASK_FILE_PATHS = new Set(AREAS.map(area => "areas/" + area.slug + "/tareas.md"));
const CONFIG_FILE = () => path.join(app.getPath("userData"), "settings.json");
let settings = { repositoryPath: "" };
let syncInProgress = false;
let activeMutations = 0;

function digest(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}
function areaFor(slug) {
  const area = AREAS.find(item => item.slug === slug);
  if (!area) throw new Error("Área desconocida.");
  return area;
}
function taskPath(root, area) {
  const base = path.resolve(root);
  const file = path.resolve(base, "areas", area.slug, "tareas.md");
  if (!file.startsWith(base + path.sep)) throw new Error("Ruta del archivo fuera del repositorio.");
  return file;
}
async function validateRepository(root) {
  const fullPath = path.resolve(root);
  const areasDir = path.join(fullPath, "areas");
  const stat = await fs.stat(areasDir).catch(() => null);
  if (!stat || !stat.isDirectory()) throw new Error("La carpeta seleccionada no parece el repositorio Tareas: falta areas/.");
  return fullPath;
}
function parseLine(line, area, status) {
  const match = line.match(/^- \[([ xX])\] \*\*([A-Z0-9]+-\d+)\*\* — (.+?)(?: · (P[0-3]))?(?: · Vence: (\d{4}-\d{2}-\d{2}))?$/);
  if (!match) return null;
  return {
    id: match[2],
    title: match[3],
    area: area.slug,
    areaName: area.name,
    priority: match[4] || "P2",
    due: match[5] || "",
    status: match[1].toLowerCase() === "x" ? "Completadas" : status
  };
}
function parseTasks(text, area) {
  const tasks = [];
  let status = "Pendientes";
  for (const line of text.split(/\r?\n/)) {
    const section = line.match(/^##\s+(Pendientes|En curso|En espera|Completadas)\s*$/);
    if (section) {
      status = section[1];
      continue;
    }
    const task = parseLine(line, area, status);
    if (task) tasks.push(task);
  }
  return tasks;
}
function makeLine(task) {
  const checkbox = task.status === "Completadas" ? "x" : " ";
  return "- [" + checkbox + "] **" + task.id + "** — " + task.title.trim() + " · " + task.priority
    + (task.due ? " · Vence: " + task.due : "");
}
function addToSection(text, status, row) {
  const lines = text.split(/\r?\n/);
  const heading = "## " + status;
  const start = lines.findIndex(line => line.trim() === heading);
  if (start < 0) {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    lines.push("", heading, "", row, "");
    return lines.join("\n");
  }
  let end = start + 1;
  while (end < lines.length && !/^##\s/.test(lines[end])) end++;
  const body = lines.slice(start + 1, end).filter(line => !/^\s*Todavía no hay tareas registradas\.\s*$/.test(line));
  while (body.length && !body[body.length - 1].trim()) body.pop();
  body.push(row, "");
  return [...lines.slice(0, start + 1), "", ...body, ...lines.slice(end)].join("\n");
}
function validateTaskInput(input) {
  const title = String(input.title || "").replace(/[\r\n]+/g, " ").trim();
  if (!title) throw new Error("Escribe una descripción para la tarea.");
  if (title.length > 240) throw new Error("La descripción admite hasta 240 caracteres.");
  const priority = String(input.priority || "");
  if (!PRIORITIES.includes(priority)) throw new Error("Prioridad no válida.");
  const status = String(input.status || "Pendientes");
  if (!STATUSES.includes(status)) throw new Error("Estado no válido.");
  let due = String(input.due || "").trim();
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error("Usa fecha límite AAAA-MM-DD.");
  if (due) {
    const date = new Date(due + "T00:00:00Z");
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== due) throw new Error("La fecha límite no existe.");
  }
  return { title, priority, status, due };
}
async function readArea(area) {
  const file = taskPath(settings.repositoryPath, area);
  const text = await fs.readFile(file, "utf8");
  return { file, text, hash: digest(text) };
}
async function loadTasks() {
  if (!settings.repositoryPath) return { tasks: [], hashes: {}, repositoryPath: "" };
  const tasks = [];
  const hashes = {};
  for (const area of AREAS) {
    try {
      const current = await readArea(area);
      tasks.push(...parseTasks(current.text, area));
      hashes[area.slug] = current.hash;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return { tasks, hashes, repositoryPath: settings.repositoryPath };
}
async function writeSafely(file, text) {
  const temp = file + "." + process.pid + ".tmp";
  try {
    await fs.writeFile(temp, text, { encoding: "utf8", flag: "wx" });
    await fs.rename(temp, file);
  } finally {
    await fs.unlink(temp).catch(() => {});
  }
}
async function assertExpected(current, expectedHash) {
  if (!expectedHash || digest(current) !== expectedHash) {
    const error = new Error("El Markdown cambió desde la última lectura. Recarga las tareas y vuelve a aplicar tu cambio.");
    error.code = "FILE_CHANGED";
    throw error;
  }
}
async function createTaskImpl(input) {
  const area = areaFor(input.area);
  const values = validateTaskInput(input);
  const { file, text, hash } = await readArea(area);
  await assertExpected(text, input.expectedHash);
  const idPattern = new RegExp("\\*\\*" + area.prefix + "-(\\d+)\\*\\*", "g");
  let highest = 0;
  for (const match of text.matchAll(idPattern)) highest = Math.max(highest, Number(match[1]));
  const task = { ...values, id: area.prefix + "-" + String(highest + 1).padStart(3, "0") };
  const updated = addToSection(text, task.status, makeLine(task));
  await assertExpected(await fs.readFile(file, "utf8"), hash);
  await writeSafely(file, updated);
  return loadTasks();
}
async function updateTaskImpl(input) {
  const area = areaFor(input.area);
  const values = validateTaskInput(input);
  const { file, text } = await readArea(area);
  await assertExpected(text, input.expectedHash);
  const occurrences = [];
  const lines = text.split(/\r?\n/);
  let status = "Pendientes";
  for (let index = 0; index < lines.length; index++) {
    const section = lines[index].match(/^##\s+(Pendientes|En curso|En espera|Completadas)\s*$/);
    if (section) status = section[1];
    const parsed = parseLine(lines[index], area, status);
    if (parsed && parsed.id === input.id) occurrences.push({ index, task: parsed });
  }
  if (occurrences.length !== 1) throw new Error("No encuentro una única tarea con el identificador " + input.id + ".");
  const old = occurrences[0].task;
  lines.splice(occurrences[0].index, 1);
  const task = { ...old, ...values };
  const updated = addToSection(lines.join("\n"), task.status, makeLine(task));
  await assertExpected(await fs.readFile(file, "utf8"), input.expectedHash);
  await writeSafely(file, updated);
  return loadTasks();
}
async function chooseRepository() {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (result.canceled || !result.filePaths[0]) return settings.repositoryPath;
  settings.repositoryPath = await validateRepository(result.filePaths[0]);
  await fs.mkdir(path.dirname(CONFIG_FILE()), { recursive: true });
  await fs.writeFile(CONFIG_FILE(), JSON.stringify(settings, null, 2), "utf8");
  return settings.repositoryPath;
}
async function loadSettings() {
  try {
    settings = { ...settings, ...JSON.parse(await fs.readFile(CONFIG_FILE(), "utf8")) };
  } catch {}
  if (!settings.repositoryPath) {
    const sibling = path.resolve(__dirname, "..", "Tareas");
    try {
      settings.repositoryPath = await validateRepository(sibling);
      await fs.mkdir(path.dirname(CONFIG_FILE()), { recursive: true });
      await fs.writeFile(CONFIG_FILE(), JSON.stringify(settings, null, 2), "utf8");
    } catch {}
  }
}
async function withMutation(action) {
  if (syncInProgress) throw new Error("La sincronización está en curso. Espera a que termine.");
  activeMutations += 1;
  try { return await action(); }
  finally { activeMutations -= 1; }
}
function createTask(input) { return withMutation(() => createTaskImpl(input)); }
function updateTask(input) { return withMutation(() => updateTaskImpl(input)); }

async function runGit(args) {
  if (!settings.repositoryPath) throw new Error("Selecciona primero la carpeta local del repositorio Tareas.");
  try {
    const result = await execFileAsync("git", args, {
      cwd: settings.repositoryPath,
      windowsHide: true,
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    });
    return { stdout: result.stdout.trim(), stderr: result.stderr.trim() };
  } catch (error) {
    const detail = String(error.stderr || error.message || "fallo de Git").trim();
    throw new Error("Git: " + detail);
  }
}
function parseGitStatus(raw) {
  return raw.split(/\r?\n/).filter(Boolean).map(line => ({
    code: line.slice(0, 2),
    path: line.slice(3).trim()
  }));
}
function assertOnlyTaskChanges(entries) {
  const unsafe = entries.filter(entry => !TASK_FILE_PATHS.has(entry.path) || /[DR]/.test(entry.code));
  if (unsafe.length) {
    throw new Error("Hay cambios ajenos a los archivos tareas.md o archivos eliminados/renombrados. No los tocaré; revísalos manualmente.");
  }
}
async function getGitStatus() {
  const result = await runGit(["status", "--porcelain=v1", "--untracked-files=all"]);
  return parseGitStatus(result.stdout);
}
async function getUpstreamState() {
  const upstream = (await runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])).stdout;
  const result = await runGit(["rev-list", "--left-right", "--count", "HEAD..." + upstream]);
  const [ahead, behind] = result.stdout.split(/\s+/).map(Number);
  return { upstream, ahead: ahead || 0, behind: behind || 0 };
}
async function changedFiles(range) {
  const result = await runGit(["diff", "--name-only", range]);
  return result.stdout ? result.stdout.split(/\r?\n/).filter(Boolean) : [];
}
async function pullTaskChanges() {
  if (syncInProgress) throw new Error("Ya hay una sincronización en curso.");
  if (activeMutations) throw new Error("Espera a que termine de guardarse la tarea antes de sincronizar.");
  syncInProgress = true;
  try {
    const initial = await getGitStatus();
    if (initial.length) throw new Error("Hay cambios locales sin sincronizar. Pullear no los sobrescribirá; pushea o revisa esos cambios primero.");
    await runGit(["fetch", "origin"]);
    const state = await getUpstreamState();
    if (state.ahead && state.behind) throw new Error("La rama local y la remota han divergido. No se integró nada; conserva ambos lados y resuelve la divergencia manualmente.");
    if (state.ahead) throw new Error("Hay commits locales por publicar. Usa Pushear cambios antes de pullear.");
    if (!state.behind) {
      return { ...(await loadTasks()), message: "Las tareas ya están actualizadas." };
    }
    await runGit(["merge", "--ff-only", state.upstream]);
    return { ...(await loadTasks()), message: "Cambios remotos descargados e integrados." };
  } finally {
    syncInProgress = false;
  }
}
async function pushTaskChanges() {
  if (syncInProgress) throw new Error("Ya hay una sincronización en curso.");
  if (activeMutations) throw new Error("Espera a que termine de guardarse la tarea antes de sincronizar.");
  syncInProgress = true;
  try {
    const status = await getGitStatus();
    assertOnlyTaskChanges(status);
    const staged = await runGit(["diff", "--cached", "--name-only"]);
    if (staged.stdout) throw new Error("Hay cambios ya preparados en Git. No los incluiré en el push de tareas; revísalos primero.");
    await runGit(["fetch", "origin"]);
    let state = await getUpstreamState();
    if (state.behind) {
      if (state.ahead) throw new Error("La rama local y la remota han divergido. No se publicó nada; primero resuelve la divergencia sin forzar el push.");
      throw new Error("GitHub tiene cambios nuevos. Pullea los cambios y revisa el estado antes de volver a pushear.");
    }
    if (state.ahead) {
      const committed = await changedFiles(state.upstream + "..HEAD");
      if (committed.some(file => !TASK_FILE_PATHS.has(file))) {
        throw new Error("Hay commits locales con archivos ajenos a tareas.md. No los subiré desde esta opción.");
      }
    }
    if (status.length) {
      const paths = [...new Set(status.map(entry => entry.path))];
      await runGit(["add", "--", ...paths]);
      const stagedAfterAdd = await runGit(["diff", "--cached", "--name-only"]);
      const stagedPaths = stagedAfterAdd.stdout ? stagedAfterAdd.stdout.split(/\r?\n/).filter(Boolean) : [];
      if (stagedPaths.some(file => !TASK_FILE_PATHS.has(file))) {
        throw new Error("El área de preparación contiene archivos ajenos a tareas.md. No se creó el commit.");
      }
      if (stagedPaths.length) {
        const date = new Intl.DateTimeFormat("sv-SE", {
          timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit"
        }).format(new Date());
        await runGit(["commit", "-m", "Update tasks " + date]);
      }
    }
    const remaining = await getGitStatus();
    if (remaining.length) throw new Error("Aparecieron cambios nuevos durante la sincronización. El commit local se conserva; revisa el estado antes de volver a pushear.");
    state = await getUpstreamState();
    if (state.behind) throw new Error("GitHub avanzó durante la operación. El commit local se conserva; pullea y revisa antes de reintentar.");
    if (!state.ahead) {
      return { ...(await loadTasks()), message: "No hay cambios de tareas nuevos que publicar." };
    }
    await runGit(["push"]);
    return { ...(await loadTasks()), message: "Cambios de tareas publicados en GitHub." };
  } finally {
    syncInProgress = false;
  }
}
function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 920,
    minHeight: 650,
    backgroundColor: "#f5f6f8",
    title: "Tareas",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.loadFile(path.join(__dirname, "index.html"));
}
app.whenReady().then(async () => {
  app.setName("Tareas");
  await loadSettings();
  ipcMain.handle("tasks:load", loadTasks);
  ipcMain.handle("repository:choose", chooseRepository);
  ipcMain.handle("repository:pull-tasks", pullTaskChanges);
  ipcMain.handle("repository:push-tasks", pushTaskChanges);
  ipcMain.handle("tasks:create", (_event, input) => createTask(input));
  ipcMain.handle("tasks:update", (_event, input) => updateTask(input));
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
