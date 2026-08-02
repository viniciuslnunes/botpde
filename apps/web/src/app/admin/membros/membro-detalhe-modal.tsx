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
  XCircle,
} from 'lucide-react'
import { labelPontoReprovacao, PONTOS_REPROVACAO } from '@torcida/types'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'
import { StatusBadge } from '@/components/admin/ui'
import { MemberActions } from '@/components/admin/member-actions'
import {
  lightboxBackdrop,
  lightboxContent,
  springGentle,
  springSnappy,
} from '@/lib/motion-presets'
import { TabHistorico } from './membro-historico-tab'
import { TabAcesso } from './membro-acesso-tab'
import type { AdminMembroItem } from './admin-membro-item'
import {
  checklistCompletudeCadastro,
  checklistCompletudeDocumentos,
  preenchidoCompletude,
  type CompletudeItem,
} from '@/lib/completude-cadastro-socio'

type TabId =
  | 'resumo'
  | 'reprovacao'
  | 'cadastro'
  | 'documentos'
  | 'associacao'
  | 'operacao'
  | 'acessos'
  | 'historico'

/** Aba onde cada ponto do catálogo é exibido — usada para o badge vermelho. */
const TAB_DO_PONTO: Record<string, string> = Object.fromEntries(
  (PONTOS_REPROVACAO as { id: string; tab: string }[]).map((p) => [p.id, p.tab]),
)

