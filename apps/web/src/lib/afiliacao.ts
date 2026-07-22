import 'server-only'

import type { Prisma } from '@torcida/db'

/**
 * Materialização de uma SOLICITAÇÃO de unidade aprovada — Fase 2 da governança
 * hierárquica (proposta §9). Cria a `Sede` (SUBSEDE/PDE) sob a torcida-alvo
 * (vínculo formal) e provisiona o canal oficial da unidade. Roda dentro da
 * transação do chamador (flip de status + criação atômicos).
 *
 * NÃO cria tenant nem transfere owner — dar portal com acesso admin à liderança
 * local é um passo à parte (transferência de propriedade / promoção A→B).
 */

export interface UnidadeCriada {
  sedeId: string
  canalConversaId: string
}

export interface SolicitacaoParaMaterializar {
  tenantId: string
  nome: string
  tipo: 'SUBSEDE' | 'PONTO_ENCONTRO'
  cidade: string
  estado: string
  endereco: string | null
}

export async function criarUnidadeDaSolicitacao(
  tx: Prisma.TransactionClient,
  solicitacao: SolicitacaoParaMaterializar,
  atorId: string,
): Promise<UnidadeCriada> {
  // Ancora a unidade na Sede raiz (tipo SEDE) da torcida, quando existir.
  const raiz: { id: string } | null = await tx.sede.findFirst({
    where: { tenantId: solicitacao.tenantId, tipo: 'SEDE' },
    select: { id: true },
  })

  const sede: { id: string } = await tx.sede.create({
    data: {
      tenantId: solicitacao.tenantId,
      nome: solicitacao.nome,
      tipo: solicitacao.tipo,
      cidade: solicitacao.cidade,
      estado: solicitacao.estado,
      endereco: solicitacao.endereco,
      sedeId: raiz?.id ?? null,
      ativa: true,
    },
    select: { id: true },
  })

  // Canal oficial da unidade — Conversa no tenant da torcida (leitura por
  // participação). Espelha Departamento.canalConversa; ponteiro em Sede.canalConversaId.
  const canal: { id: string } = await tx.conversa.create({
    data: {
      tipo: 'CANAL',
      tenantId: solicitacao.tenantId,
      nome: solicitacao.nome,
      descricao: 'Canal oficial da unidade',
      institucional: true,
      canalOficial: true,
      visibilidadeCanal: 'HIERARQUIA',
      somenteAdminPublica: false,
      publica: true,
      criadoPorId: atorId,
      membros: { create: { userId: atorId, papel: 'ADMIN' } },
    },
    select: { id: true },
  })

  await tx.sede.update({
    where: { id: sede.id },
    data: { canalConversaId: canal.id },
  })

  return { sedeId: sede.id, canalConversaId: canal.id }
}
