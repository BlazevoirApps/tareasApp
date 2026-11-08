"use strict";

const AREAS = [
  { slug: "finanzas", name: "Finanzas", prefix: "FIN" },
  { slug: "titan13", name: "Titan13", prefix: "T13" },
  { slug: "negocios", name: "Negocios", prefix: "NEG" },
  { slug: "personal", name: "Personal", prefix: "PER" }
];
const STATUSES = ["Pendientes", "En curso", "En espera", "Completadas"];
const PRIORITIES = ["P0", "P1", "P2", "P3"];
const state = { tasks: [], hashes: {}, repositoryPath: "", area: "all", query: "" };
const $ = selector => document.querySelector(selector);
const board = $("#board");
const notice = $("#notice");
const dialog = $("#task-dialog");
const form = $("#task-form");

function showNotice(message, kind) {
  notice.textContent = message;
  notice.className = "notice " + (kind || "info");
  notice.hidden = false;
}
function hideNotice() { notice.hidden = true; }
function textNode(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
function localDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function setupSelects() {
  const filter = $("#area-filter");
  const taskArea = $("#task-area");
  filter.replaceChildren(new Option("Todas las áreas", "all"));
  taskArea.replaceChildren();
  for (const area of AREAS) {
    filter.add(new Option(area.name, area.slug));
    taskArea.add(new Option(area.name, area.slug));
  }
}
function renderSummary(tasks) {
  const summary = $("#summary");
  summary.replaceChildren();
  const open = tasks.filter(task => task.status !== "Completadas");
  const overdue = open.filter(task => task.due && task.due < localDate()).length;
  const dueSoon = open.filter(task => task.due && task.due >= localDate() && task.due <= localDatePlus(7)).length;
  const values = [
    { label: "Tareas abiertas", value: String(open.length), icon: "◷", tone: "blue" },
    { label: "Vencidas", value: String(overdue), icon: "!", tone: "red" },
    { label: "Vencen en 7 días", value: String(dueSoon), icon: "↗", tone: "amber" },
    { label: "Completadas", value: String(tasks.filter(task => task.status === "Completadas").length), icon: "✓", tone: "green" }
  ];
  for (const item of values) {
    const card = textNode("div", "", "summary-card");
    card.append(textNode("span", item.icon, "summary-icon " + item.tone));
    const copy = textNode("div", "", "summary-copy");
    copy.append(textNode("strong", item.value), textNode("span", item.label));
    card.append(copy);
    summary.append(card);
  }
}
function localDatePlus(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function matches(task) {
  const areaMatch = state.area === "all" || task.area === state.area;
  const q = state.query.trim().toLocaleLowerCase("es");
  const queryMatch = !q || (task.title + " " + task.id + " " + task.areaName).toLocaleLowerCase("es").includes(q);
  return areaMatch && queryMatch;
}
function render() {
  const tasks = state.tasks.filter(matches);
  renderSummary(state.tasks);
  board.replaceChildren();
  for (const status of STATUSES) {
    const list = tasks.filter(task => task.status === status).sort((a, b) =>
      PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) ||
      (a.due || "9999-12-31").localeCompare(b.due || "9999-12-31"));
    const column = textNode("section", "", "column");
    const heading = textNode("div", "", "column-heading");
    heading.append(textNode("h2", status), textNode("span", String(list.length), "column-count"));
    column.append(heading);
    const cards = textNode("div", "", "cards");
    if (!list.length) cards.append(textNode("div", "Todo despejado", "empty-state"));
    for (const task of list) cards.append(makeCard(task));
    column.append(cards);
    board.append(column);
  }
  const count = state.tasks.length;
  $("#task-count").textContent = count + (count === 1 ? " tarea" : " tareas");
  $("#repo-path").textContent = state.repositoryPath || "Selecciona el repositorio de Markdown";
}
function makeCard(task) {
  const card = textNode("button", "", "task-card priority-" + task.priority.toLowerCase());
  card.type = "button";
  card.setAttribute("aria-label", "Editar " + task.id + ": " + task.title);
  const top = textNode("div", "", "card-top");
  top.append(textNode("span", task.id, "task-id"), textNode("span", task.priority, "priority-pill"));
  card.append(top);
  card.append(textNode("div", task.title, "task-title"));
  const meta = textNode("div", "", "card-meta");
  meta.append(textNode("span", task.areaName, "area-chip"));
  if (task.due) {
    const due = textNode("span", task.due, "due-date" + (task.due < localDate() && task.status !== "Completadas" ? " overdue" : ""));
    meta.append(due);
  }
  card.append(meta);
  card.addEventListener("click", () => openEdit(task));
  return card;
}
function openCreate() {
  if (!state.repositoryPath) {
    showNotice("Elige primero la carpeta local del repositorio Tareas.", "warning");
    return;
  }
  form.reset();
  $("#task-id").value = "";
  $("#dialog-kicker").textContent = "AÑADIR AL TABLERO";
  $("#dialog-title").textContent = "Nueva tarea";
  $("#task-priority").value = "P2";
  $("#task-status").value = "Pendientes";
  $("#task-area").value = state.area === "all" ? "personal" : state.area;
  $("#task-area").disabled = false;
  $("#save-task").textContent = "Añadir tarea";
  dialog.showModal();
  $("#task-title").focus();
}
function openEdit(task) {
  form.reset();
  $("#task-id").value = task.id;
  $("#dialog-kicker").textContent = task.id + " · " + task.areaName.toLocaleUpperCase("es");
  $("#dialog-title").textContent = "Editar tarea";
  $("#task-title").value = task.title;
  $("#task-area").value = task.area;
  $("#task-area").disabled = true;
  $("#task-priority").value = task.priority;
  $("#task-due").value = task.due || "";
  $("#task-status").value = task.status;
  $("#save-task").textContent = "Guardar cambios";
  dialog.showModal();
}
async function refresh() {
  try {
    const result = await window.tareasApp.loadTasks();
    state.tasks = result.tasks;
    state.hashes = result.hashes;
    state.repositoryPath = result.repositoryPath;
    hideNotice();
    render();
  } catch (error) {
    showNotice(error.message || String(error), "error");
  }
}
async function chooseRepository() {
  try {
    const selected = await window.tareasApp.chooseRepository();
    if (!selected) return;
    await refresh();
  } catch (error) {
    showNotice(error.message || String(error), "error");
  }
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  const id = $("#task-id").value;
  const area = $("#task-area").value;
  const input = {
    id,
    title: $("#task-title").value,
    area,
    priority: $("#task-priority").value,
    due: $("#task-due").value,
    status: $("#task-status").value,
    expectedHash: state.hashes[area]
  };
  const save = $("#save-task");
  save.disabled = true;
  try {
    const result = id ? await window.tareasApp.updateTask(input) : await window.tareasApp.createTask(input);
    state.tasks = result.tasks;
    state.hashes = result.hashes;
    state.repositoryPath = result.repositoryPath;
    dialog.close();
    render();
    showNotice(id ? "Cambios guardados en el Markdown local." : "Tarea añadida al Markdown local.", "success");
  } catch (error) {
    const message = error.message || String(error); showNotice(message, error.code === "FILE_CHANGED" || message.includes("El Markdown cambió") ? "warning" : "error");
  } finally {
    save.disabled = false;
  }
});
$("#add-task").addEventListener("click", openCreate);
$("#choose-repo").addEventListener("click", chooseRepository);
$("#refresh").addEventListener("click", refresh);
$("#close-dialog").addEventListener("click", () => dialog.close());
$("#cancel-dialog").addEventListener("click", () => dialog.close());
$("#area-filter").addEventListener("change", event => { state.area = event.target.value; render(); });
$("#search").addEventListener("input", event => { state.query = event.target.value; render(); });
$("#nav-board").addEventListener("click", () => { state.area = "all"; $("#area-filter").value = "all"; render(); });
setupSelects();
void refresh();
