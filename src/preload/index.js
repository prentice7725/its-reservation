import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  tasks: {
    getAll: () => ipcRenderer.invoke('task:getAll'),
    save: (task) => ipcRenderer.invoke('task:save', task),
    delete: (id) => ipcRenderer.invoke('task:delete', id),
  },
  execution: {
    start: (taskId) => ipcRenderer.invoke('execution:start', taskId),
    startAll: () => ipcRenderer.invoke('execution:startAll'),
    stop: (taskId) => ipcRenderer.invoke('execution:stop', taskId),
    onLog: (callback) => {
      const subscription = (event, log) => callback(log);
      ipcRenderer.on('execution:log', subscription);
      return () => ipcRenderer.removeListener('execution:log', subscription);
    },
    onStatusChange: (callback) => {
      const subscription = (event, status) => callback(status);
      ipcRenderer.on('execution:status', subscription);
      return () => ipcRenderer.removeListener('execution:status', subscription);
    },
  },
  history: {
    getAll: () => ipcRenderer.invoke('history:getAll'),
  },
});
