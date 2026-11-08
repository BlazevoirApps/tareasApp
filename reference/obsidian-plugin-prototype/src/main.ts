import { App, ItemView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from "obsidian";

const VIEW = "tareas-visual-board";
type Priority = "P0" | "P1" | "P2" | "P3";
type Status = "Pendientes" | "En curso" | "En espera" | "Completadas";
interface Area { slug: string; name: string; prefix: string }
interface Task { id: string; title: string; area: Area; priority: Priority; due?: string; status: Status }
interface Settings { repositoryFolder: string }
const AREAS: Area[] = [
  { slug: "finanzas", name: "Finanzas", prefix: "FIN" },
  { slug: "titan13", name: "Titan13", prefix: "T13" },
  { slug: "negocios", name: "Negocios", prefix: "NEG" },
  { slug: "personal", name: "Personal", prefix: "PER" },
];
const STATUSES: Status[] = ["Pendientes", "En curso", "En espera", "Completadas"];
const PRIORITIES: Priority[] = ["P0", "P1", "P2", "P3"];
const DEFAULTS: Settings = { repositoryFolder: "Tareas" };

function filePath(folder: string, area: Area): string {
  const clean = folder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return clean ? clean + "/areas/" + area.slug + "/tareas.md" : "areas/" + area.slug + "/tareas.md";
}
function parse(text: string, area: Area): Task[] {
  const out: Task[] = [];
  let status: Status = "Pendientes";
  for (const line of text.split(/\r?\n/)) {
    const head = line.match(/^##\s+(Pendientes|En curso|En espera|Completadas)\s*$/);
    if (head) { status = head[1] as Status; continue; }
    const m = line.match(/^- \[([ xX])\] \*\*([A-Z0-9]+-\d+)\*\* — (.+?)(?: · (P[0-3]))?(?: · Vence: (\d{4}-\d{2}-\d{2}))?$/);
    if (m) out.push({ id: m[2], title: m[3], area, priority: (m[4] as Priority) || "P2", due: m[5], status: m[1].toLowerCase() === "x" ? "Completadas" : status });
  }
  return out;
}
function insert(text: string, status: Status, line: string): string {
  const re = new RegExp("^## " + status + "\\s*$", "m");
  const found = re.exec(text);
  if (!found || found.index === undefined) return text.trimEnd() + "\n\n## " + status + "\n\n" + line + "\n";
  const start = found.index + found[0].length;
  const rest = text.slice(start);
  const offset = rest.search(/^##\s/m);
  const end = offset < 0 ? text.length : start + offset;
  const body = text.slice(start, end).replace(/\r?\n?Todavía no hay tareas registradas\.\s*/g, "").trim();
  return text.slice(0, start) + "\n" + (body ? body + "\n" : "\n") + line + "\n" + text.slice(end);
}
function markdown(task: Task): string {
  return "- [ ] **" + task.id + "** — " + task.title + " · " + task.priority + (task.due ? " · Vence: " + task.due : "");
}

export default class TareasPlugin extends Plugin {
  settings: Settings = DEFAULTS;
  async onload(): Promise<void> {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.registerView(VIEW, leaf => new BoardView(leaf, this));
    this.addRibbonIcon("check-square", "Abrir tareas", () => void this.openBoard());
    this.addCommand({ id: "open-board", name: "Abrir tablero de tareas", callback: () => void this.openBoard() });
    this.addSettingTab(new TareasSettingsTab(this.app, this));
  }
  async saveSettings(): Promise<void> { await this.saveData(this.settings); this.refresh(); }
  refresh(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW)) if (leaf.view instanceof BoardView) void leaf.view.render();
  }
  async tasks(): Promise<Task[]> {
    const all: Task[] = [];
    for (const area of AREAS) {
      const file = this.app.vault.getAbstractFileByPath(filePath(this.settings.repositoryFolder, area));
      if (file instanceof TFile) all.push(...parse(await this.app.vault.read(file), area));
    }
    return all;
  }
  async add(title: string, area: Area, priority: Priority, due?: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath(this.settings.repositoryFolder, area));
    if (!(file instanceof TFile)) throw new Error("No encuentro " + filePath(this.settings.repositoryFolder, area) + ". Comprueba la carpeta del repositorio.");
    const before = await this.app.vault.read(file);
    const ids = Array.from(before.matchAll(new RegExp("\\*\\*" + area.prefix + "-(\\d+)\\*\\*", "g")), m => Number(m[1]));
    const id = area.prefix + "-" + String(Math.max(0, ...ids) + 1).padStart(3, "0");
    const task: Task = { id, title: title.trim(), area, priority, due, status: "Pendientes" };
    await this.app.vault.modify(file, insert(before, "Pendientes", markdown(task)));
    new Notice("Añadida " + id);
    this.refresh();
  }
  async openBoard(): Promise<void> {
    let leaf: WorkspaceLeaf | null = this.app.workspace.getLeavesOfType(VIEW)[0] || null;
    if (!leaf) leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
}

class BoardView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: TareasPlugin) { super(leaf); }
  getViewType(): string { return VIEW; }
  getDisplayText(): string { return "Tareas"; }
  getIcon(): string { return "check-square"; }
  async onOpen(): Promise<void> { await this.render(); }
  async render(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty(); root.addClass("tv-board");
    const bar = root.createDiv({ cls: "tv-toolbar" });
    bar.createEl("h2", { text: "Tareas" });
    const actions = bar.createDiv({ cls: "tv-actions" });
    actions.createEl("button", { text: "＋ Nueva tarea", cls: "mod-cta" }).addEventListener("click", () => new NewTaskModal(this.app, this.plugin).open());
    actions.createEl("button", { text: "Actualizar" }).addEventListener("click", () => void this.render());
    let tasks: Task[];
    try { tasks = await this.plugin.tasks(); }
    catch (e) { root.createEl("p", { text: "No se pudieron leer las tareas: " + String(e), cls: "tv-error" }); return; }
    const now = new Date();
    const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const open = tasks.filter(t => t.status !== "Completadas");
    const summary = root.createDiv({ cls: "tv-summary" });
    summary.createDiv({ text: open.length + " abiertas", cls: "tv-stat" });
    summary.createDiv({ text: open.filter(t => t.due && t.due < today).length + " vencidas", cls: "tv-stat tv-overdue" });
    const board = root.createDiv({ cls: "tv-columns" });
    for (const status of STATUSES) {
      const list = tasks.filter(t => t.status === status).sort((a,b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || (a.due || "9999").localeCompare(b.due || "9999"));
      const col = board.createDiv({ cls: "tv-column" });
      const h = col.createDiv({ cls: "tv-column-head" });
      h.createEl("span", { text: status }); h.createEl("span", { text: String(list.length), cls: "tv-count" });
      if (!list.length) col.createEl("div", { text: "Sin tareas", cls: "tv-empty" });
      for (const task of list) {
        const card = col.createDiv({ cls: "tv-card tv-" + task.priority.toLowerCase() });
        const top = card.createDiv({ cls: "tv-card-top" });
        top.createEl("span", { text: task.id, cls: "tv-id" });
        top.createEl("span", { text: task.priority, cls: "tv-priority" });
        card.createDiv({ text: task.title, cls: "tv-title" });
        const meta = card.createDiv({ cls: "tv-meta" });
        meta.createEl("span", { text: task.area.name });
        if (task.due) {
          const due = meta.createEl("span", { text: "Vence " + task.due });
          if (task.due < today && task.status !== "Completadas") due.addClass("tv-overdue");
        }
      }
    }
  }
}

