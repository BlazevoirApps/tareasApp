"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tareasApp", {
  loadTasks: () => ipcRenderer.invoke("tasks:load"),
  chooseRepository: () => ipcRenderer.invoke("repository:choose"),
  createTask: input => ipcRenderer.invoke("tasks:create", input),
  updateTask: input => ipcRenderer.invoke("tasks:update", input)
});
