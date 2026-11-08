"use strict";

const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const AREAS = [
  { slug: "finanzas", name: "Finanzas", prefix: "FIN" },
  { slug: "titan13", name: "Titan13", prefix: "T13" },
  { slug: "negocios", name: "Negocios", prefix: "NEG" },
  { slug: "personal", name: "Personal", prefix: "PER" }
];
const STATUSES = ["Pendientes", "En curso", "En espera", "Completadas"];
const PRIORITIES = ["P0", "P1", "P2", "P3"];
const CONFIG_FILE = () => path.join(app.getPath("userData"), "settings.json");
let settings = { repositoryPath: "" };

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
async function createTask(input) {
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
async function updateTask(input) {
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
  ipcMain.handle("tasks:create", (_event, input) => createTask(input));
  ipcMain.handle("tasks:update", (_event, input) => updateTask(input));
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
