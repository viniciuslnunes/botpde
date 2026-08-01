import { redirect } from 'next/navigation'
import { db } from '@torcida/db'
import { formatNomeAfiliacao, PERMISSIONS, primeiraTabPermitida } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { isExpectedError } from '@/lib/expected-error'
import { Flag, IdCard, Link2, Lock, Radio, Settings } from 'lucide-react'
import { ConviteForm } from './_components/convite-form'
import { getAncestorTenantIds } from '@/lib/hierarquia'
import { getEstadoCanalRestrito } from '@/lib/canal-restrito'
import {
  CanalRestritoForm,
  type SolicitacaoReativacaoView,
} from './_components/canal-restrito-form'
import { PerfilTenantForm, AfiliacaoForm, DocumentosCadastroForm, CanalOficialForm } from '@/components/admin/config-forms'
import { getOrCreateCanalOficial } from '@/lib/canais'
import { permissoesEfetivasNoAdmin } from '@/lib/admin-modulos'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { ConfigSectionCard } from './_components/config-section-card'
import { getConfigContexto } from './_lib/contexto'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Configurações — Admin' }

const ICONE = 'h-4 w-4'

interface AfiliacaoOption {
  id: string
  nome: string
}

type CanalOficialConfig = {
  nome: string | null
  descricao: string | null
  avatarUrl: string | null
  visibilidadeCanal: string
  somenteAdminPublica: boolean
  publica: boolean
}

const PLANO_LABEL: Record<string, { nome: string; descricao: string; classe: string }> = {
  FREE: {
    nome: 'Gratuito',
    descricao: 'Recursos limitados — faça upgrade para desbloquear tudo',
    classe: 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
  },
  BASIC: {
    nome: 'Básico',
    descricao: 'Acesso a recursos essenciais',
    classe: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  },
  PREMIUM: {
    nome: 'Premium',
    descricao: 'Acesso completo a todos os recursos',
    classe: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
  },
}

/**
 * Seções que saíram de `/admin/configuracoes?tab=` para rota própria. As que
 * ficaram (perfil, afiliação, cadastro, canal oficial) empilham nesta página,
 * então o param simplesmente é ignorado para elas.
 */
const ROTA_POR_TAB_LEGADA: Record<string, string> = {
  discord: '/admin/configuracoes/integracoes',
  balanco: '/admin/configuracoes/transparencia',
  hierarquia: '/admin/configuracoes/transparencia',
}

