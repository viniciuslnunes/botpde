import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { carregarTenantCarteirinha } from '@/lib/associacao-escopo-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CreditCard, ArrowRight, CheckCircle2, Clock, IdCard, QrCode } from 'lucide-react'
import { CarteirinhaValidadeAlerts } from '@/components/portal/carteirinha-validade-alerts'
import { CarteirinhaReveal } from '@/components/portal/carteirinha-motion'
import { CarteirinhaQrPanel } from '@/components/portal/carteirinha-qr-panel'
import { CarteirinhaAssociacaoStatus } from '@/components/portal/carteirinha-associacao-status'
import { PortalModuloHeader } from '@/components/portal/portal-modulo-header'
import {
  CarteirinhaCadastroChip,
  CarteirinhaCadastroPanel,
} from '@/components/portal/carteirinha-cadastro-panel'
import { CarteirinhaCadastroAnchor } from '@/components/portal/carteirinha-cadastro-anchor'
import { AdminTabs, adminTabIds, type AdminTabItem } from '@/components/admin/ui'
import { garantirQrTokenSocio, montarPayloadQr } from '@/lib/carteirinha-qr'
import {
  CARTEIRINHA_PATH,
  CARTEIRINHA_SECAO_PARAM,
  hrefCarteirinhaSecao,
  parseCarteirinhaSecao,
} from '@/lib/carteirinha-tabs'
import { carregarHomeAssociado } from '@/lib/associacao-home'
import { carregarFichaAssociacaoPortal } from '@/lib/ficha-associacao-portal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Minha Carteirinha' }

/** Mesma coluna da ficha de sócio — card digital fica mais estreito no miolo. */
const PAGE = 'mx-auto max-w-3xl space-y-6 px-1 pb-8 sm:px-0'

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b }
}

function isVencida(validade: Date) {
  return validade < new Date()
}

