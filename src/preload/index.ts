import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

function subscribe<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const handler = (_e: IpcRendererEvent, ...args: unknown[]): void => cb(...(args as T))
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api = {
  effects: {
    list: () => ipcRenderer.invoke('effects:list'),
    save: (name: string, html: string, id?: string) => ipcRenderer.invoke('effects:save', name, html, id),
    remove: (id: string) => ipcRenderer.invoke('effects:delete', id),
    importFiles: () => ipcRenderer.invoke('effects:import'),
    exportFile: (name: string, html: string) => ipcRenderer.invoke('effects:export', name, html),
    openFolder: () => ipcRenderer.invoke('effects:openFolder'),
    onChanged: (cb: () => void) => subscribe('effects:changed', cb)
  },
  stage: (slot: string, html: string) => ipcRenderer.invoke('effect:stage', slot, html),
  openrgb: {
    connect: (host: string, port: number) => ipcRenderer.invoke('openrgb:connect', host, port),
    disconnect: () => ipcRenderer.invoke('openrgb:disconnect'),
    state: () => ipcRenderer.invoke('openrgb:state'),
    rescan: () => ipcRenderer.invoke('openrgb:rescan'),
    update: (id: number, rgb: Uint8Array) => ipcRenderer.send('openrgb:update', id, rgb),
    onChanged: (cb: (snapshot: unknown) => void) => subscribe('openrgb:changed', cb)
  },
  capture: {
    screens: () => ipcRenderer.invoke('capture:screens'),
    selectScreen: (id: string | null) => ipcRenderer.invoke('capture:selectScreen', id)
  },
  ai: {
    status: () => ipcRenderer.invoke('ai:status'),
    setKey: (conn: unknown, key: string) => ipcRenderer.invoke('ai:setKey', conn, key),
    clearKey: (provider: string) => ipcRenderer.invoke('ai:clearKey', provider),
    listModels: (conn: unknown) => ipcRenderer.invoke('ai:listModels', conn),
    generate: (req: unknown) => ipcRenderer.invoke('ai:generate', req),
    cancel: (id: string) => ipcRenderer.invoke('ai:cancel', id)
  },
  app: {
    setCloseToTray: (value: boolean) => ipcRenderer.invoke('app:setCloseToTray', value),
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url)
  }
}

contextBridge.exposeInMainWorld('lumora', api)

export type LumoraApi = typeof api
