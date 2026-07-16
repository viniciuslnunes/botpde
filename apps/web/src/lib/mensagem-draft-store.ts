/** Rascunhos de texto por conversa (session em memória do client). */

const drafts = new Map<string, string>()

export function getMensagemDraft(conversaId: string): string {
  return drafts.get(conversaId) ?? ''
}

export function setMensagemDraft(conversaId: string, texto: string): void {
  const trimmed = texto.trim()
  if (trimmed) drafts.set(conversaId, texto)
  else drafts.delete(conversaId)
}

export function clearMensagemDraft(conversaId: string): void {
  drafts.delete(conversaId)
}