function luminance(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

const ICONE_TAB = 'h-4 w-4 shrink-0'

export default async function CarteirinhaPage({
  searchParams,
}: {
  searchParams: Promise<{ secao?: string }>
}) {
  const [session, host, params] = await Promise.all([
    auth(),
    getTenantFromHost(),
    searchParams,
  ])
  if (!session?.user?.id) redirect('/entrar')

  const userId = session.user.id
  const tenant = host ? await carregarTenantCarteirinha(host, userId) : null
  const cor = tenant?.corPrimaria ?? '#7c3aed'
  const { r, g, b } = hexToRgb(cor)
  const darken = (v: number) => Math.max(0, Math.floor(v * 0.65))
  const corEscura = `rgb(${darken(r)}, ${darken(g)}, ${darken(b)})`
  const textoBranco = luminance(r, g, b) < 180

  const [home, ficha] = tenant
    ? await Promise.all([
        carregarHomeAssociado(tenant.id, userId),
        carregarFichaAssociacaoPortal(tenant.id, userId, {
          exigirDocumentosCadastro: tenant.exigirDocumentosCadastro,
          periodicidadesOnboarding: tenant.periodicidadesOnboarding,
        }),
      ])
    : [null, null]
  const membro = home?.membro ?? null
  const socio = home?.socio ?? null
  const ehSocio = membro?.tipo === 'SOCIO'

  const nome = session.user.name ?? home?.membro?.nome ?? 'Associado'
  const avatarUrl = session.user.image

  if (!membro) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center justify-center py-20 text-center">
        <CreditCard className="mb-4 h-14 w-14 text-[rgb(var(--foreground-muted))]" />
        <h1 className="portal-display text-xl text-[rgb(var(--foreground))]">Sem carteirinha</h1>
        <p className="mt-2 max-w-sm text-sm text-[rgb(var(--foreground-muted))]">
          Você ainda não é membro da torcida. Solicite seu cadastro para receber sua carteirinha digital
          e acompanhar mensalidades.
        </p>
        <Link
          href="/portal/cadastro"
          className="mt-4 inline-flex items-center gap-1 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-primary-on"
        >
          Solicitar cadastro
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    )
  }

  if (membro.status === 'PENDENTE') {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center justify-center py-20 text-center">
        <Clock className="mb-4 h-14 w-14 text-yellow-500" />
        <h1 className="portal-display text-xl text-[rgb(var(--foreground))]">Cadastro em análise</h1>
        <p className="mt-2 max-w-sm text-sm text-[rgb(var(--foreground-muted))]">
          Sua solicitação está sendo avaliada pela administração. Você receberá sua carteirinha e o
          status financeiro após a aprovação.
        </p>
      </div>
    )
  }

  // Torcedor aprovado — sem ficha de sócio.
  if (membro.status === 'APROVADO' && !ehSocio) {
    return (
      <div className={PAGE}>
        <CarteirinhaReveal index={0}>
          <PortalModuloHeader
            kicker="[ Torcedor ]"
            title="Minha Carteirinha"
            bordered={false}
          />
        </CarteirinhaReveal>

        <CarteirinhaReveal index={1}>
          <div className="mx-auto max-w-lg">
            <div
              className="relative overflow-hidden rounded-2xl p-6 shadow-lg"
              style={{
                background: `linear-gradient(135deg, ${cor} 0%, ${corEscura} 100%)`,
              }}
            >
              <div
                className="absolute -right-8 -top-8 h-40 w-40 rounded-full opacity-10"
                style={{ background: 'white' }}
              />
              <div
                className="absolute -bottom-10 -left-10 h-48 w-48 rounded-full opacity-10"
                style={{ background: 'white' }}
              />

              <div className="relative z-10">
                <div className="mb-4 flex items-center justify-between">
                  <span className={`portal-kicker ${textoBranco ? 'text-white/70' : 'text-black/60'}`}>
                    {tenant?.nome ?? 'TORCIDA'}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 portal-chip ${textoBranco ? 'bg-white/20 text-white' : 'bg-black/20 text-black'}`}
                  >
                    TORCEDOR
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt={nome}
                      className="h-16 w-16 rounded-full border-2 border-white/30 object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/30 bg-white/20 text-2xl font-bold text-white">
                      {nome.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className={`portal-display text-lg ${textoBranco ? 'text-white' : 'text-black'}`}>
                      {nome}
                    </p>
                    <p className={`text-sm ${textoBranco ? 'text-white/70' : 'text-black/60'}`}>
                      Torcedor
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CarteirinhaReveal>

        {home && <CarteirinhaAssociacaoStatus home={home} revealFrom={2} />}

        <CarteirinhaReveal index={6}>
          <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Você é um torcedor aprovado. Para obter uma carteirinha numerada de sócio, entre em
              contato com a administração.
            </p>
          </div>
        </CarteirinhaReveal>
      </div>
    )
  }

  if (!home) return null

  const vencida = socio ? isVencida(socio.validade) : false
  const qrToken = socio ? await garantirQrTokenSocio(socio.id, tenant!.id) : null
  const qrPayload = qrToken ? montarPayloadQr(qrToken) : null
  const validarUrl = qrPayload
    ? `/carteirinha/validar?t=${encodeURIComponent(qrPayload)}`
    : null

  const secaoPedida = parseCarteirinhaSecao(params.secao)
  const secao = secaoPedida === 'cadastro' && ficha ? 'cadastro' : 'carteirinha'
  const faltando = ficha?.resumo.faltando.length ?? 0
  const tabs: AdminTabItem[] = ficha
    ? [
        {
          id: 'carteirinha',
          label: 'Minha carteirinha',
          icon: <CreditCard className={ICONE_TAB} />,
          href: hrefCarteirinhaSecao('carteirinha'),
        },
        {
          id: 'cadastro',
          label: 'Cadastro de sócio',
          icon: <IdCard className={ICONE_TAB} />,
          href: hrefCarteirinhaSecao('cadastro'),
          count: faltando > 0 ? faltando : undefined,
          countClass:
            'bg-[rgb(var(--color-warning)_/_0.16)] text-[rgb(var(--color-warning-fg))]',
        },
      ]
    : []
  const { tabId, panelId } = adminTabIds(CARTEIRINHA_SECAO_PARAM, secao)

  return (
    <div className={PAGE}>
      <Suspense fallback={null}>
        <CarteirinhaCadastroAnchor />
      </Suspense>

      <CarteirinhaReveal index={0}>
        <PortalModuloHeader
          kicker="[ Sócio ]"
          title="Minha Carteirinha"
          bordered={false}
          actions={
            socio && !vencida ? (
              <span className="flex items-center gap-1.5 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" /> Ativa
              </span>
            ) : undefined
          }
        />
      </CarteirinhaReveal>

      {tabs.length > 0 ? (
        <div className="sticky top-0 z-10 -mx-1 bg-[rgb(var(--background)_/_0.92)] px-1 py-2 backdrop-blur-sm">
          <AdminTabs
            tabs={tabs}
            basePath={CARTEIRINHA_PATH}
            activeId={secao}
            paramKey={CARTEIRINHA_SECAO_PARAM}
          />
        </div>
      ) : null}

      <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="space-y-6">
        {secao === 'cadastro' && ficha ? (
          <CarteirinhaReveal index={1}>
            <CarteirinhaCadastroPanel ficha={ficha} />
          </CarteirinhaReveal>
        ) : (
          <>
            {ficha && !ficha.resumo.completo ? (
              <CarteirinhaReveal index={1}>
                <CarteirinhaCadastroChip
                  completo={ficha.resumo.completo}
                  ok={ficha.resumo.okCount}
                  total={ficha.resumo.total}
                  faltando={ficha.resumo.faltando.length}
                />
              </CarteirinhaReveal>
            ) : null}

            {socio ? (
              <CarteirinhaReveal index={2}>
                <div className="mx-auto max-w-lg">
                  <div
                    className={[
                      'relative overflow-hidden rounded-2xl shadow-xl transition-all',
                      vencida ? 'opacity-60 grayscale' : '',
                    ].join(' ')}
                    style={{
                      background: `linear-gradient(135deg, ${cor} 0%, ${corEscura} 100%)`,
                      aspectRatio: '1.586',
                    }}
                  >
                    <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10" />
                    <div className="absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-white/10" />
                    <div className="absolute bottom-8 right-12 h-20 w-20 rounded-full bg-white/5" />

                    <div className="absolute inset-0 flex flex-col justify-between p-6">
                      <div className="flex items-start justify-between">
                        <div>
                          <p
                            className={`portal-kicker ${textoBranco ? 'text-white/60' : 'text-black/50'}`}
                          >
                            {tenant?.nome ?? 'TORCIDA'}
                          </p>
                          <p
                            className={`portal-chip ${textoBranco ? 'text-white/40' : 'text-black/40'}`}
                          >
                            Carteirinha Digital
                          </p>
                        </div>
                        <div
                          className={`rounded-lg px-2.5 py-1 portal-display text-xs tracking-wider ${textoBranco ? 'bg-white/20 text-white' : 'bg-black/20 text-black'}`}
                        >
                          SÓCIO
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={avatarUrl}
                            alt={socio.nome}
                            className="h-14 w-14 rounded-full border-2 border-white/40 object-cover shadow-md"
                          />
                        ) : (
                          <div
                            className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/40 bg-white/20 text-xl font-bold shadow-md"
                            style={{ color: textoBranco ? 'white' : 'black' }}
                          >
                            {socio.nome.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p
                            className={`portal-display text-base leading-tight ${textoBranco ? 'text-white' : 'text-black'}`}
                          >
                            {socio.nome}
                          </p>
                          <p
                            className={`mt-0.5 font-mono text-xl font-black tracking-wider ${textoBranco ? 'text-white/90' : 'text-black/80'}`}
                          >
                            Nº {String(socio.numeroSocio).padStart(5, '0')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-end justify-between">
                        <div>
                          <p
                            className={`portal-chip ${textoBranco ? 'text-white/50' : 'text-black/40'}`}
                          >
                            Válido até
                          </p>
                          <p
                            className={`font-mono text-sm font-bold ${textoBranco ? 'text-white' : 'text-black'}`}
                          >
                            {socio.validade.toLocaleDateString('pt-BR', {
                              month: '2-digit',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                        <div className={`rounded-lg p-2 ${textoBranco ? 'bg-white/20' : 'bg-black/20'}`}>
                          <QrCode className={`h-8 w-8 ${textoBranco ? 'text-white' : 'text-black'}`} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CarteirinhaReveal>
            ) : (
              <CarteirinhaReveal index={2}>
                <div className="rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
                  <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
                    Carteirinha aguardando emissão
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
                    Complete o{' '}
                    <Link
                      href={hrefCarteirinhaSecao('cadastro')}
                      className="font-medium text-[rgb(var(--color-primary-fg))] underline-offset-2 hover:underline"
                    >
                      cadastro de sócio
                    </Link>
                    . Com os dados em dia, a carteirinha digital é emitida automaticamente.
                  </p>
                </div>
              </CarteirinhaReveal>
            )}

            {socio ? (
              <CarteirinhaReveal index={3}>
                <CarteirinhaValidadeAlerts validadeIso={socio.validade.toISOString()} />
              </CarteirinhaReveal>
            ) : null}

            <CarteirinhaAssociacaoStatus home={home} revealFrom={4} />

            {validarUrl && qrPayload ? (
              <CarteirinhaReveal index={8}>
                <CarteirinhaQrPanel validarUrl={validarUrl} qrPayload={qrPayload} />
              </CarteirinhaReveal>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
