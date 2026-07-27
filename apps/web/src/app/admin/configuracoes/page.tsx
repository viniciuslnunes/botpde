import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Settings, MessageSquare, Flag, Scale, Network, Radio } from 'lucide-react'
import {
  PerfilTenantForm,
  DiscordForm,
  AfiliacaoForm,
  BalancoVisivelForm,
  HierarquiaVisivelForm,
  CanalOficialForm,
} from '@/components/admin/config-forms'
import { getOrCreateCanalOficial } from '@/lib/canais'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { AdminTabs, adminTabIds } from '@/components/admin/ui'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Configurações — Admin' }

const CONFIG_TAB_PARAM = 'tab'

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!tenant || !session?.user?.id) redirect('/')

  interface AfiliacaoOption {
    id: string
    nome: string
  }

  const [isOwner, afiliacoes]: [
    Awaited<ReturnType<typeof db.userRole.findFirst>>,
    AfiliacaoOption[],
  ] = await Promise.all([
    db.userRole.findFirst({
      where: {
        userId: session.user.id,
        tenantId: tenant.id,
        role: { isSystem: true, nome: 'owner' },
      },
    }),
    db.afiliacao.findMany({
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
  ])

  // Só resolve/cria o canal oficial para quem de fato vê a seção — evita que
  // qualquer visita de admin sem SETTINGS_MANAGE (gate real da action) crie o
  // canal como efeito colateral do carregamento da página.
  const canalOficial: {
    nome: string | null
    descricao: string | null
    avatarUrl: string | null
    visibilidadeCanal: string
    somenteAdminPublica: boolean
    publica: boolean
  } | null = isOwner
    ? await (async () => {
        const { id: canalOficialId } = await getOrCreateCanalOficial(tenant.id)
        return db.conversa.findUnique({
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
      })()
    : null

  const sections = [
    {
      id: 'perfil',
      icon: Settings,
      title: 'Perfil da torcida',
      description: 'Nome da plataforma. Cores e visual ficam em Design.',
      ownerOnly: true,
    },
    {
      id: 'discord',
      icon: MessageSquare,
      title: 'Integração Discord',
      description: 'Vincule o servidor Discord para sincronizar membros e comandos do bot',
      ownerOnly: true,
    },
    {
      id: 'afiliacao',
      icon: Flag,
      title: 'Afiliação',
      description: 'Defina qual time a torcida apoia para contexto global de notícias',
      ownerOnly: true,
    },
    {
      id: 'balanco',
      icon: Scale,
      title: 'Balanço financeiro',
      description: 'Prestação de contas no portal — escolha o nível de detalhe público',
      ownerOnly: false,
    },
    {
      id: 'hierarquia',
      icon: Network,
      title: 'Hierarquia da torcida',
      description: 'Controle o que subsedes e PDEs enxergam da estrutura completa',
      ownerOnly: true,
    },
    {
      id: 'canal-oficial',
      icon: Radio,
      title: 'Canal oficial',
      description: 'Nome, foto, visibilidade e regras do mural desta unidade na Comunidade',
      ownerOnly: true,
    },
  ]

  const params = await searchParams
  const activeSection =
    sections.find((section) => section.id === params.tab) ?? sections[0]!
  const { tabId, panelId } = adminTabIds(CONFIG_TAB_PARAM, activeSection.id)
  const Icon = activeSection.icon
  const blocked = activeSection.ownerOnly && !isOwner

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-5">
        <div className="app-container flex items-center gap-3">
          <Settings className="h-5 w-5 text-[rgb(var(--foreground-muted))]" />
          <div>
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Configurações</h1>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">{tenant.nome}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto py-6">
        <div className="app-container space-y-6">
          <AdminTabs
            tabs={sections.map((section) => {
              const TabIcon = section.icon
              return {
                id: section.id,
                label: section.title,
                // JSX (não o componente) — funções Lucide não serializam Server→Client.
                icon: <TabIcon className="h-4 w-4 shrink-0" aria-hidden />,
              }
            })}
            basePath="/admin/configuracoes"
            activeId={activeSection.id}
            paramKey={CONFIG_TAB_PARAM}
          />

          <MotionReveal key={activeSection.id}>
            <div
              id={panelId}
              role="tabpanel"
              aria-labelledby={tabId}
              className={[
                'overflow-hidden rounded-2xl border bg-[rgb(var(--surface))]',
                'border-[rgb(var(--border))]',
                blocked ? 'opacity-60' : '',
              ].join(' ')}
            >
              <div className="flex items-start gap-4 border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-6 py-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
                  <Icon className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-[rgb(var(--foreground))]">{activeSection.title}</h2>
                    {activeSection.ownerOnly && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                        Somente owner
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
                    {activeSection.description}
                  </p>
                </div>
              </div>

              <div className="px-6 py-5">
                {blocked ? (
                  <p className="text-sm text-[rgb(var(--foreground-muted))]">
                    Apenas o owner da torcida pode alterar esta configuração.
                  </p>
                ) : activeSection.id === 'perfil' ? (
                  <PerfilTenantForm nome={tenant.nome} />
                ) : activeSection.id === 'discord' ? (
                  <DiscordForm discordGuildId={tenant.discordGuildId ?? null} />
                ) : activeSection.id === 'afiliacao' ? (
                  <AfiliacaoForm afiliacaoId={tenant.afiliacaoId ?? null} afiliacoes={afiliacoes} />
                ) : activeSection.id === 'balanco' ? (
                  <BalancoVisivelForm
                    key={`${tenant.balancoFinanceiroVisivel}-${tenant.balancoDetalheNivel}`}
                    visivel={tenant.balancoFinanceiroVisivel}
                    detalheNivel={tenant.balancoDetalheNivel}
                  />
                ) : activeSection.id === 'hierarquia' ? (
                  <HierarquiaVisivelForm
                    key={String(tenant.hierarquiaVisivelParaFilhos)}
                    visivel={tenant.hierarquiaVisivelParaFilhos}
                  />
                ) : activeSection.id === 'canal-oficial' && canalOficial ? (
                  <CanalOficialForm
                    nome={canalOficial.nome ?? tenant.nome}
                    descricao={canalOficial.descricao}
                    avatarUrl={canalOficial.avatarUrl}
                    visibilidadeCanal={canalOficial.visibilidadeCanal}
                    somenteAdminPublica={canalOficial.somenteAdminPublica}
                    publica={canalOficial.publica}
                  />
                ) : null}
              </div>
            </div>
          </MotionReveal>

          <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
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
            <div className="px-6 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-[rgb(var(--foreground))]">
                    {tenant.plano === 'FREE'
                      ? 'Gratuito'
                      : tenant.plano === 'BASIC'
                        ? 'Básico'
                        : 'Premium'}
                  </p>
                  <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
                    {tenant.plano === 'FREE'
                      ? 'Recursos limitados — faça upgrade para desbloquear tudo'
                      : tenant.plano === 'BASIC'
                        ? 'Acesso a recursos essenciais'
                        : 'Acesso completo a todos os recursos'}
                  </p>
                </div>
                <span
                  className={[
                    'rounded-full px-3 py-1 text-xs font-bold',
                    tenant.plano === 'FREE'
                      ? 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]'
                      : tenant.plano === 'BASIC'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                        : 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
                  ].join(' ')}
                >
                  {tenant.plano}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
