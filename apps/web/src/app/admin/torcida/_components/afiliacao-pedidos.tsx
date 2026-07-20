import { db } from '@torcida/db'
import { Handshake } from 'lucide-react'
import { MotionReveal } from '@/components/motion/motion-reveal'
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
 * Fila "Solicitações de afiliação" da torcida (proposta §9). Gate na página
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
      <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <SectionHeader />
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">
          Não foi possível carregar as solicitações de afiliação. Recarregue a página.
        </p>
      </section>
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

  return (
    <MotionReveal index={4}>
      <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <SectionHeader />
        {pedidos.length === 0 ? (
          <p className="mt-3 text-sm text-[rgb(var(--foreground-muted))]">
            Nenhuma solicitação de afiliação no momento. Subsedes e PDEs que pedem cadastro pelo
            onboarding aparecem aqui para a decisão do Presidente.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {pedidos.map((pedido) => (
              <AfiliacaoPedidoCard key={pedido.id} pedido={pedido} podeDecidir={podeDecidir} />
            ))}
          </div>
        )}
      </section>
    </MotionReveal>
  )
}

function SectionHeader() {
  return (
    <div className="flex items-start gap-2">
      <Handshake className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Solicitações de afiliação
        </h2>
        <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
          Subsedes e PDEs pedindo vínculo com a torcida — o Presidente aprova e a unidade é criada.
        </p>
      </div>
    </div>
  )
}
