'use client'

import { useActionState, useMemo, useState, type ReactNode } from 'react'
import Image from 'next/image'
import {
  Check,
  FileImage,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  User,
  X,
} from 'lucide-react'
import { Badge, type BadgeVariant } from '@torcida/ui'
import { EventoMapaLinks } from '@/components/eventos/evento-mapa-links'
import { MediaLightbox } from '@/components/portal/media-lightbox'
import { MotionTabBar } from '@/components/motion/motion-tab-bar'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { canOptimizeImageUrl, isDurableRemoteImageUrl } from '@/lib/optimizable-image'
import { resolveSedeLocationImage } from '@/lib/google-maps'
import {
  aprovarSolicitacao,
  editarSolicitacao,
  recusarSolicitacao,
  type SolicitacaoActionState,
} from '../afiliacao-actions'

export interface SolicitacaoView {
  id: string
  status: 'PENDENTE' | 'APROVADA' | 'RECUSADA'
  nome: string
  tipo: 'SUBSEDE' | 'PONTO_ENCONTRO'
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
  criadoEm: string
  solicitadoPor: {
    nome: string | null
    email: string | null
    image: string | null
  } | null
}

const TIPO_LABEL: Record<SolicitacaoView['tipo'], string> = {
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'PDE',
}

const STATUS_VARIANT: Record<SolicitacaoView['status'], BadgeVariant> = {
  PENDENTE: 'warning',
  APROVADA: 'success',
  RECUSADA: 'danger',
}

const STATUS_LABEL: Record<SolicitacaoView['status'], string> = {
  PENDENTE: 'Pendente',
  APROVADA: 'Aprovada',
  RECUSADA: 'Recusada',
}

type AbaPedido = 'resumo' | 'local' | 'provas' | 'contato'

const inputClass =
  'w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2.5 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--color-primary))]'

function Feedback({ state }: { state: SolicitacaoActionState }) {
  if (!state.message) return null
  return (
    <p
      className={
        state.success
          ? 'text-xs text-[rgb(var(--color-success-fg))]'
          : 'text-xs text-red-600 dark:text-red-400'
      }
      role={state.success ? 'status' : 'alert'}
    >
      {state.message}
    </p>
  )
}

function CampoLeitura({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-[rgb(var(--foreground))]">{children}</dd>
    </div>
  )
}

function ThumbImagem({
  url,
  alt,
  onClick,
  className,
}: {
  url: string
  alt: string
  onClick?: () => void
  className?: string
}) {
  if (!isDurableRemoteImageUrl(url)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
      >
        <FileImage className="h-3.5 w-3.5" />
        Abrir anexo
      </a>
    )
  }

  const optimized = canOptimizeImageUrl(url)
  const body = optimized ? (
    <Image src={url} alt={alt} fill className="object-cover" sizes="160px" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- host fora do otimizador Next
    <img src={url} alt={alt} className="h-full w-full object-cover" />
  )

  if (!onClick) {
    return <div className={className}>{body}</div>
  }

  return (
    <button type="button" onClick={onClick} className={className} aria-label={`Ampliar ${alt}`}>
      {body}
    </button>
  )
}

