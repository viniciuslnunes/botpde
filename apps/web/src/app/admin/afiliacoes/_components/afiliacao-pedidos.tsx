import { db } from '@torcida/db'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { AfiliacaoPedidoCard, type SolicitacaoView } from './afiliacao-pedido-card'

interface SolicitacaoRow {
  id: string
  status: 'PENDENTE' | 'APROVADA' | 'RECUSADA'
  nome: string
  tipo: 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'
  cidade: string
  estado: string
  endereco: string | null
  contatoNome: string
  contatoEmail: string | null
  contatoTelefone: string | null
  vinculo: string | null
  provasUrls: string[]
  motivo: string | null
  criadoEm: Date
}

/**
 * Fila de solicitações de afiliação (proposta §9). Gate na página
 * (AFFILIATION_MANAGE). Decidir (aprovar/recusar/editar) só owner/super-admin
 * (`podeDecidir`). Mostra pendentes + as recém-aprovadas.
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
      where: { tenantId, status: { in: ['PENDENTE', 'APROVADA'] } },
      orderBy: [{ status: 'asc' }, { criadoEm: 'desc' }],
      select: {
        id: true,
        status: true,
        nome: true,
        tipo: true,
        cidade: true,
        estado: true,
        endereco: true,
        contatoNome: true,
        contatoEmail: true,
        contatoTelefone: true,
        vinculo: true,
        provasUrls: true,
        motivo: true,
        criadoEm: true,
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
    .map((r) => ({
      id: r.id,
      status: r.status,
      nome: r.nome,
      tipo: r.tipo,
      cidade: r.cidade,
      estado: r.estado,
      endereco: r.endereco,
      contatoNome: r.contatoNome,
      contatoEmail: r.contatoEmail,
      contatoTelefone: r.contatoTelefone,
      vinculo: r.vinculo,
      provasUrls: r.provasUrls,
      motivo: r.motivo,
      criadoEm: r.criadoEm.toISOString(),
    }))

  if (pedidos.length === 0) {
    return (
      <MotionReveal>
        <MotionEmptyState
          title="Nenhuma solicitação no momento"
          description="Subsedes e PDEs que pedem cadastro pelo onboarding aparecem aqui para a decisão do Presidente."
        />
      </MotionReveal>
    )
  }

  return (
    <MotionReveal>
      <div className="grid gap-3 lg:grid-cols-2">
        {pedidos.map((pedido) => (
          <AfiliacaoPedidoCard key={pedido.id} pedido={pedido} podeDecidir={podeDecidir} />
        ))}
      </div>
    </MotionReveal>
  )
}
