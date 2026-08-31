import { redirect } from 'next/navigation'
import { db } from '@torcida/db'
import { formatNomeAfiliacao, formatNomeTorcida, PERMISSIONS, primeiraTabPermitida } from '@torcida/types'
import { assertAnyPermission } from '@/lib/authz'
import { isExpectedError } from '@/lib/expected-error'
import { CreditCard, Flag, IdCard, LifeBuoy, Link2, Lock, MapPin, Radio, Settings } from 'lucide-react'
import { ConviteForm } from './_components/convite-form'
import { SetorArquibancadaForm } from './_components/setor-arquibancada-form'
import { getAncestorTenantIds } from '@/lib/hierarquia'
import { getEstadoCanalRestrito } from '@/lib/canal-restrito'
import {
  CanalRestritoForm,
  type SolicitacaoReativacaoView,
} from './_components/canal-restrito-form'
import { PerfilTenantForm, AfiliacaoForm, DocumentosCadastroForm, PeriodicidadesOnboardingForm, CanalOficialForm, SolicitarPendenciasCadastroForm, PropagarPendenciasCadastroForm, SuportePlataformaForm } from '@/components/admin/config-forms'
import { getOrCreateCanalOficial } from '@/lib/canais'
import { permissoesEfetivasNoAdmin } from '@/lib/admin-modulos'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { AdminTabs, adminTabIds, type AdminTabItem } from '@/components/admin/ui'
import { ConfigSectionCard } from './_components/config-section-card'
import { getConfigContexto } from './_lib/contexto'
import { resolverTenantRaizId } from '@/lib/membros-sede'
import { resolverSetorArquibancada } from '@/lib/setor-arquibancada'
import { sedePropagaPendenciasCadastro } from '@/lib/pendencias-cadastro-server'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Configurações — Admin' }

const ICONE = 'h-4 w-4'
const BASE_PATH = '/admin/configuracoes'
/** Query param das seções — `tab` continua reservado às rotas legadas. */
const PARAM_SECAO = 'secao'

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
 * ficaram viraram seções desta página (`?secao=`), então o param legado só
 * responde pelas que mudaram de rota.
 */
const ROTA_POR_TAB_LEGADA: Record<string, string> = {
  discord: '/admin/configuracoes/integracoes',
  balanco: '/admin/configuracoes/transparencia?secao=balanco',
  hierarquia: '/admin/configuracoes/transparencia?secao=hierarquia',
}

