'use server'

import { auth } from '@/lib/auth'
import { gravarEscopoComunidade } from '@/lib/comunidade-escopo-cookie'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'

function ehEscopo(valor: unknown): valor is EscopoComunidade {
  return valor === 'nacional' || valor === 'torcida' || valor === 'unidade'
}

/**
 * Persiste a aba-escudo aberta na Comunidade para que a topbar mantenha o
 * canal ao sair para Agenda/Sedes/Loja (essas rotas não têm `?escopo=`).
 *
 * Preferência de navegação, não autorização: nada aqui concede acesso — o
 * valor é sempre reavaliado por `resolverEscopoComunidadePorModo` contra os
 * escopos que a pessoa de fato tem. Por isso não há `assertPermission` nem
 * `AuditLog` (não é mutação administrativa).
 */
export async function registrarEscopoComunidadeAction(escopo: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) return
  if (!ehEscopo(escopo)) return
  await gravarEscopoComunidade(escopo)
}
