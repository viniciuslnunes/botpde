'use client'

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { m, AnimatePresence } from 'motion/react'
import {
  CheckCircle2,
  IdCard,
  Lock,
  ShieldCheck,
} from 'lucide-react'
import { toast } from '@torcida/ui'
import {
  maskRg,
  maskTelefone,
  montarOpcoesPlanoOnboarding,
  normalizarCpf,
  validarCpfDigitos,
  validarRg,
} from '@torcida/types'
import { ImageDropZone } from '@/components/media/image-drop-zone'
import { DatePicker } from '@/components/ui/date-picker'
import { CompletudeChecklist } from '@/components/portal/completude-checklist'
import { uploadMediaToCloudinary } from '@/lib/cloudinary-upload'
import { buscarEnderecoPorCep } from '@/lib/viacep'
import { UFS_BRASIL } from '@/lib/ufs-brasil'
import { fadeUp, springGentle, springSnappy } from '@/lib/motion-presets'
import {
  resumirCompletudeCadastroSocio,
  type CompletudeItemId,
} from '@/lib/completude-cadastro-socio'
import {
  completarDadosAssociacao,
  type CompletarAssociacaoState,
} from './actions'
import type { NivelVinculoView } from '@/lib/carteirinha-vinculo'

export type ValoresAssociacaoForm = {
  numeroAssociado: string
  cpf: string
  rg: string
  dataNascimento: string
  telefone: string
  cidade: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cep: string
  uf: string
  imagemProva: string
  fotoDocumentoUrl: string
  comprovanteResidenciaUrl: string
  responsavelNome: string
  responsavelDocumento: string
  dataExpedicaoIso: string
  periodicidadeAtual: string
  planoAssociacaoId: string
  termoAceito: boolean
  anosSocio: string
}

export type OperacaoView = {
  unidadeNome: string | null
  departamentoNome: string | null
  /** Um nível na raiz; dois no Caso B (unidade × sede, papéis independentes). */
  niveis: NivelVinculoView[]
  aprovadoEmLabel: string | null
  adimplente: boolean
  carteirinhaValidadeLabel: string | null
  carteirinhaNumeroLabel: string | null
  carteirinhaEmitidaEmLabel: string | null
  carteirinhaNome: string | null
  statusLabel: string
}

type TabId = 'resumo' | 'cadastro' | 'documentos' | 'associacao' | 'operacao'

type Props = {
  tenantId: string
  valores: ValoresAssociacaoForm
  periodicidades: string[]
  planos?: { id: string; nome: string; valor: number; periodicidade: string }[]
  exigirDocumentos: boolean
  temCarteirinha: boolean
  prefillOrigemNome?: string | null
  operacao: OperacaoView
  /** Aba inicial (carteirinha: resumo quando a ficha já está em dia). */
  tabInicial?: TabId
  /**
   * Embutido na carteirinha: a ficha é permanente (ver/editar a qualquer
   * momento), não um fluxo de pendência avulso.
   */
  embutido?: boolean
}

const TAB_DO_CAMPO: Record<CompletudeItemId, TabId> = {
  numeroAssociado: 'cadastro',
  cpf: 'cadastro',
  rg: 'cadastro',
  nascimento: 'cadastro',
  logradouro: 'cadastro',
  bairro: 'cadastro',
  cep: 'cadastro',
  uf: 'cadastro',
  'resp-nome': 'cadastro',
  'resp-doc': 'cadastro',
  termo: 'documentos',
  prova: 'documentos',
  documento: 'documentos',
  residencia: 'documentos',
  dataExpedicaoCarteirinha: 'associacao',
  periodicidadePretendida: 'associacao',
}

const initial: CompletarAssociacaoState = {}

const inputClass =
  'w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3.5 py-2.5 text-sm text-[rgb(var(--foreground))] shadow-[inset_0_1px_0_rgb(var(--foreground)_/_0.03)] transition-[border-color,box-shadow] placeholder:text-[rgb(var(--foreground-muted))] focus-visible:border-[rgb(var(--color-primary)_/_0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary)_/_0.28)]'

function maskCep(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

function maskCpf(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/** Idade a partir de YYYY-MM-DD (mesmo padrão do onboarding). */
function calcularIdadeDeInput(isoDate: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim())
  if (!m) return null
  const nascimento = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const hoje = new Date()
  let idade = hoje.getFullYear() - nascimento.getFullYear()
  const aindaNaoFezAniversario =
    hoje.getMonth() < nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() < nascimento.getDate())
  if (aindaNaoFezAniversario) idade -= 1
  return idade
}

