import { Suspense } from 'react'
import { db } from '@torcida/db'
import { contextoAdmin } from '@/lib/admin-modulos'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MessagesSquare, Megaphone } from 'lucide-react'
import { PERMISSIONS, hasPermission, primeiraTabPermitida } from '@torcida/types'
import { MotionReveal } from '@/components/motion/motion-reveal'
import {
  resumirEngajamento,
  resumirLeituraComunicados,
  type EngajamentoResumo,
  type LeituraComunicadosResumo,
} from '@/lib/comunidade-insights'
import { PERIODO_LABEL_CURTO, PERIODO_PADRAO } from '@/lib/admin-insights'
import { InsightSection, KpiGrid, StatCard } from '@/components/admin/ui'
import { MiniBarChart, Sparkline } from '@/components/admin/charts'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Comunidade — Admin' }

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(data)
}

async function ComunidadeInsights({
  tenantId,
  mostrarEngajamento,
  mostrarLeituras,
}: {
  tenantId: string
  mostrarEngajamento: boolean
  mostrarLeituras: boolean
}) {
  const [engajamento, leitura]: [EngajamentoResumo | null, LeituraComunicadosResumo | null] =
    await Promise.all([
      mostrarEngajamento ? resumirEngajamento(tenantId, PERIODO_PADRAO) : Promise.resolve(null),
      mostrarLeituras ? resumirLeituraComunicados(tenantId) : Promise.resolve(null),
    ])

  const totalInteracoes = engajamento
    ? engajamento.atual.posts + engajamento.atual.reacoes + engajamento.atual.comentarios
    : 0
  const temLeituras = (leitura?.comunicados.length ?? 0) > 0
  if (totalInteracoes === 0 && !temLeituras) return null

  return (
    <InsightSection
      title={`Engajamento (${PERIODO_LABEL_CURTO[PERIODO_PADRAO]})`}
      description="Atividade do mural e alcance dos comunicados oficiais."
    >
      {engajamento ? (
        <>
          <StatCard
            label="Posts"
            value={engajamento.atual.posts}
            delta={{ atual: engajamento.atual.posts, anterior: engajamento.anterior.posts }}
          />
          <StatCard
            label="Reações + comentários"
            value={engajamento.atual.reacoes + engajamento.atual.comentarios}
            delta={{
              atual: engajamento.atual.reacoes + engajamento.atual.comentarios,
              anterior: engajamento.anterior.reacoes + engajamento.anterior.comentarios,
            }}
          />
          <StatCard
            label="Denúncias abertas"
            value={engajamento.denunciasAbertas}
            tone={engajamento.denunciasAbertas > 0 ? 'warning' : 'default'}
            href="/admin/comunidade/moderacao"
          />
          {totalInteracoes > 0 ? (
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:col-span-2 sm:p-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Interações por dia
              </h3>
              <Sparkline
                data={engajamento.interacoesPorDia.map((p) => p.valor)}
                width={420}
                height={56}
                className="h-14 w-full"
              />
            </div>
          ) : null}
        </>
      ) : null}

      {leitura && temLeituras ? (
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Leituras dos últimos comunicados
            {leitura.taxaMedia !== null
              ? ` · média ${(leitura.taxaMedia * 100).toLocaleString('pt-BR', {
                  maximumFractionDigits: 0,
                })}%`
              : ''}
          </h3>
          <MiniBarChart
            data={leitura.comunicados.map((c) => ({ rotulo: c.titulo, valor: c.leituras }))}
          />
        </div>
      ) : null}
    </InsightSection>
  )
}

export default async function AdminComunidadePage() {
  // Mesmo tenant e mesmas permissões do shell — ver `contextoAdmin`.
  const { tenant, permissoes: effective } = await contextoAdmin()

  const podePublicarComunicado = hasPermission(effective, PERMISSIONS.ANNOUNCEMENTS_PUBLISH)
  const podeGerenciarPosts = hasPermission(effective, PERMISSIONS.COMMUNITY_MANAGE)

  // Quem só modera ou só cura notícias não tem visão geral — entra pela própria
  // etapa em vez de ser expulso da área.
  if (!podePublicarComunicado && !podeGerenciarPosts) {
    redirect(primeiraTabPermitida('comunidade', effective) ?? '/admin')
  }

  const [comunicadosCount, ultimoComunicado, postsCount, ultimoPost] = await Promise.all([
    podePublicarComunicado ? db.announcement.count({ where: { tenantId: tenant.id } }) : Promise.resolve(0),
    podePublicarComunicado
      ? db.announcement.findFirst({
          where: { tenantId: tenant.id },
          orderBy: { publicadoEm: 'desc' },
          select: { titulo: true, publicadoEm: true },
        })
      : Promise.resolve(null),
    podeGerenciarPosts ? db.post.count({ where: { tenantId: tenant.id } }) : Promise.resolve(0),
    podeGerenciarPosts
      ? db.post.findFirst({
          where: { tenantId: tenant.id },
          orderBy: { criadoEm: 'desc' },
          select: { titulo: true, conteudo: true, criadoEm: true },
        })
      : Promise.resolve(null),
  ])

  return (
    <div className="space-y-6">
      {/* Navegação é das tabs: aqui só o pulso do módulo. */}
      <KpiGrid>
        {podePublicarComunicado && (
          <StatCard
            label="Comunicados publicados"
            value={comunicadosCount}
            icon={<Megaphone className="h-5 w-5" />}
            badge={
              ultimoComunicado
                ? `Último: ${ultimoComunicado.titulo} · ${formatarData(ultimoComunicado.publicadoEm)}`
                : 'Nenhum comunicado publicado ainda.'
            }
            badgeTone="default"
          />
        )}
        {podeGerenciarPosts && (
          <StatCard
            label="Posts no mural"
            value={postsCount}
            icon={<MessagesSquare className="h-5 w-5" />}
            badge={
              ultimoPost
                ? `Último: ${ultimoPost.titulo || ultimoPost.conteudo.slice(0, 60)} · ${formatarData(ultimoPost.criadoEm)}`
                : 'Nenhum post publicado ainda.'
            }
            badgeTone="default"
          />
        )}
      </KpiGrid>

      <Suspense fallback={null}>
        <ComunidadeInsights
          tenantId={tenant.id}
          mostrarEngajamento={podeGerenciarPosts}
          mostrarLeituras={podePublicarComunicado}
        />
      </Suspense>

      {podeGerenciarPosts && (
        <MotionReveal index={3}>
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            Canais oficiais e comunidades temáticas ficam em{' '}
            <Link
              href="/portal/comunidade/canais"
              className="font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
            >
              Portal → Comunidade → Canais
            </Link>
            .
          </p>
        </MotionReveal>
      )}
    </div>
  )
}
