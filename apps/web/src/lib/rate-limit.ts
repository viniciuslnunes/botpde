/**
 * Rate limit em memória — protege o login por senha de força bruta contra
 * uma conta específica. Em memória porque o projeto não tem Redis/Upstash
 * ainda (ver ARCHITECTURE.md item 29): suficiente pro estágio atual (uma
 * única instância no Railway), reinicia ao dar redeploy. Trocar por um
 * store compartilhado antes de abrir cadastro público em escala.
 */

const JANELA_MS = 15 * 60 * 1000 // 15 minutos
const MAX_TENTATIVAS = 5

interface Registro {
  tentativas: number
  resetEm: number
}

const registros = new Map<string, Registro>()

/** Chave normalizada — evita contornar o limite variando maiúsculas/espaços. */
function normalizarChave(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Verifica se ainda há tentativas de login disponíveis pra este e-mail.
 * Não incrementa — use `registrarTentativaFalha` depois de uma falha real.
 */
export function excedeuLimite(email: string): boolean {
  const registro = registros.get(normalizarChave(email))
  if (!registro) return false
  if (registro.resetEm < Date.now()) {
    registros.delete(normalizarChave(email))
    return false
  }
  return registro.tentativas >= MAX_TENTATIVAS
}

/** Registra uma tentativa de login falha. Chamar só após senha incorreta. */
export function registrarTentativaFalha(email: string): void {
  const chave = normalizarChave(email)
  const agora = Date.now()
  const registro = registros.get(chave)

  if (!registro || registro.resetEm < agora) {
    registros.set(chave, { tentativas: 1, resetEm: agora + JANELA_MS })
    return
  }

  registro.tentativas++
}