function UploadDocumento({
  name,
  label,
  hint,
  value,
  tenantId,
  onChange,
}: {
  name: string
  label: string
  hint?: string
  value: string
  tenantId: string
  onChange: (url: string) => void
}) {
  const [busy, start] = useTransition()
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-[rgb(var(--foreground))]">{label}</span>
      {hint ? (
        <span className="block text-xs leading-relaxed text-[rgb(var(--foreground-muted))]">
          {hint}
        </span>
      ) : null}
      <input type="hidden" name={name} value={value} />
      <ImageDropZone
        layout="split"
        busy={busy}
        cameraLabel="Tirar foto"
        file={
          value
            ? { name: 'arquivo.jpg', status: busy ? 'uploading' : 'done', previewUrl: value }
            : null
        }
        onClear={value ? () => onChange('') : undefined}
        onFile={(file) => {
          start(async () => {
            try {
              const url = await uploadMediaToCloudinary(file, undefined, 'cadastro', tenantId)
              onChange(url)
              toast.success('Arquivo enviado.')
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Falha no upload.')
            }
          })
        }}
      />
    </div>
  )
}

function CampoTexto({
  id,
  name,
  label,
  value,
  onChange,
  hint,
  inputMode,
  maxLength,
  type = 'text',
  invalid,
}: {
  id: string
  name: string
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  maxLength?: number
  type?: string
  invalid?: boolean
}) {
  return (
    <label htmlFor={id} className="block space-y-1.5">
      <span className="block text-sm font-medium text-[rgb(var(--foreground))]">{label}</span>
      {hint ? (
        <span className="block text-xs leading-relaxed text-[rgb(var(--foreground-muted))]">
          {hint}
        </span>
      ) : null}
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        maxLength={maxLength}
        aria-invalid={invalid || undefined}
        className={[
          inputClass,
          invalid
            ? 'border-amber-500/55 focus-visible:border-amber-500/70 focus-visible:ring-amber-500/25'
            : '',
        ].join(' ')}
      />
    </label>
  )
}