class NewTaskModal extends Modal {
  constructor(app: App, private plugin: TareasPlugin) { super(app); }
  onOpen(): void {
    this.contentEl.empty(); this.contentEl.createEl("h2", { text: "Nueva tarea" });
    const form = this.contentEl.createEl("form", { cls: "tv-form" });
    const title = form.createEl("input", { type: "text", placeholder: "¿Qué hay que hacer?", attr: { required: "true", maxlength: "240" } });
    title.addClass("tv-input");
    const area = form.createEl("select", { cls: "dropdown" });
    for (const a of AREAS) area.createEl("option", { text: a.name, attr: { value: a.slug } });
    const priority = form.createEl("select", { cls: "dropdown" });
    const labels: Record<Priority,string> = { P0: "P0 · Crítica", P1: "P1 · Alta", P2: "P2 · Normal", P3: "P3 · Baja" };
    for (const p of PRIORITIES) priority.createEl("option", { text: labels[p], attr: { value: p } });
    priority.value = "P2";
    const due = form.createEl("input", { type: "date", cls: "tv-input" });
    const submit = form.createEl("button", { text: "Añadir tarea", cls: "mod-cta", attr: { type: "submit" } });
    form.addEventListener("submit", ev => {
      ev.preventDefault();
      const selected = AREAS.find(a => a.slug === area.value);
      if (!selected) return;
      submit.disabled = true;
      void this.plugin.add(title.value, selected, priority.value as Priority, due.value || undefined)
        .then(() => this.close()).catch((e: unknown) => { new Notice("No se pudo añadir: " + String(e)); submit.disabled = false; });
    });
  }
  onClose(): void { this.contentEl.empty(); }
}

class TareasSettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: TareasPlugin) { super(app, plugin); }
  display(): void {
    const { containerEl } = this; containerEl.empty();
    containerEl.createEl("h2", { text: "Tareas visual" });
    containerEl.createEl("p", { text: "Ruta relativa a la bóveda de la carpeta del repositorio; por ejemplo, Tareas." });
    new Setting(containerEl).setName("Carpeta del repositorio")
      .setDesc("Debe contener areas/finanzas/tareas.md y el resto de archivos de área.")
      .addText(text => text.setPlaceholder("Tareas").setValue(this.plugin.settings.repositoryFolder)
        .onChange(async value => { this.plugin.settings.repositoryFolder = value.trim().replace(/^\/+|\/+$/g, ""); await this.plugin.saveSettings(); }));
  }
}