export function AfiliacaoPedidoCard({
  pedido,
  podeDecidir,
}: {
  pedido: SolicitacaoView
  podeDecidir: boolean
}) {
  const [aprovarState, aprovarAction, aprovando] = useActionState<SolicitacaoActionState, FormData>(
    aprovarSolicitacao,
    {},
  )
  const [recusarState, recusarAction, recusando] = useActionState<SolicitacaoActionState, FormData>(
    recusarSolicitacao,
    {},
  )
  const [editarState, editarAction, editando] = useActionState<SolicitacaoActionState, FormData>(
    editarSolicitacao,
    {},
  )
  const [modo, setModo] = useState<'ver' | 'recusar' | 'editar'>('ver')
  const [aba, setAba] = useState<AbaPedido>('resumo')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const ocupado = aprovando || recusando || editando
  const pendente = pedido.status === 'PENDENTE'

  const enderecoCompleto = [pedido.endereco, pedido.cidade, pedido.estado, pedido.cep]
    .filter(Boolean)
    .join(', ')

  const galeriaUrls = useMemo(() => {
    const urls: string[] = []
    if (pedido.fotoUrl && isDurableRemoteImageUrl(pedido.fotoUrl)) urls.push(pedido.fotoUrl)
    for (const u of pedido.provasUrls) {
      if (isDurableRemoteImageUrl(u) && !urls.includes(u)) urls.push(u)
    }
    return urls
  }, [pedido.fotoUrl, pedido.provasUrls])

  const streetViewUrl = resolveSedeLocationImage(
    {
      lat: pedido.lat,
      lng: pedido.lng,
      endereco: pedido.endereco,
      cidade: pedido.cidade,
      estado: pedido.estado,
    },
    { width: 640, height: 280 },
  )

  const provasCount = (pedido.fotoUrl ? 1 : 0) + pedido.provasUrls.length
  const temCoords = pedido.lat != null && pedido.lng != null

  const tabItems = [
    { id: 'resumo', label: 'Resumo' },
    { id: 'local', label: 'Local' },
    {
      id: 'provas',
      label: 'Provas',
      count: provasCount > 0 ? provasCount : undefined,
    },
    { id: 'contato', label: 'Contato' },
  ]

  return (
    <article className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
      {/* Cabeçalho */}
      <div className="flex gap-3 border-b border-[rgb(var(--border))] p-4 sm:gap-4 sm:p-5">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[rgb(var(--background-subtle))] sm:h-24 sm:w-24">
          {pedido.fotoUrl && isDurableRemoteImageUrl(pedido.fotoUrl) ? (
            <ThumbImagem
              url={pedido.fotoUrl}
              alt={`Foto — ${pedido.nome}`}
              className="relative h-full w-full"
              onClick={() => {
                const idx = galeriaUrls.indexOf(pedido.fotoUrl!)
                setLightboxIndex(idx >= 0 ? idx : 0)
              }}
            />
          ) : streetViewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Street View static
            <img
              src={streetViewUrl}
              alt={`Fachada — ${pedido.nome}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-[rgb(var(--foreground-muted))]">
              <MapPin className="h-5 w-5 opacity-50" />
              <span className="text-[10px]">Sem foto</span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-balance text-base font-semibold text-[rgb(var(--foreground))] sm:text-lg">
                {pedido.nome}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="rounded-md bg-[rgb(var(--background-subtle))] px-1.5 py-0.5 text-[11px] font-semibold text-[rgb(var(--foreground-muted))]">
                  {TIPO_LABEL[pedido.tipo]}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-[rgb(var(--foreground-muted))]">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {pedido.cidade}/{pedido.estado}
                </span>
              </div>
            </div>
            <Badge variant={STATUS_VARIANT[pedido.status]} className="shrink-0">
              {STATUS_LABEL[pedido.status]}
            </Badge>
          </div>

          <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
            Solicitada em {formatDateTimeShort(pedido.criadoEm)}
            {pedido.solicitadoPor?.nome || pedido.solicitadoPor?.email
              ? ` · por ${pedido.solicitadoPor.nome ?? pedido.solicitadoPor.email}`
              : null}
          </p>
        </div>
      </div>

      {/* Abas internas */}
      <div className="px-4 pt-1 sm:px-5">
        <MotionTabBar
          items={tabItems}
          activeId={aba}
          onTabChange={(id) => setAba(id as AbaPedido)}
          layoutId={`afiliacao-pedido-tabs-${pedido.id}`}
        />
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {aba === 'resumo' && (
          <div className="space-y-4">
            <dl className="grid gap-3 sm:grid-cols-2">
              <CampoLeitura label="Tipo">{TIPO_LABEL[pedido.tipo]}</CampoLeitura>
              <CampoLeitura label="Cidade">
                {pedido.cidade}/{pedido.estado}
                {pedido.regiao ? ` · região ${pedido.regiao}` : ''}
              </CampoLeitura>
              {enderecoCompleto && (
                <div className="sm:col-span-2">
                  <CampoLeitura label="Endereço">{enderecoCompleto}</CampoLeitura>
                </div>
              )}
            </dl>

            {pedido.vinculo ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  Credenciamento
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[rgb(var(--foreground))]">
                  {pedido.vinculo}
                </p>
              </div>
            ) : (
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                Sem texto de credenciamento informado.
              </p>
            )}

            {pedido.observacao && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  Observações
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[rgb(var(--foreground))]">
                  {pedido.observacao}
                </p>
              </div>
            )}

            {pedido.motivo && (
              <div className="rounded-lg border border-red-200 bg-red-50/80 p-3 dark:border-red-900/60 dark:bg-red-950/30">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
                  Motivo da recusa
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-red-900 dark:text-red-100">
                  {pedido.motivo}
                </p>
              </div>
            )}

            {(temCoords || provasCount > 0) && (
              <p className="text-xs text-[rgb(var(--foreground-muted))]">
                {temCoords ? 'Localização com coordenadas no mapa. ' : 'Sem coordenadas no mapa. '}
                {provasCount > 0
                  ? `${provasCount} ${provasCount === 1 ? 'anexo' : 'anexos'} na aba Provas.`
                  : 'Nenhuma prova anexada.'}
              </p>
            )}
          </div>
        )}

        {aba === 'local' && (
          <div className="space-y-4">
            <dl className="grid gap-3 sm:grid-cols-2">
              <CampoLeitura label="Endereço">{pedido.endereco ?? '—'}</CampoLeitura>
              <CampoLeitura label="CEP">{pedido.cep ?? '—'}</CampoLeitura>
              <CampoLeitura label="Cidade">
                {pedido.cidade}/{pedido.estado}
              </CampoLeitura>
              {pedido.regiao && <CampoLeitura label="Região (onboarding)">{pedido.regiao}</CampoLeitura>}
              {temCoords && (
                <CampoLeitura label="Coordenadas">
                  <span className="font-mono text-xs">
                    {pedido.lat!.toFixed(5)}, {pedido.lng!.toFixed(5)}
                  </span>
                </CampoLeitura>
              )}
            </dl>

            {temCoords ? (
              <EventoMapaLinks
                lat={pedido.lat}
                lng={pedido.lng}
                local={pedido.nome}
                embed
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.5)] px-4 py-10 text-center">
                <MapPin className="h-6 w-6 text-[rgb(var(--foreground-muted))] opacity-60" />
                <p className="text-sm text-[rgb(var(--foreground-muted))]">
                  Esta solicitação não tem coordenadas para exibir no mapa.
                </p>
                {enderecoCompleto && (
                  <p className="max-w-md text-xs text-[rgb(var(--foreground-muted))]">
                    Endereço textual: {enderecoCompleto}
                  </p>
                )}
              </div>
            )}

            {streetViewUrl && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  Vista da rua
                </p>
                <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={streetViewUrl}
                    alt={`Street View — ${pedido.nome}`}
                    className="aspect-[16/7] w-full object-cover"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {aba === 'provas' && (
          <div className="space-y-4">
            {pedido.fotoUrl && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  Foto da unidade
                </p>
                {isDurableRemoteImageUrl(pedido.fotoUrl) ? (
                  <ThumbImagem
                    url={pedido.fotoUrl}
                    alt={`Foto — ${pedido.nome}`}
                    className="relative aspect-[4/3] w-full max-w-md overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]"
                    onClick={() => {
                      const idx = galeriaUrls.indexOf(pedido.fotoUrl!)
                      setLightboxIndex(idx >= 0 ? idx : 0)
                    }}
                  />
                ) : (
                  <a
                    href={pedido.fotoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-[rgb(var(--color-primary-fg))] hover:underline"
                  >
                    Abrir foto
                  </a>
                )}
              </div>
            )}

            {pedido.provasUrls.length > 0 ? (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  Anexos de credenciamento ({pedido.provasUrls.length})
                </p>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {pedido.provasUrls.map((url, i) => {
                    const galeriaIdx = galeriaUrls.indexOf(url)
                    return (
                      <li key={`${url}-${i}`}>
                        {isDurableRemoteImageUrl(url) ? (
                          <ThumbImagem
                            url={url}
                            alt={`Prova ${i + 1}`}
                            className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]"
                            onClick={() => setLightboxIndex(galeriaIdx >= 0 ? galeriaIdx : null)}
                          />
                        ) : (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex aspect-[4/3] items-center justify-center gap-1.5 rounded-lg border border-dashed border-[rgb(var(--border))] text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:bg-[rgb(var(--background-subtle))]"
                          >
                            <FileImage className="h-4 w-4" />
                            Prova {i + 1}
                          </a>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : !pedido.fotoUrl ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center">
                <FileImage className="h-6 w-6 text-[rgb(var(--foreground-muted))] opacity-60" />
                <p className="text-sm text-[rgb(var(--foreground-muted))]">
                  Nenhuma foto ou prova anexada nesta solicitação.
                </p>
              </div>
            ) : null}
          </div>
        )}

        {aba === 'contato' && (
          <dl className="grid gap-4 sm:grid-cols-2">
            <CampoLeitura label="Nome do contato">
              <span className="inline-flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-[rgb(var(--foreground-muted))]" />
                {pedido.contatoNome ?? '—'}
              </span>
            </CampoLeitura>
            <CampoLeitura label="Telefone / WhatsApp">
              {pedido.contatoTelefone ? (
                <a
                  href={`tel:${pedido.contatoTelefone.replace(/\s/g, '')}`}
                  className="inline-flex items-center gap-1.5 text-[rgb(var(--color-primary-fg))] hover:underline"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {pedido.contatoTelefone}
                </a>
              ) : (
                '—'
              )}
            </CampoLeitura>
            <CampoLeitura label="E-mail">
              {pedido.contatoEmail ? (
                <a
                  href={`mailto:${pedido.contatoEmail}`}
                  className="inline-flex items-center gap-1.5 break-all text-[rgb(var(--color-primary-fg))] hover:underline"
                >
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  {pedido.contatoEmail}
                </a>
              ) : (
                '—'
              )}
            </CampoLeitura>
            <CampoLeitura label="Solicitante na plataforma">
              {pedido.solicitadoPor ? (
                <span className="inline-flex items-center gap-2">
                  {pedido.solicitadoPor.image && isDurableRemoteImageUrl(pedido.solicitadoPor.image) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pedido.solicitadoPor.image}
                      alt=""
                      className="h-6 w-6 rounded-full object-cover"
                    />
                  ) : null}
                  <span>
                    {pedido.solicitadoPor.nome ?? 'Usuário'}
                    {pedido.solicitadoPor.email ? (
                      <span className="block text-xs text-[rgb(var(--foreground-muted))]">
                        {pedido.solicitadoPor.email}
                      </span>
                    ) : null}
                  </span>
                </span>
              ) : (
                'Registro manual / sem vínculo de usuário'
              )}
            </CampoLeitura>
          </dl>
        )}
      </div>

      {/* Ações */}
      {pendente && podeDecidir && (
        <div className="border-t border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.35)] px-4 py-3 sm:px-5">
          {modo === 'ver' && (
            <div className="flex flex-wrap items-center gap-2">
              <form action={aprovarAction}>
                <input type="hidden" name="solicitacaoId" value={pedido.id} />
                <button
                  type="submit"
                  disabled={ocupado}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {aprovando ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Aprovar e promover a portal
                </button>
              </form>
              <button
                type="button"
                onClick={() => setModo('editar')}
                disabled={ocupado}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3.5 py-2 text-xs font-semibold text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </button>
              <button
                type="button"
                onClick={() => setModo('recusar')}
                disabled={ocupado}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3.5 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <X className="h-3.5 w-3.5" />
                Recusar
              </button>
            </div>
          )}

          {modo === 'recusar' && (
            <form action={recusarAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input type="hidden" name="solicitacaoId" value={pedido.id} />
              <input
                name="motivo"
                required
                minLength={3}
                maxLength={500}
                placeholder="Motivo da recusa"
                className={`min-w-0 flex-1 ${inputClass}`}
              />
              <button
                type="submit"
                disabled={ocupado}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {recusando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Confirmar recusa
              </button>
              <button
                type="button"
                onClick={() => setModo('ver')}
                className="text-xs text-[rgb(var(--foreground-muted))] hover:underline"
              >
                Cancelar
              </button>
            </form>
          )}

          {modo === 'editar' && (
            <form action={editarAction} className="grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="solicitacaoId" value={pedido.id} />
              <input
                name="nome"
                defaultValue={pedido.nome}
                required
                minLength={3}
                maxLength={100}
                className={inputClass}
                aria-label="Nome"
              />
              <select name="tipo" defaultValue={pedido.tipo} className={inputClass} aria-label="Tipo">
                <option value="PONTO_ENCONTRO">PDE</option>
                <option value="SUBSEDE">Subsede</option>
              </select>
              <input
                name="cidade"
                defaultValue={pedido.cidade}
                required
                className={inputClass}
                aria-label="Cidade"
              />
              <input
                name="estado"
                defaultValue={pedido.estado}
                required
                maxLength={2}
                className={inputClass}
                aria-label="UF"
              />
              <input
                name="endereco"
                defaultValue={pedido.endereco ?? ''}
                placeholder="Endereço (opcional)"
                className={`sm:col-span-2 ${inputClass}`}
                aria-label="Endereço"
              />
              <div className="flex items-center gap-2 sm:col-span-2">
                <button
                  type="submit"
                  disabled={ocupado}
                  className="rounded-lg bg-[rgb(var(--primary))] px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {editando ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={() => setModo('ver')}
                  className="text-xs text-[rgb(var(--foreground-muted))] hover:underline"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      <div className="space-y-1 px-4 pb-3 sm:px-5">
        <Feedback state={aprovarState} />
        <Feedback state={recusarState} />
        <Feedback state={editarState} />
      </div>

      {lightboxIndex != null && galeriaUrls.length > 0 && (
        <MediaLightbox
          urls={galeriaUrls}
          index={lightboxIndex}
          caption={pedido.nome}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      )}
    </article>
  )
}
