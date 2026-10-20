// Uses the native dialog when available, and falls back to the browser dialog otherwise.
export async function confirmAction(message: string): Promise<boolean> {
  const api = window.api as unknown as { confirm?: (m: string) => Promise<boolean> }
  if (typeof api.confirm === 'function') return api.confirm(message)
  return window.confirm(message)
}