function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string
  descricao?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <div className="border-b border-[rgb(var(--border))] pb-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[rgb(var(--foreground-muted))]">
          {titulo}
        </h2>
        {descricao ? (
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
            {descricao}
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function DadoLeitura({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[rgb(var(--border)_/_0.7)] bg-[rgb(var(--background)_/_0.45)] px-3.5 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[rgb(var(--foreground-muted))]">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-[rgb(var(--foreground))]">{value || '—'}</p>
    </div>
  )
}

function VinculoNiveis({ niveis }: { niveis: NivelVinculoView[] }) {
  if (niveis.length === 0) return null
  const dual = niveis.length > 1
  return (
    <div className="sm:col-span-2 grid grid-cols-1 gap-3">
      {niveis.map((n) => (
        <article
          key={n.nivel}
          className="rounded-xl border border-[rgb(var(--border)_/_0.7)] bg-[rgb(var(--background)_/_0.45)] px-3.5 py-3"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[rgb(var(--foreground-muted))]">
            {n.rotulo}
          </p>
          <p className="mt-1 text-sm font-semibold text-[rgb(var(--foreground))]">{n.localNome}</p>
          <p className="mt-1 text-sm leading-relaxed text-[rgb(var(--foreground))]">{n.atuacao}</p>
          {dual ? (
            <p className="mt-1 text-xs leading-relaxed text-[rgb(var(--foreground-muted))]">
              {n.situacaoLabel}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  )
}

function ProgressoBarra({ ok, total }: { ok: number; total: number }) {
  const pct = total > 0 ? Math.round((ok / total) * 100) : 0
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-[rgb(var(--foreground-muted))]">Progresso da ficha</span>
        <span className="tabular-nums text-[rgb(var(--foreground))]">
          {ok}/{total}
          <span className="text-[rgb(var(--foreground-muted))]"> · {pct}%</span>
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-[rgb(var(--background-subtle))]"
        role="progressbar"
        aria-valuenow={ok}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <m.div
          className="h-full rounded-full bg-[rgb(var(--color-primary))]"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={springGentle}
        />
      </div>
    </div>
  )
}

export function AssociacaoAtualizarForm({
  tenantId,
  valores,
  periodicidades,
  planos = [],
  exigirDocumentos,
  temCarteirinha,
  prefillOrigemNome,
  operacao,
  tabInicial = 'cadastro',
  embutido = false,
}: Props) {
  const router = useRouter()
  const [state, action, pending] = useActionState(completarDadosAssociacao, initial)
  const [tab, setTab] = useState<TabId>(tabInicial)

  const [numeroAssociado, setNumeroAssociado] = useState(valores.numeroAssociado)
  const [cpf, setCpf] = useState(valores.cpf ? maskCpf(valores.cpf) : '')
  const [rg, setRg] = useState(valores.rg ? maskRg(valores.rg) : '')
  const [dataNascimento, setDataNascimento] = useState(valores.dataNascimento)
  const [telefone, setTelefone] = useState(
    valores.telefone ? maskTelefone(valores.telefone) || valores.telefone : '',
  )
  const [cidade, setCidade] = useState(valores.cidade)
  const [logradouro, setLogradouro] = useState(valores.logradouro)
  const [numero, setNumero] = useState(valores.numero)
  const [complemento, setComplemento] = useState(valores.complemento)
  const [bairro, setBairro] = useState(valores.bairro)
  const [cep, setCep] = useState(valores.cep ? maskCep(valores.cep) : '')
  const [uf, setUf] = useState(valores.uf)
  const [responsavelNome, setResponsavelNome] = useState(valores.responsavelNome)
  const [responsavelDocumento, setResponsavelDocumento] = useState(
    valores.responsavelDocumento,
  )
  const [termo, setTermo] = useState(valores.termoAceito)
  const [prova, setProva] = useState(valores.imagemProva)
  const [doc, setDoc] = useState(valores.fotoDocumentoUrl)
  const [residencia, setResidencia] = useState(valores.comprovanteResidenciaUrl)
  const [expedicao, setExpedicao] = useState(valores.dataExpedicaoIso)
  const [anosSocio, setAnosSocio] = useState(valores.anosSocio)
  const opcoesPlano = useMemo(
    () => montarOpcoesPlanoOnboarding(periodicidades, planos),
    [periodicidades, planos],
  )
  const [chavePlano, setChavePlano] = useState(() => {
    if (valores.planoAssociacaoId) {
      const hit = `plano:${valores.planoAssociacaoId}`
      if (opcoesPlano.some((o) => o.chave === hit)) return hit
    }
    if (valores.periodicidadeAtual) {
      const doCiclo = opcoesPlano.filter((o) => o.periodicidade === valores.periodicidadeAtual)
      if (doCiclo.length === 1) return doCiclo[0]!.chave
      const per = `per:${valores.periodicidadeAtual}`
      if (opcoesPlano.some((o) => o.chave === per)) return per
    }
    return opcoesPlano[0]?.chave ?? ''
  })
  const opcaoPlano = opcoesPlano.find((o) => o.chave === chavePlano)
  const periodicidade =
    opcaoPlano?.periodicidade ?? (valores.periodicidadeAtual || '')
  const planoAssociacaoId = opcaoPlano?.planoAssociacaoId ?? ''
  const [cepBusy, startCep] = useTransition()

  const resumo = useMemo(() => {
    const idade = dataNascimento ? calcularIdadeDeInput(dataNascimento) : null
    return resumirCompletudeCadastroSocio(
      {
        isSocio: true,
        idade,
        numeroAssociado: numeroAssociado || null,
        cpf: cpf || null,
        rg: rg || null,
        dataNascimento: dataNascimento || null,
        logradouro: logradouro || null,
        bairro: bairro || null,
        cep: cep || null,
        uf: uf || null,
        termoResponsabilidadeAceitoEm: termo ? new Date() : null,
        imagemProva: prova || null,
        responsavelNome: responsavelNome || null,
        responsavelDocumento: responsavelDocumento || null,
        fotoDocumentoUrl: doc || null,
        comprovanteResidenciaUrl: residencia || null,
        dataExpedicaoCarteirinha: expedicao || null,
        periodicidadePretendida: periodicidade || null,
      },
      { exigirDocumentos, temCarteirinha },
    )
  }, [
    numeroAssociado,
    cpf,
    rg,
    dataNascimento,
    logradouro,
    bairro,
    cep,
    uf,
    termo,
    prova,
    doc,
    residencia,
    responsavelNome,
    responsavelDocumento,
    expedicao,
    periodicidade,
    exigirDocumentos,
    temCarteirinha,
  ])

  const formatosOk = useMemo(() => {
    const cpfN = normalizarCpf(cpf)
    if (!cpfN || !validarCpfDigitos(cpfN)) return false
    if (!validarRg(rg)) return false
    if (!/^\d+$/.test(numeroAssociado.trim())) return false
    if (cep.replace(/\D/g, '').length !== 8) return false
    if (!dataNascimento || calcularIdadeDeInput(dataNascimento) == null) return false
    if (!temCarteirinha && !expedicao) return false
    return true
  }, [cpf, rg, numeroAssociado, cep, dataNascimento, temCarteirinha, expedicao])

  const podeSalvar = resumo.completo && formatosOk && !pending
  const niveis = operacao.niveis ?? []

  const badgeCadastro = useMemo(() => {
    const ids: CompletudeItemId[] = [
      'numeroAssociado',
      'cpf',
      'rg',
      'nascimento',
      'logradouro',
      'bairro',
      'cep',
      'uf',
      'resp-nome',
      'resp-doc',
    ]
    return resumo.itens.filter((i) => ids.includes(i.id) && i.obrigatorio && !i.ok).length
  }, [resumo.itens])

  const badgeDocumentos = useMemo(() => {
    const ids: CompletudeItemId[] = ['termo', 'prova', 'documento', 'residencia']
    return resumo.itens.filter((i) => ids.includes(i.id) && i.obrigatorio && !i.ok).length
  }, [resumo.itens])

  const badgeAssociacao = useMemo(() => {
    const ids: CompletudeItemId[] = ['dataExpedicaoCarteirinha', 'periodicidadePretendida']
    return resumo.itens.filter((i) => ids.includes(i.id) && i.obrigatorio && !i.ok).length
  }, [resumo.itens])

  const faltandoIds = useMemo(
    () => new Set(resumo.faltando.map((f) => f.id)),
    [resumo.faltando],
  )

  useEffect(() => {
    if (state.ok === undefined && !state.message) return
    if (!state.ok) {
      if (state.message) toast.error(state.message)
      return
    }
    if (state.emitida) {
      toast.success(state.message ?? 'Carteirinha emitida.')
      if (!embutido) router.push('/portal/carteirinha')
      router.refresh()
      return
    }
    toast.success(state.message ?? 'Cadastro completo.')
    router.refresh()
  }, [state, router, embutido])

  function focarCampo(id: CompletudeItemId) {
    const destino = TAB_DO_CAMPO[id]
    setTab(destino)
    requestAnimationFrame(() => {
      const el = document.getElementById(`campo-${id}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const input = el?.querySelector('input, select, textarea')
      if (input instanceof HTMLElement) input.focus()
    })
  }

  function onCepChange(raw: string) {
    const masked = maskCep(raw)
    setCep(masked)
    const digitos = masked.replace(/\D/g, '')
    if (digitos.length !== 8) return
    startCep(async () => {
      const end = await buscarEnderecoPorCep(digitos)
      if (!end) return
      if (end.logradouro) setLogradouro(end.logradouro)
      if (end.bairro) setBairro(end.bairro)
      if (end.uf) setUf(end.uf.toUpperCase())
      if (end.localidade) setCidade(end.localidade)
    })
  }

  const idadeAtual = dataNascimento ? calcularIdadeDeInput(dataNascimento) : null
  const mostraResponsavel =
    (idadeAtual != null && idadeAtual < 18) ||
    Boolean(responsavelNome || responsavelDocumento)

  const tabs: { id: TabId; label: string; badge?: number }[] = [
    { id: 'resumo', label: 'Resumo' },
    { id: 'cadastro', label: 'Cadastro', badge: badgeCadastro || undefined },
    { id: 'documentos', label: 'Documentos', badge: badgeDocumentos || undefined },
    {
      id: 'associacao',
      label: 'Associação',
      badge: badgeAssociacao || undefined,
    },
    { id: 'operacao', label: 'Operação' },
  ]

  const hintSalvar = !resumo.completo
    ? `Preencha os ${resumo.faltando.length} campo(s) obrigatório(s) para liberar o salvamento.`
    : !formatosOk
      ? 'Confira CPF, RG, CEP e datas — algum valor ainda está inválido.'
      : null

  return (
    <form action={action} className="flex flex-col gap-5">
      {prefillOrigemNome ? (
        <p className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background)_/_0.55)] px-3.5 py-2.5 text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
          Preenchemos com o que já existia em{' '}
          <strong className="font-semibold text-[rgb(var(--foreground))]">
            {prefillOrigemNome}
          </strong>
          .
          <br />
          Confira e complete o que faltar nesta unidade.
        </p>
      ) : null}

      <div
        className={[
          'flex gap-3 rounded-2xl border p-3.5 sm:p-4',
          resumo.completo
            ? 'border-[rgb(var(--color-success)_/_0.35)] bg-[rgb(var(--color-success)_/_0.08)]'
            : 'border-[rgb(var(--color-primary)_/_0.3)] bg-[linear-gradient(135deg,rgb(var(--color-primary)_/_0.12),rgb(var(--background)_/_0.2))]',
        ].join(' ')}
      >
        <div
          className={[
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            resumo.completo
              ? 'bg-[rgb(var(--color-success)_/_0.18)] text-[rgb(var(--color-success-fg))]'
              : 'bg-[rgb(var(--color-primary)_/_0.18)] text-[rgb(var(--color-primary-fg))]',
          ].join(' ')}
        >
          {resumo.completo ? (
            <CheckCircle2 className="h-4 w-4" aria-hidden />
          ) : (
            <ShieldCheck className="h-4 w-4" aria-hidden />
          )}
        </div>
        <div className="min-w-0 space-y-1 text-sm leading-relaxed">
          <p className="font-semibold text-[rgb(var(--foreground))]">
            {resumo.completo ? 'Cadastro em dia' : 'Por que atualizar'}
          </p>
          <p className="text-[rgb(var(--foreground-muted))]">
            {resumo.completo
              ? 'Ficha completa. Você pode revisar ou alterar os dados a qualquer momento — a carteirinha e a vigência usam o que está aqui.'
              : temCarteirinha
                ? 'Completar a ficha garante que a torcida confirme sua vigência corretamente. Enquanto faltar dado obrigatório, o cadastro não regulariza.'
                : 'Expedição e plano definem a validade da carteirinha. Completar emite/regulariza a vigência.'}
          </p>
        </div>
      </div>

      <ProgressoBarra ok={resumo.okCount} total={resumo.total} />

      {state.message && !state.ok ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm leading-relaxed text-red-800 dark:text-red-200">
          {state.message}
        </p>
      ) : null}

      <div className="border-b border-[rgb(var(--border))]">
        <div
          className="app-scrollbar-none -mb-px flex gap-0.5 overflow-x-auto"
          role="tablist"
          aria-label="Seções do cadastro"
        >
          {tabs.map((item) => {
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
                  'relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm transition-colors',
                  active
                    ? 'font-semibold text-[rgb(var(--color-primary-fg))]'
                    : 'font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
                ].join(' ')}
              >
                {item.label}
                {item.badge != null && item.badge > 0 ? (
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
                {active ? (
                  <m.span
                    layoutId="associacao-tab-underline"
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[rgb(var(--color-primary))]"
                    transition={springSnappy}
                  />
                ) : null}
              </m.button>
            )
          })}
        </div>
      </div>

      <div className="min-h-[18rem]">
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={tab}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            exit="hidden"
            transition={{ duration: 0.18 }}
            className="space-y-6"
          >
            {tab === 'resumo' ? (
              <div className="space-y-5">
                <CompletudeChecklist itens={resumo.itens} onFocarCampo={focarCampo} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <DadoLeitura label="Status" value={operacao.statusLabel} />
                  <DadoLeitura
                    label="Situação"
                    value={operacao.adimplente ? 'Adimplente' : 'Inadimplente'}
                  />
                  <DadoLeitura label="Unidade" value={operacao.unidadeNome ?? '—'} />
                  <DadoLeitura
                    label={niveis.length > 1 ? 'Áreas' : 'Área'}
                    value={
                      niveis.length > 0
                        ? niveis
                            .map((n) =>
                              niveis.length > 1
                                ? `${n.atuacao} (${n.nivel === 'unidade' ? 'unidade' : 'sede'})`
                                : n.atuacao,
                            )
                            .join(' · ')
                        : (operacao.departamentoNome ?? '—')
                    }
                  />
                  <DadoLeitura
                    label="Nº da carteirinha"
                    value={operacao.carteirinhaNumeroLabel ?? 'Aguardando emissão'}
                  />
                  <DadoLeitura
                    label="Validade"
                    value={
                      operacao.carteirinhaValidadeLabel
                        ? `Até ${operacao.carteirinhaValidadeLabel}`
                        : '—'
                    }
                  />
                  <DadoLeitura
                    label="Emitida em"
                    value={operacao.carteirinhaEmitidaEmLabel ?? '—'}
                  />
                </div>
                <p className="text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
                  Use as abas Cadastro, Documentos e Associação para editar. Clique em um item
                  incompleto da lista para ir direto ao campo.
                </p>
              </div>
            ) : null}

            {tab === 'cadastro' ? (
              <div className="space-y-8">
                <Secao
                  titulo="Contato e identificação"
                  descricao="Dados pessoais da ficha. CPF, RG e telefone ganham máscara automática."
                >
                  <div id="campo-numeroAssociado" className="sm:col-span-2">
                    <CampoTexto
                      id="campo-numeroAssociado-input"
                      name="numeroAssociado"
                      label="Nº de associado"
                      hint="Número da carteirinha física ou do recrutamento."
                      value={numeroAssociado}
                      onChange={setNumeroAssociado}
                      inputMode="numeric"
                      invalid={faltandoIds.has('numeroAssociado')}
                    />
                  </div>
                  <div id="campo-cpf">
                    <CampoTexto
                      id="campo-cpf-input"
                      name="cpf"
                      label="CPF"
                      value={cpf}
                      onChange={(v) => setCpf(maskCpf(v))}
                      inputMode="numeric"
                      maxLength={14}
                      invalid={
                        faltandoIds.has('cpf') ||
                        (cpf.replace(/\D/g, '').length === 11 &&
                          !validarCpfDigitos(normalizarCpf(cpf) ?? ''))
                      }
                    />
                  </div>
                  <div id="campo-rg">
                    <CampoTexto
                      id="campo-rg-input"
                      name="rg"
                      label="RG"
                      value={rg}
                      onChange={(v) => setRg(maskRg(v))}
                      invalid={faltandoIds.has('rg')}
                    />
                  </div>
                  <div id="campo-nascimento">
                    <label htmlFor="campo-nascimento-input" className="block space-y-1.5">
                      <span className="block text-sm font-medium text-[rgb(var(--foreground))]">
                        Data de nascimento
                      </span>
                      <DatePicker
                        id="campo-nascimento-input"
                        name="dataNascimento"
                        value={dataNascimento}
                        onChange={setDataNascimento}
                        maxToday
                        invalid={faltandoIds.has('nascimento')}
                        aria-label="Data de nascimento"
                      />
                    </label>
                  </div>
                  <div>
                    <CampoTexto
                      id="campo-telefone-input"
                      name="telefone"
                      label="Telefone"
                      value={telefone}
                      onChange={(v) => setTelefone(maskTelefone(v) || v)}
                      inputMode="tel"
                      maxLength={16}
                    />
                  </div>
                </Secao>

                <Secao
                  titulo="Endereço"
                  descricao="Com o CEP completo, buscamos logradouro, bairro, cidade e UF."
                >
                  <div id="campo-cep">
                    <CampoTexto
                      id="campo-cep-input"
                      name="cep"
                      label="CEP"
                      hint={cepBusy ? 'Buscando endereço…' : '8 dígitos'}
                      value={cep}
                      onChange={onCepChange}
                      inputMode="numeric"
                      maxLength={9}
                      invalid={faltandoIds.has('cep')}
                    />
                  </div>
                  <div id="campo-logradouro" className="sm:col-span-2">
                    <CampoTexto
                      id="campo-logradouro-input"
                      name="logradouro"
                      label="Logradouro"
                      value={logradouro}
                      onChange={setLogradouro}
                      invalid={faltandoIds.has('logradouro')}
                    />
                  </div>
                  <div>
                    <CampoTexto
                      id="campo-numero-input"
                      name="numero"
                      label="Número"
                      value={numero}
                      onChange={setNumero}
                    />
                  </div>
                  <div>
                    <CampoTexto
                      id="campo-complemento-input"
                      name="complemento"
                      label="Complemento"
                      value={complemento}
                      onChange={setComplemento}
                    />
                  </div>
                  <div id="campo-bairro">
                    <CampoTexto
                      id="campo-bairro-input"
                      name="bairro"
                      label="Bairro"
                      value={bairro}
                      onChange={setBairro}
                      invalid={faltandoIds.has('bairro')}
                    />
                  </div>
                  <div>
                    <CampoTexto
                      id="campo-cidade-input"
                      name="cidade"
                      label="Cidade"
                      value={cidade}
                      onChange={setCidade}
                    />
                  </div>
                  <div id="campo-uf">
                    <label htmlFor="campo-uf-input" className="block space-y-1.5">
                      <span className="block text-sm font-medium">UF</span>
                      <select
                        id="campo-uf-input"
                        name="uf"
                        value={uf}
                        onChange={(e) => setUf(e.target.value)}
                        aria-invalid={faltandoIds.has('uf') || undefined}
                        className={[
                          inputClass,
                          faltandoIds.has('uf')
                            ? 'border-amber-500/55 focus-visible:border-amber-500/70 focus-visible:ring-amber-500/25'
                            : '',
                        ].join(' ')}
                      >
                        <option value="">Selecione</option>
                        {UFS_BRASIL.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </Secao>

                {mostraResponsavel ? (
                  <Secao titulo="Responsável legal (menor de idade)">
                    <div id="campo-resp-nome">
                      <CampoTexto
                        id="campo-resp-nome-input"
                        name="responsavelNome"
                        label="Nome do responsável"
                        value={responsavelNome}
                        onChange={setResponsavelNome}
                        invalid={faltandoIds.has('resp-nome')}
                      />
                    </div>
                    <div id="campo-resp-doc">
                      <CampoTexto
                        id="campo-resp-doc-input"
                        name="responsavelDocumento"
                        label="Documento do responsável"
                        value={responsavelDocumento}
                        onChange={setResponsavelDocumento}
                        invalid={faltandoIds.has('resp-doc')}
                      />
                    </div>
                  </Secao>
                ) : null}
              </div>
            ) : null}

            {tab === 'documentos' ? (
              <div className="space-y-8">
                <Secao
                  titulo="Anexos"
                  descricao="Comprovantes da ficha. Você pode trocar um arquivo já enviado."
                >
                  <div id="campo-prova" className="sm:col-span-2">
                    <UploadDocumento
                      name="imagemProva"
                      label="Comprovante de vínculo"
                      hint="Carteirinha, recibo ou documento que comprove a associação."
                      value={prova}
                      tenantId={tenantId}
                      onChange={setProva}
                    />
                  </div>
                  {exigirDocumentos ? (
                    <>
                      <div id="campo-documento" className="sm:col-span-2">
                        <UploadDocumento
                          name="fotoDocumentoUrl"
                          label="Foto do documento"
                          hint="Frente do RG ou documento oficial com foto."
                          value={doc}
                          tenantId={tenantId}
                          onChange={setDoc}
                        />
                      </div>
                      <div id="campo-residencia" className="sm:col-span-2">
                        <UploadDocumento
                          name="comprovanteResidenciaUrl"
                          label="Comprovante de residência"
                          value={residencia}
                          tenantId={tenantId}
                          onChange={setResidencia}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <input type="hidden" name="fotoDocumentoUrl" value={doc} />
                      <input type="hidden" name="comprovanteResidenciaUrl" value={residencia} />
                    </>
                  )}
                </Secao>
                <div
                  id="campo-termo"
                  className={[
                    'rounded-2xl border p-4',
                    faltandoIds.has('termo')
                      ? 'border-amber-500/40 bg-amber-500/5'
                      : 'border-[rgb(var(--border))] bg-[rgb(var(--background)_/_0.4)]',
                  ].join(' ')}
                >
                  <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
                    <input
                      type="checkbox"
                      name="termoResponsabilidade"
                      value="true"
                      className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--color-primary))]"
                      checked={termo}
                      onChange={(e) => setTermo(e.target.checked)}
                    />
                    <span>
                      Li e aceito o termo de responsabilidade da torcida.
                      <br />
                      <span className="text-xs text-[rgb(var(--foreground-muted))]">
                        Obrigatório para regularizar o cadastro de sócio.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            ) : null}

            {tab === 'associacao' ? (
              <div className="space-y-8">
                <Secao
                  titulo="Vínculo e carteirinha"
                  descricao={
                    temCarteirinha
                      ? 'Sua carteirinha já foi emitida. Você ainda pode atualizar anos de sócio e conferir o plano.'
                      : 'Com nº, data de expedição e plano, emitimos a carteirinha digital automaticamente.'
                  }
                >
                  <div id="campo-numeroAssociado-assoc" className="sm:col-span-2">
                    <CampoTexto
                      id="campo-numeroAssociado-assoc-input"
                      name="numeroAssociado"
                      label="Nº de associado"
                      value={numeroAssociado}
                      onChange={setNumeroAssociado}
                      inputMode="numeric"
                      invalid={faltandoIds.has('numeroAssociado')}
                    />
                  </div>
                  <div>
                    <CampoTexto
                      id="campo-anosSocio-input"
                      name="anosSocio"
                      label="Anos como sócio"
                      value={anosSocio}
                      onChange={setAnosSocio}
                      inputMode="numeric"
                      maxLength={3}
                    />
                  </div>
                  <div id="campo-dataExpedicaoCarteirinha">
                    <label htmlFor="campo-expedicao-input" className="block space-y-1.5">
                      <span className="block text-sm font-medium text-[rgb(var(--foreground))]">
                        Data da última expedição da carteirinha
                      </span>
                      <span className="block text-xs leading-relaxed text-[rgb(var(--foreground-muted))]">
                        Pagamento mais recente de renovação do seu vínculo associativo vigente.
                      </span>
                      <DatePicker
                        id="campo-expedicao-input"
                        name="dataExpedicaoCarteirinha"
                        value={expedicao}
                        onChange={setExpedicao}
                        maxToday
                        invalid={faltandoIds.has('dataExpedicaoCarteirinha')}
                        aria-label="Data da última expedição da carteirinha"
                      />
                    </label>
                  </div>
                  <div id="campo-periodicidadePretendida" className="sm:col-span-2">
                    <label htmlFor="campo-periodicidade-input" className="block space-y-1.5">
                      <span className="block text-sm font-medium">Plano</span>
                      <span className="block text-xs leading-relaxed text-[rgb(var(--foreground-muted))]">
                        Ciclo da contribuição e, se a torcida cadastrou, o valor oficial.
                      </span>
                      <select
                        id="campo-periodicidade-input"
                        value={chavePlano}
                        onChange={(e) => setChavePlano(e.target.value)}
                        aria-invalid={faltandoIds.has('periodicidadePretendida') || undefined}
                        className={[
                          inputClass,
                          faltandoIds.has('periodicidadePretendida')
                            ? 'border-amber-500/55 focus-visible:border-amber-500/70 focus-visible:ring-amber-500/25'
                            : '',
                        ].join(' ')}
                      >
                        {opcoesPlano.map((opcao) => (
                          <option key={opcao.chave} value={opcao.chave}>
                            {opcao.rotulo}
                          </option>
                        ))}
                      </select>
                      <input type="hidden" name="periodicidadePretendida" value={periodicidade} />
                      <input type="hidden" name="planoAssociacaoId" value={planoAssociacaoId} />
                    </label>
                  </div>
                  {temCarteirinha ? (
                    <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2">
                      <DadoLeitura
                        label="Nome na carteirinha"
                        value={operacao.carteirinhaNome ?? '—'}
                      />
                      <DadoLeitura
                        label="Nº da carteirinha digital"
                        value={operacao.carteirinhaNumeroLabel ?? '—'}
                      />
                      <DadoLeitura
                        label="Validade atual"
                        value={operacao.carteirinhaValidadeLabel ?? '—'}
                      />
                      <DadoLeitura
                        label="Emitida em"
                        value={operacao.carteirinhaEmitidaEmLabel ?? '—'}
                      />
                    </div>
                  ) : null}
                </Secao>
              </div>
            ) : null}

            {tab === 'operacao' ? (
              <div className="space-y-5">
                <Secao
                  titulo="Vínculo na torcida"
                  descricao={
                    niveis.length > 1
                      ? 'Área e papel são independentes em cada nível — você pode ser gestor na unidade e membro na sede. Somente leitura: mudanças passam pela administração.'
                      : 'Somente leitura — alterações de unidade passam pela administração.'
                  }
                >
                  <VinculoNiveis niveis={niveis} />
                  <DadoLeitura label="Status" value={operacao.statusLabel} />
                  <DadoLeitura
                    label="Situação financeira"
                    value={operacao.adimplente ? 'Adimplente' : 'Inadimplente'}
                  />
                  <DadoLeitura label="Aprovado em" value={operacao.aprovadoEmLabel ?? '—'} />
                  <DadoLeitura
                    label="Nº da carteirinha"
                    value={operacao.carteirinhaNumeroLabel ?? 'Aguardando emissão'}
                  />
                  <DadoLeitura
                    label="Validade"
                    value={
                      operacao.carteirinhaValidadeLabel
                        ? `Até ${operacao.carteirinhaValidadeLabel}`
                        : '—'
                    }
                  />
                  <DadoLeitura
                    label="Emitida em"
                    value={operacao.carteirinhaEmitidaEmLabel ?? '—'}
                  />
                </Secao>
                <p className="text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
                  {niveis.length > 1
                    ? 'Para mudar unidade, área ou papel, fale com a diretoria de cada nível — a da unidade efetiva a equipe dela; a da sede, a dela.'
                    : 'Para mudar unidade ou área, fale com a administração da torcida. Aqui o foco é completar a ficha para manter a vigência em dia.'}
                </p>
              </div>
            ) : null}
          </m.div>
        </AnimatePresence>
      </div>

      {/* Campos da aba inativa precisam ir no FormData — espelhamos como hidden. */}
      {tab !== 'cadastro' ? (
        <>
          {tab !== 'associacao' ? (
            <input type="hidden" name="numeroAssociado" value={numeroAssociado} />
          ) : null}
          <input type="hidden" name="cpf" value={cpf} />
          <input type="hidden" name="rg" value={rg} />
          <input type="hidden" name="dataNascimento" value={dataNascimento} />
          <input type="hidden" name="telefone" value={telefone} />
          <input type="hidden" name="cidade" value={cidade} />
          <input type="hidden" name="logradouro" value={logradouro} />
          <input type="hidden" name="numero" value={numero} />
          <input type="hidden" name="complemento" value={complemento} />
          <input type="hidden" name="bairro" value={bairro} />
          <input type="hidden" name="cep" value={cep} />
          <input type="hidden" name="uf" value={uf} />
          <input type="hidden" name="responsavelNome" value={responsavelNome} />
          <input type="hidden" name="responsavelDocumento" value={responsavelDocumento} />
        </>
      ) : null}
      {tab !== 'documentos' ? (
        <>
          <input type="hidden" name="imagemProva" value={prova} />
          <input type="hidden" name="fotoDocumentoUrl" value={doc} />
          <input type="hidden" name="comprovanteResidenciaUrl" value={residencia} />
          {termo ? <input type="hidden" name="termoResponsabilidade" value="true" /> : null}
        </>
      ) : null}
      {tab !== 'associacao' ? (
        <>
          <input type="hidden" name="anosSocio" value={anosSocio} />
          <input type="hidden" name="dataExpedicaoCarteirinha" value={expedicao} />
          <input type="hidden" name="periodicidadePretendida" value={periodicidade} />
          <input type="hidden" name="planoAssociacaoId" value={planoAssociacaoId} />
        </>
      ) : null}

      <div className="sticky bottom-3 z-10 -mx-1 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.92)] p-3 shadow-[0_-8px_30px_rgb(0_0_0_/_0.18)] backdrop-blur-md sm:mx-0">
        {hintSalvar ? (
          <p className="mb-2.5 flex items-start gap-2 text-xs leading-relaxed text-[rgb(var(--foreground-muted))]">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{hintSalvar}</span>
          </p>
        ) : (
          <p className="mb-2.5 flex items-start gap-2 text-xs leading-relaxed text-[rgb(var(--color-success-fg))]">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>Ficha completa. Você já pode salvar e concluir.</span>
          </p>
        )}
        <button
          type="submit"
          disabled={!podeSalvar}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[rgb(var(--color-primary))] px-4 py-3 text-sm font-semibold text-[rgb(var(--color-primary-fg))] transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
        >
          {pending ? (
            'Salvando…'
          ) : resumo.completo && formatosOk ? (
            <>
              <IdCard className="h-4 w-4" aria-hidden />
              {embutido ? 'Salvar alterações' : 'Salvar e concluir'}
            </>
          ) : (
            `Preencha tudo para salvar (${resumo.faltando.length} faltando)`
          )}
        </button>
      </div>
    </form>
  )
}
