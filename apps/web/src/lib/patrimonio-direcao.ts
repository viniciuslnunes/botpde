import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { listarEmprestimosPatrimonio, resumirPatrimonio } from '@/lib/patrimonio'
import {
  ADMIN_DIRECAO_TTL,
  tagAdminDirecao,
} from '@/lib/admin-direcao-cache'
import { slaLabel, type AdminInboxItem } from '@/lib/admin-inbox'

const DIA_MS = 24 * 60 * 60 * 1000
const ATRASO_DIAS = 7

export type PatrimonioOpsResumo = {
  emUso: number
  manutencao: number
  atrasados: number
  pendencias: AdminInboxItem[]
}

async function fetchDirecaoPatrimonio(tenantId: string): Promise<PatrimonioOpsResumo> {
  const agora = new Date()
  const limiteAtraso = new Date(agora.getTime() - ATRASO_DIAS * DIA_MS)

  const [resumo, emprestimos]: [
    Awaited<ReturnType<typeof resumirPatrimonio>>,
    Awaited<ReturnType<typeof listarEmprestimosPatrimonio>>,
  ] = await Promise.all([
    resumirPatrimonio(tenantId),
    listarEmprestimosPatrimonio(tenantId, { status: 'ABERTO', limite: 40 }),
  ])

  const atrasados = emprestimos.filter((e) => e.abertoEm < limiteAtraso)
  const pendencias: AdminInboxItem[] = []

  for (const e of atrasados.slice(0, 6)) {
    const dias = Math.floor((agora.getTime() - e.abertoEm.getTime()) / DIA_MS)
    const sla = slaLabel(e.abertoEm, { agora, modo: 'idade' })
    pendencias.push({
      id: `atr-${e.id}`,
      titulo: `${e.item.nome} · ${dias}d em uso`,
      detalhe: `Com ${e.user.nome ?? 'membro'} — peça devolução ou audite dano.`,
      href: '/admin/patrimonio',
      tom: dias >= 14 ? 'danger' : 'warning',
      sla,
    })
  }

  if (resumo.manutencao > 0) {
    pendencias.push({
      id: 'manutencao',
      titulo: `${resumo.manutencao} item${resumo.manutencao === 1 ? '' : 's'} em manutenção`,
      detalhe: 'Filtre o inventário por status MANUTENCAO.',
      href: '/admin/patrimonio?status=MANUTENCAO',
      tom: 'warning',
    })
  }

  if (emprestimos.length > 0 && atrasados.length === 0) {
    pendencias.push({
      id: 'em-uso',
      titulo: `${emprestimos.length} empréstimo${emprestimos.length === 1 ? '' : 's'} aberto${emprestimos.length === 1 ? '' : 's'}`,
      detalhe: 'Confira fotos de saída na seção Em uso agora.',
      href: '/admin/patrimonio#em-uso',
      tom: 'default',
    })
  }

  return {
    emUso: resumo.emUso,
    manutencao: resumo.manutencao,
    atrasados: atrasados.length,
    pendencias: pendencias.slice(0, 10),
  }
}

/**
 * Inbox de anomalias do Patrimônio — empréstimos longos e manutenção.
 */
export const carregarDirecaoPatrimonio = cache(async function carregarDirecaoPatrimonio(
  tenantId: string,
): Promise<PatrimonioOpsResumo> {
  return unstable_cache(
    () => fetchDirecaoPatrimonio(tenantId),
    ['admin-direcao-patrimonio', tenantId],
    { revalidate: ADMIN_DIRECAO_TTL, tags: [tagAdminDirecao(tenantId)] },
  )()
})
