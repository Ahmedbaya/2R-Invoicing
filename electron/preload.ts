import { contextBridge, ipcRenderer } from 'electron'
import type { Api, Result } from '../shared/types'

const call = async <T>(channel: string, payload?: unknown): Promise<T> => {
  const res = (await ipcRenderer.invoke(channel, payload)) as Result<T>
  if (!res.ok) throw new Error(res.error)
  return res.data
}

// Narrow, explicit surface: the renderer cannot invoke arbitrary channels.
const api: Api = {
  config: { status: () => call('config:status'), save: (url) => call('config:save', url) },
  db: { ping: () => call('db:ping') },
  clients: {
    list: () => call('clients:list'),
    save: (c) => call('clients:save', c),
    remove: (id) => call('clients:delete', id),
  },
  oldImport: {
    choose: (r) => call('oldImport:choose', r),
    preview: (r) => call('oldImport:preview', r),
    apply: (r) => call('oldImport:apply', r),
  },
  backup: {
    list: () => call('backup:list'),
    now: () => call('backup:now'),
    saveAs: () => call('backup:saveAs'),
    openFolder: () => call('backup:openFolder'),
  },
  dashboard: { stats: () => call('dashboard:stats') },
  categories: {
    list: () => call('categories:list'),
    save: (c) => call('categories:save', c),
    remove: (id) => call('categories:delete', id),
  },
  products: {
    importPreview: () => call('products:importPreview'),
    importApply: () => call('products:importApply'),
    list: () => call('products:list'),
    save: (p) => call('products:save', p),
    remove: (id) => call('products:delete', id),
  },
  invoices: {
    list: () => call('invoices:list'),
    get: (id) => call('invoices:get', id),
    saveDraft: (d) => call('invoices:saveDraft', d),
    finalize: (a) => call('invoices:finalize', a),
    duplicate: (a) => call('invoices:duplicate', a),
    lastNumber: (a) => call('invoices:lastNumber', a),
    unlock: (a) => call('invoices:unlock', a),
    remove: (id) => call('invoices:delete', id),
    exportPdf: (id) => call('invoices:exportPdf', id),
    exportExcel: (id) => call('invoices:exportExcel', id),
    exportListExcel: (ids) => call('invoices:exportListExcel', ids),
  },
}

contextBridge.exposeInMainWorld('api', api)