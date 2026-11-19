"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tareasApp", {
  loadTasks: () => ipcRenderer.invoke("tasks:load"),
  chooseRepository: () => ipcRenderer.invoke("repository:choose"),
  pullTaskChanges: () => ipcRenderer.invoke("repository:pull-tasks"),
  pushTaskChanges: () => ipcRenderer.invoke("repository:push-tasks"),
  createTask: input => ipcRenderer.invoke("tasks:create", input),
  updateTask: input => ipcRenderer.invoke("tasks:update", input)
});