function Campo({
  label,
  value,
  reprovado,
}: {
  label: string
  value: ReactNode
  /** Ponto apontado na reprovação: rótulo e valor destacados em vermelho. */
  reprovado?: boolean
}) {
  const vazio =
    value === null ||
    value === undefined ||
    value === '' ||
    (typeof value === 'string' && value.trim() === '')
  return (
    <div
      className={
        reprovado
          ? 'min-w-0 rounded-lg border border-red-300 bg-red-50 px-2 py-1.5 dark:border-red-900 dark:bg-red-950/50'
          : 'min-w-0'
      }
    >
      <dt
        className={[
          'flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide',
          reprovado
            ? 'text-red-700 dark:text-red-300'
            : 'text-[rgb(var(--foreground-muted))]',
        ].join(' ')}
      >
        {reprovado && <XCircle className="h-3 w-3 shrink-0" aria-hidden />}
        {label}
        {reprovado && <span className="sr-only">— apontado na reprovação</span>}
      </dt>
      <dd
        className={[
          'mt-0.5 break-words text-sm',
          reprovado ? 'text-red-900 dark:text-red-100' : 'text-[rgb(var(--foreground))]',
        ].join(' ')}
      >
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
  return preenchidoCompletude(v)
}

type CheckItem = CompletudeItem & {
  /** Apontado como errado na reprovação — vence o `ok` na hora de renderizar. */
  reprovado?: boolean
}

function marcarReprovados(itens: CheckItem[], reprovados: Set<string>): CheckItem[] {
  if (reprovados.size === 0) return itens
  return itens.map((i) => (reprovados.has(i.id) ? { ...i, reprovado: true } : i))
}

function checklistCadastro(m: AdminMembroItem): CheckItem[] {
  return checklistCompletudeCadastro({
    isSocio: m.isSocio,
    idade: m.idade,
    numeroAssociado: m.numeroAssociado,
    cpf: m.cpf,
    rg: m.rg,
    dataNascimento: m.dataNascimentoLabel,
    logradouro: m.logradouro,
    bairro: m.bairro,
    cep: m.cep,
    uf: m.uf,
    termoResponsabilidadeAceitoEm: m.termoResponsabilidadeAceitoLabel,
    imagemProva: m.imagemProva,
    responsavelNome: m.responsavelNome,
    responsavelDocumento: m.responsavelDocumento,
    autorizacaoMenorAceitaEm: m.autorizacaoMenorAceitaLabel,
  })
}

function checklistDocumentos(m: AdminMembroItem): CheckItem[] {
  // Admin sempre lista a aba Documentos para sócio (mesmo se a torcida
  // desligou a exigência no onboarding — a ficha ainda mostra o estado).
  return checklistCompletudeDocumentos(
    {
      isSocio: m.isSocio,
      imagemProva: m.imagemProva,
      fotoDocumentoUrl: m.fotoDocumentoUrl,
      comprovanteResidenciaUrl: m.comprovanteResidenciaUrl,
    },
    true,
  )
}

function Checklist({ itens, titulo }: { itens: CheckItem[]; titulo?: string }) {
  if (itens.length === 0) return null
  const faltando = itens.filter((i) => i.obrigatorio && !i.ok)
  const reprovados = itens.filter((i) => i.reprovado)
  return (
    <div className="space-y-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.55)] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          {titulo ?? 'Completude do cadastro'}
        </p>
        <p className="text-xs text-[rgb(var(--foreground-muted))]">
          {itens.filter((i) => i.ok).length}/{itens.length}
          {faltando.length > 0 ? ` · ${faltando.length} obrigatório(s) faltando` : ' · completo'}
          {reprovados.length > 0 ? (
            <span className="font-medium text-red-600 dark:text-red-400">
              {' '}
              · {reprovados.length} reprovado(s)
            </span>
          ) : null}
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {itens.map((item) => (
          <li
            key={item.id}
            className={[
              'flex items-start gap-2 rounded-md text-sm',
              item.reprovado
                ? 'bg-red-50 px-1.5 py-0.5 font-medium text-red-800 dark:bg-red-950/60 dark:text-red-200'
                : 'text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            {item.reprovado ? (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            ) : item.ok ? (
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
            <span
              className={
                item.reprovado ? '' : item.ok ? '' : 'text-[rgb(var(--foreground-muted))]'
              }
            >
              {item.label}
              {item.reprovado ? (
                <span className="text-[11px] font-normal"> · reprovado</span>
              ) : !item.obrigatorio && !item.ok ? (
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

function TabReprovacao({
  membro,
  onGo,
}: {
  membro: AdminMembroItem
  onGo: (tab: TabId) => void
}) {
  const rep = membro.reprovacao
  if (!rep) {
    const legado = membro.status === 'REPROVADO'
    return (
      <EmptyTab
        titulo={legado ? 'Reprovação sem laudo' : 'Sem reprovação registrada'}
        descricao={
          legado
            ? membro.ultimoMotivoReprovacao
              ? `Reprovação anterior à justificativa obrigatória. Motivo registrado na época: “${membro.ultimoMotivoReprovacao}”. Reverta para pendente e analise de novo para gerar o laudo completo.`
              : 'Esta solicitação foi reprovada antes da justificativa passar a ser obrigatória, então não há laudo. Reverta para pendente e analise de novo para registrar o motivo.'
            : 'Esta aba aparece quando a solicitação é reprovada com justificativa.'
        }
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/50">
        <div className="flex items-start gap-2.5">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-red-900 dark:text-red-100">
              {rep.categoriaLabel ?? 'Solicitação reprovada'}
            </p>
            <p className="whitespace-pre-line break-words text-sm text-red-900 dark:text-red-100">
              {rep.motivo}
            </p>
            <p className="text-xs text-red-700 dark:text-red-300">
              Reprovado por {rep.porNome ?? 'administrador'}
              {rep.emLabel ? ` em ${rep.emLabel}` : ''}
            </p>
          </div>
        </div>
      </div>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Etapas apontadas
        </h3>
        {rep.pontos.length === 0 ? (
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            Nenhum campo específico foi apontado — a recusa é sobre a solicitação como um
            todo.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {rep.pontos.map((ponto) => (
              <li key={ponto}>
                <button
                  type="button"
                  onClick={() => onGo((TAB_DO_PONTO[ponto] ?? 'cadastro') as TabId)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800 transition-colors hover:bg-red-200 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900"
                >
                  <XCircle className="h-3.5 w-3.5 shrink-0" />
                  {labelPontoReprovacao(ponto)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Secao titulo="Consequência">
        <Campo
          label="Reenvio pelo associado"
          value={
            rep.permiteReenvio
              ? 'Liberado — pode corrigir e voltar à fila'
              : 'Bloqueado — só volta à fila se um admin reverter'
          }
        />
        <Campo label="Notificação enviada" value="Sim, com a justificativa acima" />
      </Secao>

      <p className="text-xs text-[rgb(var(--foreground-muted))]">
        Para liberar uma nova análise sem esperar o reenvio, use <strong>Reverter</strong> no
        rodapé — isso apaga este registro de reprovação e devolve o cadastro à fila.
      </p>
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
  const rep = membro.reprovacao
  return (
    <div className="space-y-5">
      {rep && (
        <button
          type="button"
          onClick={() => onGo('reprovacao')}
          className="w-full rounded-xl border border-red-300 bg-red-50 p-3 text-left transition-colors hover:bg-red-100 dark:border-red-900 dark:bg-red-950/50 dark:hover:bg-red-950"
        >
          <span className="flex items-start gap-2">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-red-900 dark:text-red-100">
                Reprovado — {rep.categoriaLabel ?? 'ver detalhes'}
              </span>
              <span className="mt-0.5 line-clamp-2 block text-xs text-red-800 dark:text-red-200">
                {rep.motivo}
              </span>
              {rep.pontos.length > 0 && (
                <span className="mt-1 block text-xs font-medium text-red-700 dark:text-red-300">
                  {rep.pontos.length} etapa(s) apontada(s) ·{' '}
                  {rep.pontos.map((p) => labelPontoReprovacao(p)).join(', ')}
                </span>
              )}
            </span>
          </span>
        </button>
      )}

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
        <Campo
          label={membro.departamentoSedeNome ? 'Departamento aqui' : 'Departamento pretendido'}
          value={membro.departamentoNome}
        />
        {membro.departamentoSedeNome && (
          <Campo label="Departamento na sede" value={membro.departamentoSedeNome} />
        )}
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

function TabCadastro({ membro, rep }: { membro: AdminMembroItem; rep: Set<string> }) {
  return (
    <div className="space-y-6">
      <Secao titulo="Contato e identificação">
        <Campo label="Nome" value={membro.nome} reprovado={rep.has('nome')} />
        <Campo label="E-mail" value={membro.email} reprovado={rep.has('email')} />
        <Campo label="Telefone" value={membro.telefone} reprovado={rep.has('telefone')} />
        <Campo label="Idade" value={membro.idade} />
        {membro.isSocio && (
          <>
            <Campo
              label="Data de nascimento"
              value={membro.dataNascimentoLabel}
              reprovado={rep.has('nascimento')}
            />
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
            <Campo label="CPF" value={membro.cpf} reprovado={rep.has('cpf')} />
            <Campo label="RG" value={membro.rg} reprovado={rep.has('rg')} />
            <Campo label="Filiação" value={membro.filiacao} reprovado={rep.has('filiacao')} />
            <Campo label="Profissão" value={membro.profissao} />
            <Campo label="Escolaridade" value={membro.escolaridade} />
          </Secao>

          <Secao titulo="Endereço">
            <Campo
              label="Logradouro"
              value={membro.logradouro}
              reprovado={rep.has('logradouro')}
            />
            <Campo label="Número" value={membro.numero} reprovado={rep.has('numero')} />
            <Campo label="Bloco" value={membro.bloco} />
            <Campo label="Complemento" value={membro.complemento} />
            <Campo label="Bairro" value={membro.bairro} reprovado={rep.has('bairro')} />
            <Campo label="CEP" value={membro.cep} reprovado={rep.has('cep')} />
            <Campo label="Cidade" value={membro.cidade} reprovado={rep.has('cidade')} />
            <Campo label="UF" value={membro.uf} reprovado={rep.has('uf')} />
          </Secao>

          {(membro.responsavelNome ||
            membro.responsavelDocumento ||
            membro.autorizacaoMenorAceitaLabel ||
            rep.has('resp-nome') ||
            rep.has('resp-doc')) && (
            <Secao titulo="Responsável legal (menor de idade)">
              <Campo
                label="Nome do responsável"
                value={membro.responsavelNome}
                reprovado={rep.has('resp-nome')}
              />
              <Campo
                label="Documento do responsável"
                value={membro.responsavelDocumento}
                reprovado={rep.has('resp-doc')}
              />
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

function TabAssociacao({ membro, rep }: { membro: AdminMembroItem; rep: Set<string> }) {
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
        <Campo
          label="Nº de associado"
          value={membro.numeroAssociado}
          reprovado={rep.has('numeroAssociado')}
        />
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
          reprovado={rep.has('termo')}
        />
      </Secao>
      <p className="text-xs text-[rgb(var(--foreground-muted))]">
        Plano, cobranças e validade da carteirinha entram nesta aba na próxima iteração.
        Por enquanto use{' '}
        <Link
          href="/admin/financeiro/cobrancas"
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

function TabOperacao({ membro, rep }: { membro: AdminMembroItem; rep: Set<string> }) {
  return (
    <div className="space-y-6">
      <Secao titulo="Vínculo na torcida">
        <Campo label="Unidade" value={membro.sedeNome} reprovado={rep.has('unidade')} />
        <Campo
          label={membro.departamentoSedeNome ? 'Departamento aqui' : 'Departamento pretendido'}
          value={
            membro.departamentoNome
              ? membro.areaPendenteEfetivacao === true
                ? `${membro.departamentoNome} — pretendida, ainda não em vigor`
                : membro.areaPendenteEfetivacao === false
                  ? `${membro.departamentoNome} — em vigor`
                  : membro.departamentoNome
              : null
          }
          reprovado={rep.has('departamento')}
        />
        {/* Cada nível tem seus departamentos: quem entrou por uma unidade com
            portal próprio declara a área nos dois, com papéis independentes. */}
        {membro.departamentoSedeNome && (
          <Campo
            label="Departamento na sede"
            value={`${membro.departamentoSedeNome} — vale quando a sede aprovar`}
            reprovado={rep.has('departamento')}
          />
        )}
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
        <Campo
          label="Último motivo de reprovação"
          value={membro.reprovacao?.motivo ?? membro.ultimoMotivoReprovacao}
        />
      </Secao>
    </div>
  )
}

export function MembroDetalheModal({
  membro,
  onClose,
  podeGerirAcessos = false,
  podeBloquear = false,
  bloqueado = false,
  podeApagar = false,
}: {
  membro: AdminMembroItem | null
  onClose: () => void
  /** `members:block` do admin logado — libera bloquear/desbloquear no card. */
  podeBloquear?: boolean
  /** Já bloqueado neste tenant (ou herdado da Sede). */
  bloqueado?: boolean
  /** `members:purge` do admin logado — libera apagar de vez. */
  podeApagar?: boolean
  /**
   * `roles:manage` do admin logado — resolvido no servidor pela página que
   * monta a lista. Só esconde a aba; o gate de verdade está em
   * `carregarAcessoMembro` e em `salvarAcessoUsuario`.
   */
  podeGerirAcessos?: boolean
}) {
  const [tab, setTab] = useState<TabId>('resumo')

  // Estado derivado de props (padrão do React: ajuste durante o render, não em
  // efeito). Trocar de membro volta ao Resumo; uma reprovação que acabou de
  // acontecer com o card aberto leva direto ao laudo.
  const temReprovacao = !!membro?.reprovacao
  const [contexto, setContexto] = useState({ id: membro?.id, temReprovacao })
  if (contexto.id !== membro?.id || contexto.temReprovacao !== temReprovacao) {
    const trocouMembro = contexto.id !== membro?.id
    setContexto({ id: membro?.id, temReprovacao })
    if (!trocouMembro && temReprovacao) setTab('reprovacao')
    else if (trocouMembro) setTab('resumo')
  }

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

  const pontosReprovados = new Set(membro?.reprovacao?.pontos ?? [])
  const checks = membro ? marcarReprovados(checklistCadastro(membro), pontosReprovados) : []
  const docs = membro ? marcarReprovados(checklistDocumentos(membro), pontosReprovados) : []
  const docsPendentes = docs.filter((d) => !d.ok).length
  const cadastroPendente = checks.filter((c) => c.obrigatorio && !c.ok).length
  const reprovadosNaTab = (alvo: TabId) =>
    [...pontosReprovados].filter((p) => TAB_DO_PONTO[p] === alvo).length

  const tabs: {
    id: TabId
    label: string
    badge?: number
    /** Badge de reprovação (vermelho) tem prioridade sobre o de pendência. */
    badgeReprovado?: number
    hide?: boolean
  }[] = [
    { id: 'resumo', label: 'Resumo' },
    {
      id: 'reprovacao',
      label: 'Reprovação',
      // Reprovados antigos (antes da justificativa obrigatória) não têm laudo;
      // a aba continua visível para explicar a ausência em vez de sumir.
      hide: !membro?.reprovacao && membro?.status !== 'REPROVADO',
    },
    {
      id: 'cadastro',
      label: 'Cadastro',
      badge: membro?.isSocio && cadastroPendente > 0 ? cadastroPendente : undefined,
      badgeReprovado: reprovadosNaTab('cadastro') || undefined,
    },
    {
      id: 'documentos',
      label: 'Documentos',
      badge: membro?.isSocio && docsPendentes > 0 ? docsPendentes : undefined,
      badgeReprovado: reprovadosNaTab('documentos') || undefined,
      hide: membro ? !membro.isSocio : false,
    },
    {
      id: 'associacao',
      label: 'Associação',
      badgeReprovado: reprovadosNaTab('associacao') || undefined,
      hide: membro ? !membro.isSocio : false,
    },
    {
      id: 'operacao',
      label: 'Operação',
      badgeReprovado: reprovadosNaTab('operacao') || undefined,
    },
    {
      id: 'acessos',
      label: 'Acessos',
      hide: !podeGerirAcessos,
    },
    { id: 'historico', label: 'Histórico' },
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
            className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-xl sm:rounded-2xl"
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
                className="app-scrollbar-none flex gap-1 overflow-x-auto px-4 pb-3 sm:flex-wrap sm:overflow-x-visible sm:px-5"
                role="tablist"
                aria-label="Seções do cadastro"
              >
                {tabs
                  .filter((t) => !t.hide)
                  .map((item) => {
                    const active = tab === item.id
                    const critica = item.id === 'reprovacao' || !!item.badgeReprovado
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
                          'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors',
                          active
                            ? critica
                              ? 'bg-red-100 font-semibold text-red-800 ring-1 ring-inset ring-red-400 dark:bg-red-950 dark:text-red-200 dark:ring-red-800'
                              : 'bg-[rgb(var(--color-primary)_/_0.14)] font-semibold text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.4)]'
                            : critica
                              ? 'font-semibold text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/60'
                              : 'font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
                        ].join(' ')}
                      >
                        {item.id === 'reprovacao' && (
                          <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        )}
                        {item.label}
                        {item.badgeReprovado ? (
                          <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                            {item.badgeReprovado}
                          </span>
                        ) : item.badge != null && item.badge > 0 ? (
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
                        ) : null}
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
              {tab === 'reprovacao' && <TabReprovacao membro={membro} onGo={setTab} />}
              {tab === 'cadastro' && <TabCadastro membro={membro} rep={pontosReprovados} />}
              {tab === 'documentos' && <TabDocumentos membro={membro} docs={docs} />}
              {tab === 'associacao' && <TabAssociacao membro={membro} rep={pontosReprovados} />}
              {tab === 'operacao' && <TabOperacao membro={membro} rep={pontosReprovados} />}
              {tab === 'acessos' && podeGerirAcessos && (
                <TabAcesso key={membro.id} membroId={membro.id} />
              )}
              {tab === 'historico' && <TabHistorico key={membro.id} membroId={membro.id} />}
            </div>

            {/* Rodapé */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[rgb(var(--border))] px-4 py-3 sm:px-5">
              <Link
                href={`/admin/torcedores/${membro.id}`}
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
                nomeMembro={membro.nome}
                isSocio={membro.isSocio}
                areaPendenteEfetivacao={membro.areaPendenteEfetivacao}
                podeBloquear={podeBloquear}
                userId={membro.userId}
                bloqueado={bloqueado}
                podeApagar={podeApagar}
                desligado={!!membro.desligadoEmLabel}
                pontosIncompletos={[
                  ...new Set(
                    [...checks, ...docs].filter((c) => c.obrigatorio && !c.ok).map((c) => c.id),
                  ),
                ]}
              />
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
