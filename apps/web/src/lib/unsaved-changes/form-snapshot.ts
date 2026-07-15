/** Serializa campos de texto de um form (ignora File). */
export function serializeFormValues(form: HTMLFormElement): Map<string, string[]> {
  const fd = new FormData(form)
  const map = new Map<string, string[]>()
  for (const [key, value] of fd.entries()) {
    if (typeof value !== 'string') continue
    const arr = map.get(key) ?? []
    arr.push(value)
    map.set(key, arr)
  }
  return map
}

function mapsEqual(a: Map<string, string[]>, b: Map<string, string[]>): boolean {
  if (a.size !== b.size) return false
  for (const [key, values] of a) {
    const other = b.get(key)
    if (!other || other.length !== values.length) return false
    for (let i = 0; i < values.length; i++) {
      if (values[i] !== other[i]) return false
    }
  }
  return true
}

function labelForControl(
  el: Element,
  labels?: Record<string, string>,
): string | null {
  const named = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  const name = named.name
  if (!name) return null

  const dataLabel = el.getAttribute('data-unsaved-label')
  if (dataLabel) return dataLabel

  if (labels?.[name]) return labels[name]

  if (named.id) {
    const lab = document.querySelector(`label[for="${CSS.escape(named.id)}"]`)
    if (lab?.textContent?.trim()) return lab.textContent.trim()
  }

  const wrapping = el.closest('label')
  if (wrapping?.childNodes) {
    for (const node of wrapping.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent?.trim()
        if (t) return t
      }
    }
  }

  return humanizeName(name)
}

function humanizeName(name: string): string {
  return name
    .replace(/\[\]$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
}

function hasFileSelection(form: HTMLFormElement): string[] {
  const labels: string[] = []
  const files = form.querySelectorAll<HTMLInputElement>('input[type="file"]')
  for (const input of files) {
    if (input.files && input.files.length > 0) {
      const label =
        input.getAttribute('data-unsaved-label') ??
        (input.name ? humanizeName(input.name) : 'Arquivo')
      labels.push(label)
    }
  }
  return labels
}

/**
 * Diff entre snapshot inicial e estado atual do form.
 * Retorna labels únicos dos campos que mudaram.
 */
export function diffFormChanges(
  form: HTMLFormElement,
  baseline: Map<string, string[]>,
  labels?: Record<string, string>,
): string[] {
  const current = serializeFormValues(form)
  const changedNames = new Set<string>()

  if (!mapsEqual(baseline, current)) {
    const allKeys = new Set([...baseline.keys(), ...current.keys()])
    for (const key of allKeys) {
      const a = baseline.get(key) ?? []
      const b = current.get(key) ?? []
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
        changedNames.add(key)
      }
    }
  }

  const result: string[] = []
  const seen = new Set<string>()

  for (const name of changedNames) {
    const el =
      form.querySelector(`[name="${CSS.escape(name)}"]`) ??
      form.querySelector(`[name="${CSS.escape(name)}[]"]`)
    const label = el ? labelForControl(el, labels) : humanizeName(name)
    if (label && !seen.has(label)) {
      seen.add(label)
      result.push(label)
    }
  }

  for (const fileLabel of hasFileSelection(form)) {
    if (!seen.has(fileLabel)) {
      seen.add(fileLabel)
      result.push(fileLabel)
    }
  }

  return result
}