export default async function ConfiguracoesGeralPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const destinoLegado = tab ? ROTA_POR_TAB_LEGADA[tab] : undefined
  if (destinoLegado) redirect(destinoLegado)

  // Menu de Plataforma aponta para esta raiz; quem só tem Acessos/Auditoria
  // cai na própria etapa (mesmo padrão de Loja/Comunidade).
  try {
    await assertPermission(PERMISSIONS.SETTINGS_MANAGE)
  } catch {
    const permissoes = await permissoesEfetivasNoAdmin()
    redirect(primeiraTabPermitida('plataforma', permissoes) ?? '/admin')
  }

  const { userId, tenant, isOwner } = await getConfigContexto()

  const afiliacoes: AfiliacaoOption[] = await db.afiliacao
    .findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true } })
    .then((rows: AfiliacaoOption[]) =>
      rows.map((a: AfiliacaoOption) => ({ id: a.id, nome: formatNomeAfiliacao(a.nome) })),
    )

  // Canal oficial provisiona sob demanda: só resolve para owner, e uma falha
  // aqui não pode derrubar as outras seções da página.
  let canalOficial: CanalOficialConfig | null = null
  let canalOficialError: string | null = null
  if (isOwner) {
    try {
      const { id: canalOficialId } = await getOrCreateCanalOficial(tenant.id, userId)
      canalOficial = await db.conversa.findUnique({
        where: { id: canalOficialId },
        select: {
          nome: true,
          descricao: true,
          avatarUrl: true,
          visibilidadeCanal: true,
          somenteAdminPublica: true,
          publica: true,
        },
      })
      if (!canalOficial) {
        canalOficialError =
          'Canal oficial não encontrado após provisionamento. Tente recarregar ou contate o suporte.'
      }
    } catch (err: unknown) {
      canalOficialError =
        err instanceof Error && isExpectedError(err)
          ? err.message
          : 'Não foi possível carregar o canal oficial. Tente recarregar a página.'
    }
  }

  const plano = PLANO_LABEL[tenant.plano] ?? PLANO_LABEL.FREE!

  // R5 — só faz sentido restringir o canal de uma UNIDADE: a Sede raiz não tem
  // de quem se isolar, e fechá-la esconderia a torcida inteira.
  const conviteRow: { conviteSlug: string | null; conviteAtivo: boolean } | null =
    await db.tenant.findUnique({
      where: { id: tenant.id },
      select: { conviteSlug: true, conviteAtivo: true },
    })
  const convite = {
    slug: conviteRow?.conviteSlug ?? null,
    ativo: conviteRow?.conviteAtivo ?? false,
  }

  const ancestrais = await getAncestorTenantIds(tenant.id)
  const ehUnidadeDaTorcida = ancestrais.length > 0
  const estadoCanal = await getEstadoCanalRestrito(tenant.id)
  const pendente = estadoCanal.solicitacaoPendente
  const solicitacaoView: SolicitacaoReativacaoView | null = pendente
    ? {
        solicitadoPorNome: pendente.solicitadoPorNome,
        mensagem: pendente.mensagem,
        prazoIso: pendente.prazoEm.toISOString(),
        diasRestantes: Math.floor(pendente.restanteMs / (24 * 60 * 60 * 1000)),
      }
    : null

  return (
    <div className="space-y-6">
      <ConfigSectionCard
        icon={<Settings className={ICONE} />}
        title="Perfil da torcida"
        description="Nome da plataforma. Cores e visual ficam em Identidade."
        ownerOnly
        blocked={!isOwner}
        index={0}
      >
        <PerfilTenantForm nome={tenant.nome} />
      </ConfigSectionCard>

      <ConfigSectionCard
        icon={<Flag className={ICONE} />}
        title="Afiliação"
        description="Defina qual time a torcida apoia para contexto global de notícias"
        ownerOnly
        blocked={!isOwner}
        index={1}
      >
        <AfiliacaoForm afiliacaoId={tenant.afiliacaoId ?? null} afiliacoes={afiliacoes} />
      </ConfigSectionCard>

      <ConfigSectionCard
        icon={<IdCard className={ICONE} />}
        title="Cadastro de sócios"
        description="Obrigatoriedade de documentos (RG e residência) no onboarding"
        ownerOnly
        blocked={!isOwner}
        index={2}
      >
        <DocumentosCadastroForm
          key={String(tenant.exigirDocumentosCadastro)}
          exigir={tenant.exigirDocumentosCadastro}
        />
      </ConfigSectionCard>

      <ConfigSectionCard
        id="canal-oficial"
        icon={<Radio className={ICONE} />}
        title="Canal oficial"
        description="Nome, foto, visibilidade e regras do mural desta unidade na Comunidade"
        ownerOnly
        blocked={!isOwner}
        index={3}
      >
        {canalOficialError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{canalOficialError}</p>
        ) : canalOficial ? (
          <CanalOficialForm
            nome={canalOficial.nome ?? tenant.nome}
            descricao={canalOficial.descricao}
            avatarUrl={canalOficial.avatarUrl}
            visibilidadeCanal={canalOficial.visibilidadeCanal}
            somenteAdminPublica={canalOficial.somenteAdminPublica}
            publica={canalOficial.publica}
          />
        ) : null}
      </ConfigSectionCard>

      <ConfigSectionCard
        id="convite"
        icon={<Link2 className={ICONE} />}
        title="Convite"
        description="Link que adianta as etapas do onboarding e leva direto ao vínculo"
        index={4}
      >
        <ConviteForm
          key={`${convite.slug ?? 'sem'}-${String(convite.ativo)}`}
          slug={convite.slug}
          ativo={convite.ativo}
          canalRestrito={estadoCanal.restrito}
        />
      </ConfigSectionCard>

      {ehUnidadeDaTorcida ? (
        <ConfigSectionCard
          id="canal-restrito"
          icon={<Lock className={ICONE} />}
          title="Canal restrito"
          description="Isolar esta unidade das interações externas, mantendo a operação interna"
          ownerOnly
          blocked={!isOwner}
          index={5}
        >
          <CanalRestritoForm
            key={String(estadoCanal.restrito)}
            restrito={estadoCanal.restrito}
            solicitacao={solicitacaoView}
            ultimaRecusaMotivo={
              estadoCanal.ultimaDecisao?.status === 'RECUSADA'
                ? estadoCanal.ultimaDecisao.motivo
                : null
            }
          />
        </ConfigSectionCard>
      ) : null}

      <MotionReveal index={ehUnidadeDaTorcida ? 6 : 5}>
        <section className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
          <div className="flex items-start gap-4 border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-6 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
              <Settings className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
            </div>
            <div>
              <h2 className="font-semibold text-[rgb(var(--foreground))]">Plano atual</h2>
              <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
                Informações da sua assinatura
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between px-6 py-5">
            <div>
              <p className="font-semibold text-[rgb(var(--foreground))]">{plano.nome}</p>
              <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">{plano.descricao}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${plano.classe}`}>
              {tenant.plano}
            </span>
          </div>
        </section>
      </MotionReveal>
    </div>
  )
}
