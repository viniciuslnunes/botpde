/** Ids determinísticos para ligar cada tab ao seu `role="tabpanel"` via `aria-controls`. */
export function adminTabIds(paramKey: string, id: string): { tabId: string; panelId: string } {
  return { tabId: `${paramKey}-${id}-tab`, panelId: `${paramKey}-${id}-panel` }
}