export default async function ConfiguracoesGeralPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; secao?: string }>
}) {
  const { tab, secao } = await searchParams
  const destinoLegado = tab ? ROTA_POR_TAB_LEGADA[tab] : undefined
  if (destinoLegado) redirect(destinoLegado)

  // Menu de Plataforma aponta para esta raiz; quem só tem Acessos/Auditoria
  // cai na própria etapa (mesmo padrão de Loja/Comunidade).
  try {
    await assertAnyPermission([
      PERMISSIONS.SETTINGS_MANAGE,
      PERMISSIONS.ASSOCIACAO_PENDENCIAS_MANAGE,
    ])
  } catch {
    const permissoes = await permissoesEfetivasNoAdmin()
    redirect(primeiraTabPermitida('plataforma', permissoes) ?? '/admin')
  }

  const {
    userId,
    tenant,
    isOwner,
    isSuperAdmin,
    podeEditarConfigDeOwner,
    suporteConsentido,
    canManageSettings,
    canManagePendenciasCadastro,
  } = await getConfigContexto()

  // R5 — só faz sentido restringir o canal de uma UNIDADE: a Sede raiz não tem
  // de quem se isolar, e fechá-la esconderia a torcida inteira.
  const ancestrais = await getAncestorTenantIds(tenant.id)
  const ehUnidadeDaTorcida = ancestrais.length > 0

  // Uma seção que o usuário não pode gerenciar não vira tab — nada de card
  // cinza explicando o que ele não pode fazer.
  const tabs: AdminTabItem[] = [
    ...(podeEditarConfigDeOwner
      ? [{ id: 'perfil', label: 'Perfil da torcida', icon: <Settings className={ICONE} /> }]
      : []),
    ...(podeEditarConfigDeOwner
      ? [{ id: 'afiliacao', label: 'Afiliação', icon: <Flag className={ICONE} /> }]
      : []),
    ...(canManageSettings || canManagePendenciasCadastro
      ? [{ id: 'cadastro', label: 'Cadastro de sócios', icon: <IdCard className={ICONE} /> }]
      : []),
    ...(podeEditarConfigDeOwner
      ? [{ id: 'canal-oficial', label: 'Canal oficial', icon: <Radio className={ICONE} /> }]
      : []),
    ...(canManageSettings
      ? [{ id: 'convite', label: 'Convite', icon: <Link2 className={ICONE} /> }]
      : []),
    ...(podeEditarConfigDeOwner && ehUnidadeDaTorcida
      ? [{ id: 'canal-restrito', label: 'Canal restrito', icon: <Lock className={ICONE} /> }]
      : []),
    ...(isOwner || isSuperAdmin
      ? [{ id: 'suporte', label: 'Suporte da plataforma', icon: <LifeBuoy className={ICONE} /> }]
      : []),
    ...(canManageSettings
      ? [{ id: 'plano', label: 'Plano atual', icon: <CreditCard className={ICONE} /> }]
      : []),
  ]

  if (tabs.length === 0) {
    const permissoes = await permissoesEfetivasNoAdmin()
    redirect(primeiraTabPermitida('plataforma', permissoes) ?? '/admin')
  }

  // Seção fora do que a pessoa pode ver cai na primeira permitida — nunca 403.
  const ativa = tabs.find((t) => t.id === secao)?.id ?? tabs[0]!.id
  const { tabId, panelId } = adminTabIds(PARAM_SECAO, ativa)

  // Cada seção carrega só o que a sua própria tab precisa.
  const afiliacoes: AfiliacaoOption[] =
    ativa === 'afiliacao'
      ? await db.afiliacao
          .findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true } })
          .then((rows: AfiliacaoOption[]) =>
            rows.map((a: AfiliacaoOption) => ({ id: a.id, nome: formatNomeAfiliacao(a.nome) })),
          )
      : []

  const precisaRaiz = ativa === 'cadastro' || ativa === 'afiliacao'
  const raizId = precisaRaiz ? await resolverTenantRaizId(tenant.id) : tenant.id
  const isRaiz = raizId === tenant.id
  const sobPropagacaoSede =
    ativa === 'cadastro' && !isRaiz && canManagePendenciasCadastro
      ? await sedePropagaPendenciasCadastro(tenant.id)
      : false

  const setorArquibancada =
    ativa === 'afiliacao' && podeEditarConfigDeOwner
      ? await resolverSetorArquibancada(tenant.id)
      : null
  let sedeNomeSetor: string | null = null
  if (ativa === 'afiliacao' && podeEditarConfigDeOwner && !isRaiz) {
    const raizNome: { nome: string } | null = await db.tenant.findUnique({
      where: { id: raizId },
      select: { nome: true },
    })
    sedeNomeSetor = raizNome?.nome ?? null
  }

  // Canal oficial provisiona sob demanda: só resolve na própria seção, e uma
  // falha aqui vira mensagem no card em vez de derrubar a página.
  let canalOficial: CanalOficialConfig | null = null
  let canalOficialError: string | null = null
  if (ativa === 'canal-oficial' && podeEditarConfigDeOwner) {
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

  const precisaConvite = ativa === 'convite'
  const conviteRow: {
    conviteSlug: string | null
    conviteAtivo: boolean
    periodicidadesOnboarding: string[]
  } | null =
    precisaConvite || ativa === 'cadastro'
      ? await db.tenant.findUnique({
          where: { id: tenant.id },
          select: {
            conviteSlug: true,
            conviteAtivo: true,
            periodicidadesOnboarding: true,
          },
        })
      : null
  const convite = {
    slug: conviteRow?.conviteSlug ?? null,
    ativo: conviteRow?.conviteAtivo ?? false,
  }
  const periodicidadesOnboarding = conviteRow?.periodicidadesOnboarding ?? []

  // O convite mostra o aviso de isolamento; a seção R5 mostra o estado inteiro.
  const estadoCanal =
    precisaConvite || ativa === 'canal-restrito' ? await getEstadoCanalRestrito(tenant.id) : null
  const pendente = estadoCanal?.solicitacaoPendente
  const solicitacaoView: SolicitacaoReativacaoView | null = pendente
    ? {
        solicitadoPorNome: pendente.solicitadoPorNome,
        mensagem: pendente.mensagem,
        prazoIso: pendente.prazoEm.toISOString(),
        diasRestantes: Math.floor(pendente.restanteMs / (24 * 60 * 60 * 1000)),
      }
    : null

  const plano = PLANO_LABEL[tenant.plano] ?? PLANO_LABEL.FREE!

  return (
    <div className="space-y-6">
      <AdminTabs tabs={tabs} basePath={BASE_PATH} activeId={ativa} paramKey={PARAM_SECAO} />

      <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="space-y-6">
        {ativa === 'perfil' ? (
          <ConfigSectionCard
            icon={<Settings className={ICONE} />}
            title="Perfil da torcida"
            description="Nome da plataforma. Cores e visual ficam em Identidade."
            ownerOnly
          >
            <PerfilTenantForm nome={tenant.nome} />
          </ConfigSectionCard>
        ) : null}

        {ativa === 'afiliacao' ? (
          <>
            <ConfigSectionCard
              icon={<Flag className={ICONE} />}
              title="Afiliação"
              description="Defina qual time a torcida apoia para contexto global de notícias"
              ownerOnly
            >
              <AfiliacaoForm afiliacaoId={tenant.afiliacaoId ?? null} afiliacoes={afiliacoes} />
            </ConfigSectionCard>
            <ConfigSectionCard
              icon={<MapPin className={ICONE} />}
              title="Setor na arquibancada"
              description={
                isRaiz
                  ? 'Onde a torcida se concentra no estádio do time apoiado. Unidades herdam este valor.'
                  : 'Herdado da Sede — só a liderança da Sede altera.'
              }
              ownerOnly
              index={1}
            >
              <SetorArquibancadaForm
                cardeal={setorArquibancada?.cardeal ?? null}
                geral={setorArquibancada?.geral ?? false}
                nomeLocal={setorArquibancada?.nomeLocal ?? null}
                portao={setorArquibancada?.portao ?? null}
                somenteLeitura={!isRaiz}
                sedeNome={sedeNomeSetor ? formatNomeTorcida(sedeNomeSetor) : null}
              />
            </ConfigSectionCard>
          </>
        ) : null}

        {ativa === 'cadastro' ? (
          <ConfigSectionCard
            icon={<IdCard className={ICONE} />}
            title="Cadastro de sócios"
            description="Documentos, planos e solicitação de dados pendentes nesta unidade"
          >
            <div className="space-y-8">
              {canManagePendenciasCadastro ? (
                <>
                  <SolicitarPendenciasCadastroForm
                    key={`local-${String(tenant.solicitarPendenciasCadastro)}`}
                    ativo={tenant.solicitarPendenciasCadastro}
                    unidadeNome={formatNomeTorcida(tenant.nome)}
                    sobPropagacaoSede={sobPropagacaoSede}
                  />
                  {isRaiz ? (
                    <PropagarPendenciasCadastroForm
                      key={`propagar-${String(tenant.propagarPendenciasCadastroUnidades)}`}
                      ativo={tenant.propagarPendenciasCadastroUnidades}
                      unidadeNome={formatNomeTorcida(tenant.nome)}
                    />
                  ) : null}
                </>
              ) : null}
              {podeEditarConfigDeOwner ? (
                <>
                  <DocumentosCadastroForm
                    key={String(tenant.exigirDocumentosCadastro)}
                    exigir={tenant.exigirDocumentosCadastro}
                  />
                  <PeriodicidadesOnboardingForm
                    key={periodicidadesOnboarding.join(',') || 'padrao'}
                    periodicidades={periodicidadesOnboarding}
                  />
                </>
              ) : null}
            </div>
          </ConfigSectionCard>
        ) : null}

        {ativa === 'canal-oficial' ? (
          <ConfigSectionCard
            id="canal-oficial"
            icon={<Radio className={ICONE} />}
            title="Canal oficial"
            description="Nome, foto, visibilidade e regras do mural desta unidade na Comunidade"
            ownerOnly
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
        ) : null}

        {ativa === 'convite' ? (
          <ConfigSectionCard
            id="convite"
            icon={<Link2 className={ICONE} />}
            title="Convite"
            description="Link que adianta as etapas do onboarding e leva direto ao vínculo"
          >
            <ConviteForm
              key={`${convite.slug ?? 'sem'}-${String(convite.ativo)}`}
              slug={convite.slug}
              ativo={convite.ativo}
              canalRestrito={estadoCanal?.restrito ?? false}
            />
          </ConfigSectionCard>
        ) : null}

        {ativa === 'canal-restrito' && estadoCanal ? (
          <ConfigSectionCard
            id="canal-restrito"
            icon={<Lock className={ICONE} />}
            title="Canal restrito"
            description="Isolar esta unidade das interações externas, mantendo a operação interna"
            ownerOnly
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

        {ativa === 'suporte' ? (
          <ConfigSectionCard
            id="suporte-plataforma"
            icon={<LifeBuoy className={ICONE} />}
            title="Suporte da plataforma"
            description="Autorizar a equipe da plataforma a ajustar as configurações de presidente desta unidade"
          >
            <SuportePlataformaForm
              key={String(suporteConsentido)}
              ativo={suporteConsentido}
              unidadeNome={formatNomeTorcida(tenant.nome)}
              somenteLeitura={!isOwner}
            />
          </ConfigSectionCard>
        ) : null}

        {ativa === 'plano' ? (
          <MotionReveal>
            <section className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
              <div className="flex items-start gap-4 border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-6 py-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
                  <CreditCard className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
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
                  <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
                    {plano.descricao}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${plano.classe}`}>
                  {tenant.plano}
                </span>
              </div>
            </section>
          </MotionReveal>
        ) : null}
      </div>
    </div>
  )
}
