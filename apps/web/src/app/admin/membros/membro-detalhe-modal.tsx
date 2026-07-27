'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AnimatePresence, m } from 'motion/react'
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  FileSearch,
  ImageOff,
  TriangleAlert,
  X,
} from 'lucide-react'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'
import { StatusBadge } from '@/components/admin/ui'
import { MemberActions } from '@/components/admin/member-actions'
import {
  lightboxBackdrop,
  lightboxContent,
  springGentle,
  springSnappy,
} from '@/lib/motion-presets'
import type { AdminMembroItem } from './admin-membro-item'

type TabId = 'resumo' | 'cadastro' | 'documentos' | 'associacao' | 'operacao'

function Campo({ label, value }: { label: string; value: ReactNode }) {
  const vazio =
    value === null ||
    value === undefined ||
    value === '' ||
    (typeof value === 'string' && value.trim() === '')
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-sm text-[rgb(var(--foreground))]">
        {vazio ? (
          <span className="text-[rgb(var(--foreground-muted))]">—</span>
        ) : (
          value
        )}
      </dd>
    </div>
  )
}

function Secao({
  titulo,
  children,
}: {
  titulo: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        {titulo}
      </h3>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</dl>
    </section>
  )
}

function AnexoInline({
  imagemUrl,
  nome,
  titulo,
}: {
  imagemUrl: string
  nome: string
  titulo: string
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
      {/* Dado RESTRITO: <img> direto da URL do upload, sem otimizador/cache. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imagemUrl}
        alt={`${titulo} de ${nome}`}
        className="mx-auto max-h-64 w-auto max-w-full object-contain"
        onError={(e) => {
          const el = e.currentTarget
          el.style.display = 'none'
          const fallback = el.nextElementSibling
          if (fallback instanceof HTMLElement) fallback.hidden = false
        }}
      />
      <div hidden className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <ImageOff className="h-7 w-7 text-[rgb(var(--foreground-muted))]" />
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          Não foi possível carregar o anexo.
        </p>
        <a
          href={imagemUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
        >
          Abrir em nova aba
        </a>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-[rgb(var(--border))] px-3 py-2">
        <span className="inline-flex items-center gap-1 text-xs text-[rgb(var(--foreground-muted))]">
          <FileSearch className="h-3.5 w-3.5" />
          {titulo}
        </span>
        <a
          href={imagemUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
        >
          Abrir original
        </a>
      </div>
    </div>
  )
}

function preenchido(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim().length > 0
  return true
}

type CheckItem = { id: string; label: string; ok: boolean; obrigatorio: boolean }

function checklistCadastro(m: AdminMembroItem): CheckItem[] {
  if (!m.isSocio) return []
  const menor =
    (typeof m.idade === 'number' && m.idade < 18) ||
    preenchido(m.responsavelNome) ||
    preenchido(m.autorizacaoMenorAceitaLabel)
  return [
    { id: 'numero', label: 'Nº de associado', ok: preenchido(m.numeroAssociado), obrigatorio: true },
    { id: 'cpf', label: 'CPF', ok: preenchido(m.cpf), obrigatorio: true },
    { id: 'rg', label: 'RG', ok: preenchido(m.rg), obrigatorio: true },
    {
      id: 'nascimento',
      label: 'Data de nascimento',
      ok: preenchido(m.dataNascimentoLabel),
      obrigatorio: true,
    },
    { id: 'logradouro', label: 'Logradouro', ok: preenchido(m.logradouro), obrigatorio: true },
    { id: 'bairro', label: 'Bairro', ok: preenchido(m.bairro), obrigatorio: true },
    { id: 'cep', label: 'CEP', ok: preenchido(m.cep), obrigatorio: true },
    { id: 'uf', label: 'UF', ok: preenchido(m.uf), obrigatorio: true },
    {
      id: 'termo',
      label: 'Termo de responsabilidade',
      ok: preenchido(m.termoResponsabilidadeAceitoLabel),
      obrigatorio: true,
    },
    {
      id: 'prova',
      label: 'Comprovante de vínculo',
      ok: preenchido(m.imagemProva),
      obrigatorio: true,
    },
    ...(menor
      ? [
          {
            id: 'resp-nome',
            label: 'Nome do responsável',
            ok: preenchido(m.responsavelNome),
            obrigatorio: true,
          },
          {
            id: 'resp-doc',
            label: 'Documento do responsável',
            ok: preenchido(m.responsavelDocumento),
            obrigatorio: true,
          },
        ]
      : []),
  ]
}

function checklistDocumentos(m: AdminMembroItem): CheckItem[] {
  if (!m.isSocio) return []
  return [
    {
      id: 'vinculo',
      label: 'Comprovante de vínculo',
      ok: preenchido(m.imagemProva),
      obrigatorio: true,
    },
    {
      id: 'documento',
      label: 'Foto do documento',
      ok: preenchido(m.fotoDocumentoUrl),
      obrigatorio: true,
    },
    {
      id: 'residencia',
      label: 'Comprovante de residência',
      ok: preenchido(m.comprovanteResidenciaUrl),
      obrigatorio: true,
    },
  ]
}

function Checklist({ itens }: { itens: CheckItem[] }) {
  if (itens.length === 0) return null
  const faltando = itens.filter((i) => i.obrigatorio && !i.ok)
  return (
    <div className="space-y-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.55)] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Completude do cadastro
        </p>
        <p className="text-xs text-[rgb(var(--foreground-muted))]">
          {itens.filter((i) => i.ok).length}/{itens.length}
          {faltando.length > 0 ? ` · ${faltando.length} obrigatório(s) faltando` : ' · completo'}
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {itens.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-2 text-sm text-[rgb(var(--foreground))]"
          >
            {item.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-success-fg))]" />
            ) : (
              <Circle
                className={[
                  'mt-0.5 h-4 w-4 shrink-0',
                  item.obrigatorio
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-[rgb(var(--foreground-muted))]',
                ].join(' ')}
              />
            )}
            <span className={item.ok ? '' : 'text-[rgb(var(--foreground-muted))]'}>
              {item.label}
              {!item.obrigatorio && !item.ok ? (
                <span className="text-[11px]"> · opcional</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function EmptyTab({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center">
      <p className="text-sm font-medium text-[rgb(var(--foreground))]">{titulo}</p>
      <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">{descricao}</p>
    </div>
  )
}

function TabResumo({
  membro,
  checks,
  docsFaltando,
  onGo,
}: {
  membro: AdminMembroItem
  checks: CheckItem[]
  docsFaltando: number
  onGo: (tab: TabId) => void
}) {
  const obrigFaltando = checks.filter((c) => c.obrigatorio && !c.ok)
  return (
    <div className="space-y-5">
      {(membro.alertaRivalSocio ||
        !!membro.reprovacoesOutraTorcida ||
        (membro.tentativas !== undefined && membro.tentativas > 1) ||
        (membro.adimplente === false) ||
        obrigFaltando.length > 0) && (
        <div className="space-y-1.5">
          {membro.alertaRivalSocio && (
            <p className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
              Já é sócio aprovado em torcida rival
            </p>
          )}
          {!!membro.reprovacoesOutraTorcida && (
            <p className="inline-flex items-center gap-1.5 rounded-lg bg-red-100 px-2.5 py-1.5 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-200">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
              Reprovado em recrutamento de outra torcida (
              {membro.reprovacoesOutraTorcida}x)
            </p>
          )}
          {membro.adimplente === false && (
            <p className="inline-flex items-center gap-1.5 rounded-lg bg-red-100 px-2.5 py-1.5 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-200">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
              Inadimplente
            </p>
          )}
          {obrigFaltando.length > 0 && membro.status === 'PENDENTE' && (
            <p className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
              Ficha incompleta — {obrigFaltando.length} campo(s) obrigatório(s) faltando
            </p>
          )}
          {membro.tentativas !== undefined && membro.tentativas > 1 && (
            <p className="text-xs text-[rgb(var(--foreground-muted))]">
              {membro.tentativas}ª tentativa
              {membro.ultimoMotivoReprovacao
                ? ` · reprovado antes: “${membro.ultimoMotivoReprovacao}”`
                : ' · reprovado anteriormente'}
            </p>
          )}
        </div>
      )}

      <Secao titulo="Visão rápida">
        <Campo label="Tipo" value={membro.tipo} />
        <Campo label="Status" value={membro.statusLabel} />
        <Campo label="Nº de associado" value={membro.numeroAssociado} />
        <Campo
          label="Adimplência"
          value={
            membro.adimplente === undefined
              ? null
              : membro.adimplente
                ? 'Adimplente'
                : 'Inadimplente'
          }
        />
        <Campo label="Unidade" value={membro.sedeNome} />
        <Campo label="Departamento pretendido" value={membro.departamentoNome} />
        <Campo label="Telefone" value={membro.telefone} />
        <Campo label="E-mail" value={membro.email} />
        <Campo label="Cidade" value={membro.cidade} />
        <Campo label="Cadastro em" value={membro.criadoEmLabel} />
      </Secao>

      {membro.isSocio && <Checklist itens={checks} />}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onGo('cadastro')}
          className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
        >
          Ver cadastro
        </button>
        {membro.isSocio && (
          <button
            type="button"
            onClick={() => onGo('documentos')}
            className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            Documentos
            {docsFaltando > 0 ? ` (${docsFaltando})` : ''}
          </button>
        )}
        {membro.isSocio && (
          <button
            type="button"
            onClick={() => onGo('associacao')}
            className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            Associação
          </button>
        )}
      </div>
    </div>
  )
}

function TabCadastro({ membro }: { membro: AdminMembroItem }) {
  return (
    <div className="space-y-6">
      <Secao titulo="Contato e identificação">
        <Campo label="Nome" value={membro.nome} />
        <Campo label="E-mail" value={membro.email} />
        <Campo label="Telefone" value={membro.telefone} />
        <Campo label="Idade" value={membro.idade} />
        {membro.isSocio && (
          <>
            <Campo label="Data de nascimento" value={membro.dataNascimentoLabel} />
            <Campo label="Sexo" value={membro.sexo} />
            <Campo label="Estado civil" value={membro.estadoCivil} />
            <Campo label="Nacionalidade" value={membro.nacionalidade} />
          </>
        )}
        <Campo label="Discord" value={membro.discordTag} />
        <Campo label="Discord ID" value={membro.discordId} />
      </Secao>

      {membro.isSocio ? (
        <>
          <Secao titulo="Documentos (LGE)">
            <Campo label="CPF" value={membro.cpf} />
            <Campo label="RG" value={membro.rg} />
            <Campo label="Filiação" value={membro.filiacao} />
            <Campo label="Profissão" value={membro.profissao} />
            <Campo label="Escolaridade" value={membro.escolaridade} />
          </Secao>

          <Secao titulo="Endereço">
            <Campo label="Logradouro" value={membro.logradouro} />
            <Campo label="Número" value={membro.numero} />
            <Campo label="Bloco" value={membro.bloco} />
            <Campo label="Complemento" value={membro.complemento} />
            <Campo label="Bairro" value={membro.bairro} />
            <Campo label="CEP" value={membro.cep} />
            <Campo label="Cidade" value={membro.cidade} />
            <Campo label="UF" value={membro.uf} />
          </Secao>

          {(membro.responsavelNome ||
            membro.responsavelDocumento ||
            membro.autorizacaoMenorAceitaLabel) && (
            <Secao titulo="Responsável legal (menor de idade)">
              <Campo label="Nome do responsável" value={membro.responsavelNome} />
              <Campo label="Documento do responsável" value={membro.responsavelDocumento} />
              <Campo label="Autorização aceita em" value={membro.autorizacaoMenorAceitaLabel} />
            </Secao>
          )}
        </>
      ) : (
        <EmptyTab
          titulo="Cadastro de torcedor"
          descricao="Campos LGE e endereço completo são coletados apenas para sócios."
        />
      )}
    </div>
  )
}

function TabDocumentos({
  membro,
  docs,
}: {
  membro: AdminMembroItem
  docs: CheckItem[]
}) {
  if (!membro.isSocio) {
    return (
      <EmptyTab
        titulo="Sem anexos de sócio"
        descricao="Comprovantes de vínculo e documentos LGE valem para cadastros de sócio."
      />
    )
  }

  const temAnexo =
    preenchido(membro.imagemProva) ||
    preenchido(membro.fotoDocumentoUrl) ||
    preenchido(membro.comprovanteResidenciaUrl)

  return (
    <div className="space-y-5">
      <Checklist itens={docs} />
      {temAnexo ? (
        <div className="space-y-4">
          {membro.imagemProva && (
            <AnexoInline
              imagemUrl={membro.imagemProva}
              nome={membro.nome}
              titulo="Comprovante de vínculo"
            />
          )}
          {membro.fotoDocumentoUrl && (
            <AnexoInline
              imagemUrl={membro.fotoDocumentoUrl}
              nome={membro.nome}
              titulo="Foto do documento"
            />
          )}
          {membro.comprovanteResidenciaUrl && (
            <AnexoInline
              imagemUrl={membro.comprovanteResidenciaUrl}
              nome={membro.nome}
              titulo="Comprovante de residência"
            />
          )}
        </div>
      ) : (
        <EmptyTab
          titulo="Nenhum anexo enviado"
          descricao="Peça o comprovante de vínculo (obrigatório) e os documentos de RG e residência quando a torcida exigir."
        />
      )}
    </div>
  )
}

function TabAssociacao({ membro }: { membro: AdminMembroItem }) {
  if (!membro.isSocio) {
    return (
      <EmptyTab
        titulo="Sem dados de associação"
        descricao="Número, termo e adimplência aparecem quando o vínculo é de sócio."
      />
    )
  }
  return (
    <div className="space-y-6">
      <Secao titulo="Associação">
        <Campo label="Nº de associado" value={membro.numeroAssociado} />
        <Campo
          label="Anos como sócio"
          value={
            membro.anosSocio != null
              ? `${membro.anosSocio} ano${membro.anosSocio === 1 ? '' : 's'}`
              : null
          }
        />
        <Campo
          label="Adimplência"
          value={
            membro.adimplente === undefined
              ? null
              : membro.adimplente
                ? 'Adimplente'
                : 'Inadimplente'
          }
        />
        <Campo
          label="Termo de responsabilidade"
          value={
            membro.termoResponsabilidadeAceitoLabel
              ? `Aceito em ${membro.termoResponsabilidadeAceitoLabel}`
              : null
          }
        />
      </Secao>
      <p className="text-xs text-[rgb(var(--foreground-muted))]">
        Plano, cobranças e validade da carteirinha entram nesta aba na próxima iteração.
        Por enquanto use{' '}
        <Link
          href="/admin/cobrancas"
          className="font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
        >
          Cobranças
        </Link>{' '}
        e{' '}
        <Link
          href="/admin/socios"
          className="font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
        >
          Sócios
        </Link>
        .
      </p>
    </div>
  )
}

function TabOperacao({ membro }: { membro: AdminMembroItem }) {
  return (
    <div className="space-y-6">
      <Secao titulo="Vínculo na torcida">
        <Campo label="Unidade" value={membro.sedeNome} />
        <Campo label="Departamento pretendido" value={membro.departamentoNome} />
        <Campo
          label="Espelho"
          value={
            membro.espelhado
              ? membro.status === 'PENDENTE'
                ? membro.aprovadoNaUnidadeNome?.trim()
                  ? `Solicitação via ${membro.aprovadoNaUnidadeNome.trim()}`
                  : 'Espelho da Sede (pendente)'
                : membro.aprovadoNaUnidadeNome?.trim()
                  ? `Vínculo via ${membro.aprovadoNaUnidadeNome.trim()}`
                  : 'Espelho da Sede'
              : 'Cadastro orgânico'
          }
        />
        <Campo label="Atualizado em" value={membro.atualizadoEmLabel} />
      </Secao>
      <Secao titulo="Histórico operacional">
        <Campo
          label={membro.status === 'REPROVADO' ? 'Analisado por' : 'Aprovado por'}
          value={membro.aprovadoPorNome}
        />
        <Campo
          label={membro.status === 'REPROVADO' ? 'Analisado em' : 'Aprovado em'}
          value={membro.aprovadoEmLabel}
        />
        <Campo label="Desligado em" value={membro.desligadoEmLabel} />
        <Campo label="Motivo do desligamento" value={membro.desligadoMotivo} />
        <Campo
          label="Tentativas de cadastro"
          value={membro.tentativas != null ? String(membro.tentativas) : null}
        />
        <Campo label="Último motivo de reprovação" value={membro.ultimoMotivoReprovacao} />
      </Secao>
    </div>
  )
}

export function MembroDetalheModal({
  membro,
  onClose,
}: {
  membro: AdminMembroItem | null
  onClose: () => void
}) {
  const [tab, setTab] = useState<TabId>('resumo')

  useEffect(() => {
    if (!membro) return
    setTab('resumo')
  }, [membro?.id])

  useEffect(() => {
    if (!membro) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [membro, onClose])

  const checks = membro ? checklistCadastro(membro) : []
  const docs = membro ? checklistDocumentos(membro) : []
  const docsPendentes = docs.filter((d) => !d.ok).length
  const cadastroPendente = checks.filter((c) => c.obrigatorio && !c.ok).length

  const tabs: {
    id: TabId
    label: string
    badge?: number
    hide?: boolean
  }[] = [
    { id: 'resumo', label: 'Resumo' },
    {
      id: 'cadastro',
      label: 'Cadastro',
      badge: membro?.isSocio && cadastroPendente > 0 ? cadastroPendente : undefined,
    },
    {
      id: 'documentos',
      label: 'Documentos',
      badge: membro?.isSocio && docsPendentes > 0 ? docsPendentes : undefined,
      hide: membro ? !membro.isSocio : false,
    },
    {
      id: 'associacao',
      label: 'Associação',
      hide: membro ? !membro.isSocio : false,
    },
    { id: 'operacao', label: 'Operação' },
  ]

  return (
    <AnimatePresence>
      {membro && (
        <m.div
          key={membro.id}
          variants={lightboxBackdrop}
          initial="hidden"
          animate="show"
          exit="exit"
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          role="presentation"
          onClick={onClose}
        >
          <m.div
            variants={lightboxContent}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={springGentle}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`membro-detalhe-titulo-${membro.id}`}
            className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho sticky */}
            <div className="shrink-0 border-b border-[rgb(var(--border))]">
              <div className="flex items-start justify-between gap-3 px-4 py-4 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  {membro.avatarUrl ? (
                    canOptimizeImageUrl(membro.avatarUrl) ? (
                      <Image
                        src={membro.avatarUrl}
                        alt=""
                        width={44}
                        height={44}
                        className="h-11 w-11 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={membro.avatarUrl}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded-full object-cover"
                      />
                    )
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-primary)_/_0.14)] text-sm font-bold text-[rgb(var(--color-primary-fg))]">
                      {membro.inicial}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h2
                      id={`membro-detalhe-titulo-${membro.id}`}
                      className="truncate text-base font-semibold text-[rgb(var(--foreground))]"
                    >
                      {membro.nome}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-[rgb(var(--foreground-muted))]">
                        {membro.tipo}
                        {membro.numeroAssociado ? ` · nº ${membro.numeroAssociado}` : ''}
                      </span>
                      <StatusBadge dominio="membro" status={membro.status} />
                      {membro.adimplente === false && (
                        <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-800 dark:bg-red-900 dark:text-red-200">
                          Inadimplente
                        </span>
                      )}
                      {membro.espelhado && (
                        <span className="rounded-md bg-[rgb(var(--background-subtle))] px-1.5 py-0.5 text-[11px] font-medium text-[rgb(var(--foreground-muted))]">
                          {membro.status === 'PENDENTE'
                            ? membro.aprovadoNaUnidadeNome?.trim()
                              ? `Solicitação via ${membro.aprovadoNaUnidadeNome.trim()}`
                              : 'Espelho da Sede'
                            : membro.aprovadoPorNome?.trim()
                              ? `Analisada por ${membro.aprovadoPorNome.trim()}${
                                  membro.aprovadoEmLabel?.trim()
                                    ? ` em ${membro.aprovadoEmLabel.trim()}`
                                    : ''
                                }`
                              : membro.aprovadoNaUnidadeNome?.trim()
                                ? `Aprovado via ${membro.aprovadoNaUnidadeNome.trim()}`
                                : 'Espelho da Sede'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Fechar"
                  className="shrink-0 rounded-lg p-1.5 text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div
                className="app-scrollbar-none flex gap-1 overflow-x-auto px-4 pb-3 sm:px-5"
                role="tablist"
                aria-label="Seções do cadastro"
              >
                {tabs
                  .filter((t) => !t.hide)
                  .map((item) => {
                    const active = tab === item.id
                    return (
                      <m.button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        whileTap={{ scale: 0.97 }}
                        transition={springSnappy}
                        onClick={() => setTab(item.id)}
                        className={[
                          'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors',
                          active
                            ? 'bg-[rgb(var(--color-primary)_/_0.14)] font-semibold text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.4)]'
                            : 'font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
                        ].join(' ')}
                      >
                        {item.label}
                        {item.badge != null && item.badge > 0 && (
                          <span
                            className={[
                              'rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                              active
                                ? 'bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))]'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
                            ].join(' ')}
                          >
                            {item.badge}
                          </span>
                        )}
                      </m.button>
                    )
                  })}
              </div>
            </div>

            {/* Corpo */}
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              {tab === 'resumo' && (
                <TabResumo
                  membro={membro}
                  checks={checks}
                  docsFaltando={docsPendentes}
                  onGo={setTab}
                />
              )}
              {tab === 'cadastro' && <TabCadastro membro={membro} />}
              {tab === 'documentos' && <TabDocumentos membro={membro} docs={docs} />}
              {tab === 'associacao' && <TabAssociacao membro={membro} />}
              {tab === 'operacao' && <TabOperacao membro={membro} />}
            </div>

            {/* Rodapé */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[rgb(var(--border))] px-4 py-3 sm:px-5">
              <Link
                href={`/admin/membros/${membro.id}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
              >
                Editar cadastro / unidade
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
              <MemberActions
                membroId={membro.id}
                status={membro.status}
                departamentoNome={membro.departamentoNome}
                espelhado={membro.espelhado}
                aprovadoNaUnidadeNome={membro.aprovadoNaUnidadeNome}
                aprovadoPorNome={membro.aprovadoPorNome}
                aprovadoEmLabel={membro.aprovadoEmLabel}
              />
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
