export function getIpcRenderer() {
  if (typeof window === 'undefined') return null;
  try {
    // Use eval to bypass webpack's require interception.
    // In Electron renderer with nodeIntegration, the real Node.js require
    // can resolve 'electron', but webpack's module system may not.
    // eslint-disable-next-line no-eval
    const { ipcRenderer } = eval('require("electron")') as typeof import('electron');
    return ipcRenderer;
  } catch {
    return null;
  }
}
