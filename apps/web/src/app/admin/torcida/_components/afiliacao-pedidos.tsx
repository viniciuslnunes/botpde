import { db } from '@torcida/db'
import { Handshake } from 'lucide-react'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { AfiliacaoPedidoCard, type AfiliacaoPedidoView } from './afiliacao-pedido-card'

interface AfiliacaoRow {
  id: string
  status: 'PENDENTE' | 'ATIVA' | 'RECUSADA' | 'ENCERRADA'
  criadoEm: Date
  recomendadoEm: Date | null
  recomendadoPor: { nome: string | null } | null
  unidadeSede: {
    nome: string
    tipo: 'SEDE' | 'SUBSEDE' | 'PONTO_ENCONTRO'
    cidade: string | null
    estado: string | null
  }
}

/**
 * Fila "Pedidos de afiliação" da Sede (Fase 2 — proposta §9). Gate feito na
 * página (AFFILIATION_MANAGE — a seção some para quem não tem). Recomendar é
 * de qualquer AFFILIATION_MANAGE; Aprovar/Recusar/Encerrar só owner/super-admin.
 */
export async function AfiliacaoPedidos({
  tenantId,
  podeDecidir,
}: {
  tenantId: string
  podeDecidir: boolean
}) {
  let rows: AfiliacaoRow[]
  try {
    rows = await db.afiliacaoUnidade.findMany({
      where: { sedePaiTenantId: tenantId, status: { in: ['PENDENTE', 'ATIVA'] } },
      orderBy: [{ status: 'asc' }, { criadoEm: 'desc' }],
      select: {
        id: true,
        status: true,
        criadoEm: true,
        recomendadoEm: true,
        recomendadoPor: { select: { nome: true } },
        unidadeSede: {
          select: { nome: true, tipo: true, cidade: true, estado: true },
        },
      },
    })
  } catch {
    return (
      <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <SectionHeader />
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">
          Não foi possível carregar os pedidos de afiliação. Recarregue a página.
        </p>
      </section>
    )
  }

  const pedidos: AfiliacaoPedidoView[] = rows.map((row) => ({
    id: row.id,
    status: row.status === 'ATIVA' ? 'ATIVA' : 'PENDENTE',
    unidadeNome: row.unidadeSede.nome,
    unidadeTipo: row.unidadeSede.tipo,
    cidade: row.unidadeSede.cidade,
    estado: row.unidadeSede.estado,
    criadoEm: row.criadoEm.toISOString(),
    recomendadoEm: row.recomendadoEm ? row.recomendadoEm.toISOString() : null,
    recomendadoPorNome: row.recomendadoPor?.nome ?? null,
  }))

  return (
    <MotionReveal index={4}>
      <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <SectionHeader />
        {pedidos.length === 0 ? (
          <p className="mt-3 text-sm text-[rgb(var(--foreground-muted))]">
            Nenhum pedido de afiliação no momento. Pedidos registrados pelo suporte aparecem
            aqui para recomendação do Vice e decisão do Presidente.
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
          Pedidos de afiliação
        </h2>
        <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
          Unidades com portal próprio pedindo vínculo à Sede — o Vice recomenda, o
          Presidente decide.
        </p>
      </div>
    </div>
  )
}
