"use strict";

const AREAS = [
  { slug: "finanzas", name: "Finanzas", prefix: "FIN" },
  { slug: "titan13", name: "Titan13", prefix: "T13" },
  { slug: "negocios", name: "Negocios", prefix: "NEG" },
  { slug: "personal", name: "Personal", prefix: "PER" }
];
const STATUSES = ["Pendientes", "En curso", "En espera", "Completadas"];
const PRIORITIES = ["P0", "P1", "P2", "P3"];
const state = { tasks: [], hashes: {}, repositoryPath: "", area: "all", query: "", view: "board", month: new Date(new Date().getFullYear(), new Date().getMonth(), 1) };
let draggedTask = null;
let suppressNextClick = false;
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
function localDate(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
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
function setupTheme() {
  const saved = localStorage.getItem("tareas-theme");
  setTheme(saved === "dark" ? "dark" : "light", false);
  $("#theme-toggle").addEventListener("click", () => {
    setTheme(document.body.dataset.theme === "dark" ? "light" : "dark", true);
  });
}
function setTheme(theme, persist) {
  document.body.dataset.theme = theme;
  $("#theme-toggle").innerHTML = theme === "dark" ? "☼ <span>Claro</span>" : "◐ <span>Oscuro</span>";
  $("#theme-toggle").setAttribute("aria-label", theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro");
  if (persist) localStorage.setItem("tareas-theme", theme);
}
function localDatePlus(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDate(date);
}
function matches(task) {
  const areaMatch = state.area === "all" || task.area === state.area;
  const q = state.query.trim().toLocaleLowerCase("es");
  const queryMatch = !q || (task.title + " " + task.id + " " + task.areaName).toLocaleLowerCase("es").includes(q);
  return areaMatch && queryMatch;
}
function renderSummary(tasks) {
  const summary = $("#summary");
  summary.replaceChildren();
  const open = tasks.filter(task => task.status !== "Completadas");
  const today = localDate();
  const dueSoon = open.filter(task => task.due && task.due >= today && task.due <= localDatePlus(7)).length;
  const values = [
    { label: "Tareas abiertas", value: String(open.length), icon: "◷", tone: "blue" },
    { label: "Vencidas", value: String(open.filter(task => task.due && task.due < today).length), icon: "!", tone: "red" },
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
function render() {
  const tasks = state.tasks.filter(matches);
  renderSummary(tasks);
  $("#board").hidden = state.view !== "board";
  $("#calendar-view").hidden = state.view !== "calendar";
  $("#nav-board").classList.toggle("selected", state.view === "board");
  $("#nav-calendar").classList.toggle("selected", state.view === "calendar");
  $("#drag-hint").hidden = state.view !== "board";
  $("#view-heading").textContent = state.view === "calendar" ? "Calendario" : "Tablero";
  if (state.view === "calendar") renderCalendar(tasks);
  else renderBoard(tasks);
  $("#task-count").textContent = tasks.length + (tasks.length === 1 ? " tarea" : " tareas");
  $("#repo-path").textContent = state.repositoryPath || "Selecciona el repositorio de Markdown";
}
function bindDropTarget(column, status) {
  column.addEventListener("dragover", event => {
    if (!draggedTask) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    column.classList.add("drop-target");
  });
  column.addEventListener("dragleave", event => {
    if (!column.contains(event.relatedTarget)) column.classList.remove("drop-target");
  });
  column.addEventListener("drop", event => {
    event.preventDefault();
    column.classList.remove("drop-target");
    let payload = draggedTask;
    try { payload = JSON.parse(event.dataTransfer.getData("text/plain")); } catch {}
    const task = state.tasks.find(item => item.id === payload?.id && item.area === payload?.area);
    draggedTask = null;
    if (task) void moveTask(task, status);
  });
}
function renderBoard(tasks) {
  board.replaceChildren();
  for (const status of STATUSES) {
    const list = tasks.filter(task => task.status === status).sort((a, b) =>
      PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) ||
      (a.due || "9999-12-31").localeCompare(b.due || "9999-12-31"));
    const column = textNode("section", "", "column");
    bindDropTarget(column, status);
    const heading = textNode("div", "", "column-heading");
    heading.append(textNode("h2", status), textNode("span", String(list.length), "column-count"));
    column.append(heading);
    const cards = textNode("div", "", "cards");
    if (!list.length) cards.append(textNode("div", "Todo despejado", "empty-state"));
    for (const task of list) cards.append(makeCard(task));
    column.append(cards);
    board.append(column);
  }
}
function renderCalendar(tasks) {
  const year = state.month.getFullYear();
  const month = state.month.getMonth();
  const title = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(state.month);
  $("#calendar-month").textContent = title.charAt(0).toLocaleUpperCase("es") + title.slice(1);
  const grid = $("#calendar-grid");
  grid.replaceChildren();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells = Math.ceil((offset + count) / 7) * 7;
  const today = localDate();
  for (let index = 0; index < cells; index++) {
    const date = new Date(year, month, index - offset + 1);
    const key = localDate(date);
    const cell = textNode("div", "", "calendar-day");
    if (date.getMonth() !== month) cell.classList.add("outside-month");
    if (key === today) cell.classList.add("today");
    const head = textNode("div", "", "calendar-day-head");
    head.append(textNode("span", String(date.getDate()), "calendar-day-number"));
    if (key === today) head.append(textNode("span", "HOY", "today-label"));
    cell.append(head);
    const dayTasks = tasks.filter(task => task.due === key);
    for (const task of dayTasks) {
      const event = textNode("button", "", "calendar-event priority-" + task.priority.toLowerCase() + (task.status === "Completadas" ? " is-completed" : ""));
      event.type = "button";
      event.title = task.id + " · " + task.title;
      event.append(textNode("span", "", "calendar-event-dot"), textNode("span", task.title, "calendar-event-title"));
      event.addEventListener("click", () => openEdit(task));
      cell.append(event);
    }
    grid.append(cell);
  }
  const undated = $("#undated-list");
  undated.replaceChildren();
  const noDate = tasks.filter(task => !task.due).sort((a, b) =>
    PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || a.title.localeCompare(b.title, "es"));
  $("#undated-count").textContent = String(noDate.length);
  if (!noDate.length) undated.append(textNode("div", "No hay tareas sin fecha en esta vista.", "undated-empty"));
  for (const task of noDate) {
    const tag = textNode("button", "", "undated-task priority-" + task.priority.toLowerCase() + (task.status === "Completadas" ? " is-completed" : ""));
    tag.type = "button";
    tag.append(textNode("span", task.id, "undated-id"), textNode("span", task.title, "undated-title"), textNode("span", task.areaName, "undated-area"));
    tag.addEventListener("click", () => openEdit(task));
    undated.append(tag);
  }
}
async function moveTask(task, status) {
  if (task.status === status) return;
  try {
    const result = await window.tareasApp.updateTask({
      id: task.id,
      title: task.title,
      area: task.area,
      priority: task.priority,
      due: task.due || "",
      status,
      expectedHash: state.hashes[task.area]
    });
    state.tasks = result.tasks;
    state.hashes = result.hashes;
    state.repositoryPath = result.repositoryPath;
    render();
    showNotice(task.id + " movida a " + status + " y guardada en Markdown.", "success");
  } catch (error) {
    const message = error.message || String(error);
    showNotice(message, error.code === "FILE_CHANGED" || message.includes("El Markdown cambió") ? "warning" : "error");
  }
}
function makeCard(task) {
  const card = textNode("button", "", "task-card priority-" + task.priority.toLowerCase());
  card.type = "button";
  card.draggable = true;
  card.title = "Arrastra a otro estado o pulsa para editar";
  card.setAttribute("aria-label", "Editar " + task.id + ": " + task.title);
  const top = textNode("div", "", "card-top");
  top.append(textNode("span", task.id, "task-id"), textNode("span", task.priority, "priority-pill"));
  card.append(top, textNode("div", task.title, "task-title"));
  const meta = textNode("div", "", "card-meta");
  meta.append(textNode("span", task.areaName, "area-chip"));
  if (task.due) {
    const due = textNode("span", task.due, "due-date" + (task.due < localDate() && task.status !== "Completadas" ? " overdue" : ""));
    meta.append(due);
  }
  card.append(meta);
  card.addEventListener("dragstart", event => {
    draggedTask = { id: task.id, area: task.area };
    suppressNextClick = true;
    card.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify(draggedTask));
  });
  card.addEventListener("dragend", () => {
    card.classList.remove("is-dragging");
    document.querySelectorAll(".column.drop-target").forEach(column => column.classList.remove("drop-target"));
    setTimeout(() => { suppressNextClick = false; draggedTask = null; }, 150);
  });
  card.addEventListener("click", () => {
    if (suppressNextClick) { suppressNextClick = false; return; }
    openEdit(task);
  });
  return card;
}
function setView(view) {
  state.view = view;
  render();
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
    const message = error.message || String(error);
    showNotice(message, error.code === "FILE_CHANGED" || message.includes("El Markdown cambió") ? "warning" : "error");
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
$("#nav-board").addEventListener("click", () => setView("board"));
$("#nav-calendar").addEventListener("click", () => setView("calendar"));
$("#calendar-prev").addEventListener("click", () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); render(); });
$("#calendar-next").addEventListener("click", () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); render(); });
$("#calendar-today").addEventListener("click", () => { const now = new Date(); state.month = new Date(now.getFullYear(), now.getMonth(), 1); render(); });
setupSelects();
setupTheme();
void refresh();
