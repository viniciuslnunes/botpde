import { db } from '@torcida/db'
import { herdarDadosSedeNaSolicitacao } from '@/lib/afiliacao-unidade'
import { AfiliacaoPedidosClient } from './afiliacao-pedidos-client'
import type { SolicitacaoView } from './afiliacao-pedido-card'

interface SedeLiveRow {
  nome: string
  tipo: string
  cidade: string | null
  estado: string | null
  endereco: string | null
  cep: string | null
  lat: number | null
  lng: number | null
  fotoUrl: string | null
}

interface SolicitacaoRow {
  id: string
  status: 'PENDENTE' | 'APROVADA' | 'RECUSADA'
  nome: string
  tipo: 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'
  cidade: string
  estado: string
  endereco: string | null
  regiao: string | null
  cep: string | null
  lat: number | null
  lng: number | null
  fotoUrl: string | null
  contatoNome: string | null
  contatoEmail: string | null
  contatoTelefone: string | null
  vinculo: string | null
  observacao: string | null
  provasUrls: string[]
  motivo: string | null
  criadoEm: Date
  solicitadoPor: {
    nome: string | null
    email: string | null
    avatarUrl: string | null
  } | null
  sede: SedeLiveRow | null
}

/**
 * Fila de solicitações de afiliação (proposta §9). Gate na página
 * (AFFILIATION_MANAGE). Decidir (aprovar/recusar/editar) só owner/super-admin
 * (`podeDecidir`). Inclui pendentes, aprovadas e recusadas para revisão.
 */
export async function AfiliacaoPedidos({
  tenantId,
  podeDecidir,
}: {
  tenantId: string
  podeDecidir: boolean
}) {
  let rows: SolicitacaoRow[]
  try {
    rows = await db.solicitacaoUnidade.findMany({
      where: {
        tenantId,
        status: { in: ['PENDENTE', 'APROVADA', 'RECUSADA'] },
      },
      orderBy: [{ status: 'asc' }, { criadoEm: 'desc' }],
      take: 100,
      select: {
        id: true,
        status: true,
        nome: true,
        tipo: true,
        cidade: true,
        estado: true,
        endereco: true,
        regiao: true,
        cep: true,
        lat: true,
        lng: true,
        fotoUrl: true,
        contatoNome: true,
        contatoEmail: true,
        contatoTelefone: true,
        vinculo: true,
        observacao: true,
        provasUrls: true,
        motivo: true,
        criadoEm: true,
        solicitadoPor: {
          select: { nome: true, email: true, avatarUrl: true },
        },
        // APROVADA: exibir dados vivos da Sede (edições em /admin/sedes).
        sede: {
          select: {
            nome: true,
            tipo: true,
            cidade: true,
            estado: true,
            endereco: true,
            cep: true,
            lat: true,
            lng: true,
            fotoUrl: true,
          },
        },
      },
    })
  } catch {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        Não foi possível carregar as solicitações de afiliação. Recarregue a página.
      </p>
    )
  }

  const pedidos: SolicitacaoView[] = rows
    .filter((r): r is SolicitacaoRow & { tipo: 'SUBSEDE' | 'PONTO_ENCONTRO' } => r.tipo !== 'SEDE')
    .map((r) => {
      const locais = herdarDadosSedeNaSolicitacao(
        {
          nome: r.nome,
          tipo: r.tipo,
          cidade: r.cidade,
          estado: r.estado,
          endereco: r.endereco,
          cep: r.cep,
          lat: r.lat,
          lng: r.lng,
          fotoUrl: r.fotoUrl,
        },
        r.status,
        r.sede,
      )
      return {
        id: r.id,
        status: r.status,
        nome: locais.nome,
        tipo: locais.tipo,
        cidade: locais.cidade,
        estado: locais.estado,
        endereco: locais.endereco,
        regiao: r.regiao,
        cep: locais.cep,
        lat: locais.lat,
        lng: locais.lng,
        fotoUrl: locais.fotoUrl,
        contatoNome: r.contatoNome,
        contatoEmail: r.contatoEmail,
        contatoTelefone: r.contatoTelefone,
        vinculo: r.vinculo,
        observacao: r.observacao,
        provasUrls: r.provasUrls,
        motivo: r.motivo,
        criadoEm: r.criadoEm.toISOString(),
        solicitadoPor: r.solicitadoPor
          ? {
              nome: r.solicitadoPor.nome,
              email: r.solicitadoPor.email,
              image: r.solicitadoPor.avatarUrl,
            }
          : null,
      }
    })

  return <AfiliacaoPedidosClient pedidos={pedidos} podeDecidir={podeDecidir} />
}
