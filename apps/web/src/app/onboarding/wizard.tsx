'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { AnimatePresence, m } from 'motion/react'
import { Shield, Search, ArrowLeft, ArrowRight, Check, Users, Upload, Loader2, Camera } from 'lucide-react'
import { Input, Select } from '@torcida/ui'
import { uploadMediaToCloudinary } from '@/lib/cloudinary-upload'
import { routePage, springGentle, springSnappy } from '@/lib/motion-presets'
import {
  salvarClubeRegiao,
  concluirComoTorcedor,
  solicitarVinculo,
  buscarAfiliacoes,
  buscarTorcidas,
  buscarDepartamentos,
} from './actions'
import type {
  AfiliacaoOnboarding,
  TorcidaOnboarding,
  DepartamentoOnboarding,
  SedeOnboarding,
} from '@/lib/onboarding'

type Passo = 'clube' | 'regiao' | 'torcida' | 'vinculo' | 'concluindo'

const PASSOS_VISIVEIS: { key: Passo; label: string }[] = [
  { key: 'clube', label: 'Clube' },
  { key: 'regiao', label: 'Região' },
  { key: 'torcida', label: 'Torcida' },
  { key: 'vinculo', label: 'Vínculo' },
]

const SERIE_LABEL: Record<string, string> = {
  A: 'Série A',
  B: 'Série B',
  C: 'Série C',
  D: 'Série D',
  ESTADUAL: 'Estadual',
  OUTRA: 'Outra',
}

type Props = {
  afiliacoesIniciais: AfiliacaoOnboarding[]
  ufs: string[]
  nomeInicial: string
}

export function OnboardingWizard({ afiliacoesIniciais, ufs, nomeInicial }: Props) {
  const [passo, setPasso] = useState<Passo>('clube')
  const [slideDir, setSlideDir] = useState(1)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function irPara(novo: Passo, dir = 1) {
    setSlideDir(dir)
    setPasso(novo)
  }

  // Seleções acumuladas
  const [clube, setClube] = useState<AfiliacaoOnboarding | null>(null)
  const [uf, setUf] = useState('')
  const [cidade, setCidade] = useState('')
  const [torcida, setTorcida] = useState<TorcidaOnboarding | null>(null)

  const indiceAtual = PASSOS_VISIVEIS.findIndex((p) => p.key === passo)

  function limparErro() {
    setErro(null)
  }

  // ── Passo 1 → 2: salva clube (+ região se já preenchida depois) ──────────────
  function selecionarClube(afiliacao: AfiliacaoOnboarding) {
    setClube(afiliacao)
    limparErro()
    irPara('regiao', 1)
  }

  // ── Passo 2 → 3: persiste clube + região, carrega torcidas ───────────────────
  const [torcidas, setTorcidas] = useState<TorcidaOnboarding[] | null>(null)
  function avancarDaRegiao(pular: boolean) {
    if (!clube) return
    const regiao = pular ? undefined : [cidade.trim(), uf].filter(Boolean).join(' - ') || undefined
    startTransition(async () => {
      const res = await salvarClubeRegiao({ afiliacaoId: clube.id, regiao })
      if (res.message || res.errors) {
        setErro(res.message ?? 'Não foi possível salvar. Tente novamente.')
        return
      }
      const lista = await buscarTorcidas(clube.id)
      setTorcidas(lista)
      limparErro()
      irPara('torcida', 1)
    })
  }

  // ── Passo 3: escolher torcida ou seguir como torcedor global ─────────────────
  function escolherTorcida(t: TorcidaOnboarding) {
    setTorcida(t)
    limparErro()
    irPara('vinculo', 1)
  }

  function seguirComoTorcedorGlobal() {
    setErro(null)
    irPara('concluindo', 1)
    startTransition(async () => {
      const res = await concluirComoTorcedor()
      // Se retornou (não redirecionou), houve erro.
      if (res?.message) {
        setErro(res.message)
        irPara('torcida', -1)
      }
    })
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Cabeçalho + progresso */}
      <header className="mb-8">
        <div className="mb-6 flex items-center gap-2 text-[rgb(var(--color-primary))]">
          <Shield className="h-6 w-6" />
          <span className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Bem-vindo
          </span>
        </div>
        <ProgressBar indiceAtual={indiceAtual === -1 ? PASSOS_VISIVEIS.length : indiceAtual} />
      </header>

      {erro && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {erro}
        </div>
      )}

      <div className="flex-1">
        <AnimatePresence mode="wait" custom={slideDir}>
          {passo === 'clube' && (
            <m.div
              key="clube"
              custom={slideDir}
              variants={routePage}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={springGentle}
            >
              <PassoClube
                afiliacoesIniciais={afiliacoesIniciais}
                onSelecionar={selecionarClube}
              />
            </m.div>
          )}

          {passo === 'regiao' && (
            <m.div
              key="regiao"
              custom={slideDir}
              variants={routePage}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={springGentle}
            >
              <PassoRegiao
                clube={clube}
                ufs={ufs}
                uf={uf}
                cidade={cidade}
                onUf={setUf}
                onCidade={setCidade}
                pending={pending}
                onVoltar={() => irPara('clube', -1)}
                onContinuar={() => avancarDaRegiao(false)}
                onPular={() => avancarDaRegiao(true)}
              />
            </m.div>
          )}

          {passo === 'torcida' && (
            <m.div
              key="torcida"
              custom={slideDir}
              variants={routePage}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={springGentle}
            >
              <PassoTorcida
                clube={clube}
                torcidas={torcidas ?? []}
                pending={pending}
                onEscolher={escolherTorcida}
                onTorcedorGlobal={seguirComoTorcedorGlobal}
                onVoltar={() => irPara('regiao', -1)}
              />
            </m.div>
          )}

          {passo === 'vinculo' && torcida && (
            <m.div
              key="vinculo"
              custom={slideDir}
              variants={routePage}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={springGentle}
            >
              <PassoVinculo
                torcida={torcida}
                nomeInicial={nomeInicial}
                onVoltar={() => irPara('torcida', -1)}
                onErro={setErro}
              />
            </m.div>
          )}

          {passo === 'concluindo' && (
            <m.div
              key="concluindo"
              variants={routePage}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={springGentle}
              className="flex flex-col items-center justify-center gap-3 py-20 text-center text-[rgb(var(--foreground-muted))]"
            >
              <Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--color-primary))]" />
              <p>Concluindo seu cadastro...</p>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Barra de progresso ─────────────────────────────────────────────────────────

function ProgressBar({ indiceAtual }: { indiceAtual: number }) {
  return (
    <ol className="flex items-center gap-2">
      {PASSOS_VISIVEIS.map((p, i) => {
        const feito = i < indiceAtual
        const atual = i === indiceAtual
        return (
          <li key={p.key} className="relative flex flex-1 flex-col gap-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-[rgb(var(--border))]">
              <m.div
                className="h-full rounded-full bg-[rgb(var(--color-primary))]"
                initial={false}
                animate={{ width: feito || atual ? '100%' : '0%' }}
                transition={springSnappy}
              />
            </div>
            <span
              className={`text-[11px] font-medium ${
                atual
                  ? 'text-[rgb(var(--foreground))]'
                  : 'text-[rgb(var(--foreground-muted))]'
              }`}
            >
              {p.label}
            </span>
            {atual && (
              <m.span
                layoutId="onboarding-step-indicator"
                className="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-full bg-[rgb(var(--color-primary))]"
                transition={springSnappy}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

// ─── Passo 1: Clube ─────────────────────────────────────────────────────────────

function PassoClube({
  afiliacoesIniciais,
  onSelecionar,
}: {
  afiliacoesIniciais: AfiliacaoOnboarding[]
  onSelecionar: (a: AfiliacaoOnboarding) => void
}) {
  const [busca, setBusca] = useState('')
  const [lista, setLista] = useState(afiliacoesIniciais)
  const [buscando, startBusca] = useTransition()

  function onBusca(valor: string) {
    setBusca(valor)
    startBusca(async () => {
      const res = await buscarAfiliacoes(valor)
      setLista(res)
    })
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Qual clube você torce?</h1>
      <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
        Escolha o time do seu coração. É só um clique.
      </p>

      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
        <Input
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          placeholder="Buscar clube por nome..."
          className="pl-9"
          aria-label="Buscar clube"
        />
      </div>

      {buscando ? (
        <div className="flex items-center justify-center py-16 text-[rgb(var(--foreground-muted))]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : lista.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[rgb(var(--border))] p-10 text-center text-sm text-[rgb(var(--foreground-muted))]">
          Nenhum clube encontrado para &quot;{busca}&quot;. Tente outro nome.
        </div>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {lista.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onSelecionar(a)}
                className="flex h-full w-full flex-col items-center gap-2 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 text-center transition-all hover:border-[rgb(var(--color-primary))] hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))]"
              >
                <EscudoClube afiliacao={a} />
                <span className="text-xs font-semibold text-[rgb(var(--foreground))] line-clamp-2">
                  {a.nome}
                </span>
                {(a.apelido || a.estado) && (
                  <span className="text-[10px] text-[rgb(var(--foreground-muted))] line-clamp-1">
                    {[a.apelido, a.estado].filter(Boolean).join(' · ')}
                  </span>
                )}
                {a.serie && (
                  <span className="text-[10px] text-[rgb(var(--foreground-muted))]">
                    {SERIE_LABEL[a.serie] ?? a.serie}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function EscudoClube({ afiliacao }: { afiliacao: AfiliacaoOnboarding }) {
  const [imagemFalhou, setImagemFalhou] = useState(false)

  if (afiliacao.escudoUrl && !imagemFalhou) {
    return (
      <Image
        src={afiliacao.escudoUrl}
        alt={afiliacao.nome}
        width={56}
        height={56}
        className="h-14 w-14 object-contain"
        onError={() => setImagemFalhou(true)}
      />
    )
  }
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[rgb(var(--background-subtle))] text-lg font-bold text-[rgb(var(--foreground-muted))]">
      {(afiliacao.apelido || afiliacao.nome).charAt(0).toUpperCase()}
    </div>
  )
}

// ─── Passo 2: Região ────────────────────────────────────────────────────────────

function PassoRegiao({
  clube,
  ufs,
  uf,
  cidade,
  onUf,
  onCidade,
  pending,
  onVoltar,
  onContinuar,
  onPular,
}: {
  clube: AfiliacaoOnboarding | null
  ufs: string[]
  uf: string
  cidade: string
  onUf: (v: string) => void
  onCidade: (v: string) => void
  pending: boolean
  onVoltar: () => void
  onContinuar: () => void
  onPular: () => void
}) {
  return (
    <div>
      <BotaoVoltar onClick={onVoltar} disabled={pending} />
      <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">De onde você torce?</h1>
      <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
        Sua região ajuda a conectar você a torcedores e eventos por perto
        {clube ? ` do ${clube.apelido || clube.nome}` : ''}. É opcional.
      </p>

      <div className="mt-6 space-y-4">
        <div>
          <label htmlFor="uf" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Estado
          </label>
          <Select id="uf" value={uf} onChange={(e) => onUf(e.target.value)}>
            <option value="">Selecione o estado</option>
            {ufs.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="cidade" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Cidade
          </label>
          <Input
            id="cidade"
            value={cidade}
            onChange={(e) => onCidade(e.target.value)}
            placeholder="Ex: São Paulo"
          />
        </div>
      </div>

      <div className="mt-8 flex items-center gap-3">
        <button
          type="button"
          onClick={onPular}
          disabled={pending}
          className="text-sm font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))] disabled:opacity-50"
        >
          Pular
        </button>
        <BotaoPrimario onClick={onContinuar} pending={pending} label="Continuar" />
      </div>
    </div>
  )
}

// ─── Passo 3: Torcida ───────────────────────────────────────────────────────────

function PassoTorcida({
  clube,
  torcidas,
  pending,
  onEscolher,
  onTorcedorGlobal,
  onVoltar,
}: {
  clube: AfiliacaoOnboarding | null
  torcidas: TorcidaOnboarding[]
  pending: boolean
  onEscolher: (t: TorcidaOnboarding) => void
  onTorcedorGlobal: () => void
  onVoltar: () => void
}) {
  const nomeClube = clube?.apelido || clube?.nome || 'seu clube'
  return (
    <div>
      <BotaoVoltar onClick={onVoltar} disabled={pending} />
      <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">
        Você pertence a alguma organizada?
      </h1>
      <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
        Torcidas de {nomeClube} na plataforma. Escolha a sua ou siga como torcedor.
      </p>

      {torcidas.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[rgb(var(--border))] p-8 text-center">
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            Nenhuma torcida de {nomeClube} está na plataforma ainda.
          </p>
          <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
            Você pode entrar como torcedor e acompanhar a comunidade.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {torcidas.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onEscolher(t)}
                className="flex w-full items-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 text-left transition-all hover:border-[rgb(var(--color-primary))] hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))]"
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: t.corPrimaria }}
                >
                  {t.logoUrl ? (
                    <Image src={t.logoUrl} alt={t.nome} width={44} height={44} className="h-full w-full object-cover" />
                  ) : (
                    t.nome.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-[rgb(var(--foreground))]">{t.nome}</p>
                  <p className="flex items-center gap-1 text-xs text-[rgb(var(--foreground-muted))]">
                    <Users className="h-3 w-3" />
                    {t.membrosAprovados} {t.membrosAprovados === 1 ? 'membro' : 'membros'}
                  </p>
                  {!t.acessivelNoHost && (
                    <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                      Portal em outro endereço — solicitação válida, aprovação na torcida escolhida.
                    </p>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onTorcedorGlobal}
        disabled={pending}
        className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-dashed border-[rgb(var(--border))] p-4 text-left transition-all hover:bg-[rgb(var(--surface))] disabled:opacity-50"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--background-subtle))]">
          {pending ? (
            <Loader2 className="h-5 w-5 animate-spin text-[rgb(var(--foreground-muted))]" />
          ) : (
            <Users className="h-5 w-5 text-[rgb(var(--foreground-muted))]" />
          )}
        </div>
        <div>
          <p className="font-semibold text-[rgb(var(--foreground))]">
            Sou só torcedor / não pertenço a nenhuma
          </p>
          <p className="text-xs text-[rgb(var(--foreground-muted))]">
            Acompanhe a comunidade nacional do seu clube.
          </p>
        </div>
      </button>
    </div>
  )
}

// ─── Passo 4: Vínculo (torcedor da torcida ou sócio) ────────────────────────────

function PassoVinculo({
  torcida,
  nomeInicial,
  onVoltar,
  onErro,
}: {
  torcida: TorcidaOnboarding
  nomeInicial: string
  onVoltar: () => void
  onErro: (m: string | null) => void
}) {
  const [modo, setModo] = useState<'escolha' | 'socio'>('escolha')
  const [pending, startTransition] = useTransition()
  const [errosCampo, setErrosCampo] = useState<Record<string, string[]>>({})

  // Campos de sócio
  const [nome, setNome] = useState(nomeInicial)
  const [idade, setIdade] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cidade, setCidade] = useState('')
  const [numeroAssociado, setNumeroAssociado] = useState('')
  const [departamentoId, setDepartamentoId] = useState('')
  const [imagemProva, setImagemProva] = useState<string | undefined>()
  const [uploadPend, setUploadPend] = useState(false)

  // Vínculo territorial: quando a torcida tem mais de uma unidade ativa, o
  // associado precisa escolher a sua (a Server Action exige isso e, sem o
  // seletor, o fluxo travava silenciosamente — ver onboarding.ts).
  const [unidadeId, setUnidadeId] = useState('')
  const precisaEscolherUnidade = torcida.sedes.length > 1

  const [departamentos, setDepartamentos] = useState<DepartamentoOnboarding[] | null>(null)

  function abrirSocio() {
    onErro(null)
    setModo('socio')
    if (departamentos === null) {
      startTransition(async () => {
        const deps = await buscarDepartamentos(torcida.id)
        setDepartamentos(deps)
      })
    }
  }

  function enviar(tipo: 'SOCIO' | 'TORCEDOR') {
    onErro(null)
    setErrosCampo({})
    if (precisaEscolherUnidade && !unidadeId) {
      onErro('Selecione a unidade da torcida para continuar.')
      return
    }
    if (!imagemProva) {
      onErro('Envie uma foto da carteirinha ou comprovante de vínculo com a torcida.')
      return
    }
    startTransition(async () => {
      const res = await solicitarVinculo({
        tenantId: torcida.id,
        tipo,
        nome: tipo === 'SOCIO' ? nome : nome || nomeInicial || 'Torcedor',
        idade: idade || undefined,
        telefone: telefone || undefined,
        cidade: cidade || undefined,
        numeroAssociado: numeroAssociado || undefined,
        imagemProva,
        departamentoId: departamentoId || undefined,
        sedeId: unidadeId || undefined,
      })
      // Sucesso redireciona no servidor; se retornou, houve erro/validação.
      if (res?.errors) {
        setErrosCampo(res.errors)
        onErro('Confira os campos destacados.')
      } else if (res?.message) {
        onErro(res.message)
      }
    })
  }

  async function onArquivo(file: File | undefined) {
    if (!file) return
    setUploadPend(true)
    onErro(null)
    try {
      const url = await uploadMediaToCloudinary(file, undefined, 'cadastro', torcida.id)
      setImagemProva(url)
    } catch (err) {
      onErro(err instanceof Error ? err.message : 'Falha no upload da imagem.')
    } finally {
      setUploadPend(false)
    }
  }

  if (modo === 'escolha') {
    return (
      <div>
        <BotaoVoltar onClick={onVoltar} disabled={pending} />
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">
          Como você participa da {torcida.nome}?
        </h1>
        <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
          Sócios passam por aprovação e têm acesso a benefícios exclusivos.
        </p>

        {!torcida.acessivelNoHost && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            O portal da <strong>{torcida.nome}</strong> fica em outro endereço. Sua solicitação será
            analisada pela diretoria dessa torcida — não aparecerá pendente no admin deste site.
          </p>
        )}

        {precisaEscolherUnidade && (
          <div className="mt-6">
            <SeletorUnidade sedes={torcida.sedes} value={unidadeId} onChange={setUnidadeId} />
          </div>
        )}

        <div className="mt-6">
          <BlocoImagemProva
            imagemProva={imagemProva}
            uploadPend={uploadPend}
            erros={errosCampo.imagemProva}
            onArquivo={onArquivo}
          />
          {!imagemProva && !uploadPend && (
            <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
              Envie um comprovante de vínculo para continuar como torcedor ou sócio da torcida.
            </p>
          )}
        </div>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={() => enviar('TORCEDOR')}
            disabled={pending || uploadPend || (precisaEscolherUnidade && !unidadeId)}
            className="flex w-full items-start gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 text-left transition-all hover:border-[rgb(var(--color-primary))] disabled:opacity-50"
          >
            <Users className="mt-0.5 h-5 w-5 shrink-0 text-[rgb(var(--foreground-muted))]" />
            <div>
              <p className="font-semibold text-[rgb(var(--foreground))]">Torcedor da torcida</p>
              <p className="text-xs text-[rgb(var(--foreground-muted))]">
                Acesso à comunidade, eventos e novidades da torcida.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={abrirSocio}
            disabled={pending}
            className="flex w-full items-start gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 text-left transition-all hover:border-[rgb(var(--color-primary))] disabled:opacity-50"
          >
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-[rgb(var(--foreground-muted))]" />
            <div>
              <p className="font-semibold text-[rgb(var(--foreground))]">Sócio</p>
              <p className="text-xs text-[rgb(var(--foreground-muted))]">
                Carteirinha, benefícios e voz nas decisões. Requer aprovação.
              </p>
            </div>
          </button>
        </div>
      </div>
    )
  }

  // Formulário de sócio
  return (
    <div>
      <BotaoVoltar onClick={() => setModo('escolha')} disabled={pending} label="Voltar" />
      <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Solicitação de sócio</h1>
      <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
        Preencha seus dados. A liderança da {torcida.nome} vai analisar.
      </p>

      <div className="mt-6 space-y-4">
        {precisaEscolherUnidade && (
          <Campo label="Unidade da torcida" obrigatorio erros={errosCampo.sedeId}>
            <SeletorUnidade sedes={torcida.sedes} value={unidadeId} onChange={setUnidadeId} semLabel />
          </Campo>
        )}

        <Campo label="Nome completo" obrigatorio erros={errosCampo.nome}>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Idade" erros={errosCampo.idade}>
            <Input type="number" min={10} max={120} value={idade} onChange={(e) => setIdade(e.target.value)} placeholder="Ex: 25" />
          </Campo>
          <Campo label="Telefone / WhatsApp" erros={errosCampo.telefone}>
            <Input type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 99999-9999" />
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Cidade" erros={errosCampo.cidade}>
            <Input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Ex: São Paulo" />
          </Campo>
          <Campo label="Nº de associado" erros={errosCampo.numeroAssociado}>
            <Input value={numeroAssociado} onChange={(e) => setNumeroAssociado(e.target.value)} placeholder="Se já tiver" />
          </Campo>
        </div>

        {departamentos !== null && departamentos.length > 0 && (
          <Campo label="Departamento de atuação" erros={errosCampo.departamentoId}>
            <Select value={departamentoId} onChange={(e) => setDepartamentoId(e.target.value)}>
              <option value="">Selecione (opcional)</option>
              {departamentos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </Select>
          </Campo>
        )}

        <BlocoImagemProva
          imagemProva={imagemProva}
          uploadPend={uploadPend}
          erros={errosCampo.imagemProva}
          onArquivo={onArquivo}
        />
      </div>

      <div className="mt-8">
        <BotaoPrimario
          onClick={() => enviar('SOCIO')}
          pending={pending || uploadPend}
          disabled={!imagemProva}
          label="Enviar solicitação"
        />
      </div>
    </div>
  )
}

// ─── Peças compartilhadas ───────────────────────────────────────────────────────

const TIPO_SEDE_LABEL: Record<string, string> = {
  SEDE: 'Sede',
  SUBSEDE: 'Subsede',
  PONTO_ENCONTRO: 'Ponto de encontro',
}

function SeletorUnidade({
  sedes,
  value,
  onChange,
  semLabel,
}: {
  sedes: SedeOnboarding[]
  value: string
  onChange: (v: string) => void
  semLabel?: boolean
}) {
  return (
    <div>
      {!semLabel && (
        <span className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Qual unidade você frequenta?
        </span>
      )}
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione sua unidade</option>
        {sedes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nome}
            {TIPO_SEDE_LABEL[s.tipo] ? ` · ${TIPO_SEDE_LABEL[s.tipo]}` : ''}
          </option>
        ))}
      </Select>
    </div>
  )
}

function BlocoImagemProva({
  imagemProva,
  uploadPend,
  erros,
  onArquivo,
}: {
  imagemProva?: string
  uploadPend: boolean
  erros?: string[]
  onArquivo: (file: File | undefined) => void
}) {
  const inputGaleriaId = 'onboarding-upload-galeria'
  const inputCameraId = 'onboarding-upload-camera'

  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
        Foto da carteirinha ou comprovante de vínculo <span className="text-red-500">*</span>
      </span>
      <div className="flex flex-wrap gap-2">
        <label
          htmlFor={inputGaleriaId}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-3 text-sm text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--surface))]"
        >
          {uploadPend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Enviar arquivo
        </label>
        <label
          htmlFor={inputCameraId}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-3 text-sm text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--surface))]"
        >
          {uploadPend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          Tirar foto
        </label>
      </div>
      <input
        id={inputGaleriaId}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={uploadPend}
        onChange={(e) => {
          void onArquivo(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        id={inputCameraId}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={uploadPend}
        onChange={(e) => {
          void onArquivo(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {imagemProva && (
        <p className="mt-2 flex items-center gap-1 text-xs text-emerald-600">
          <Check className="h-3 w-3" /> Imagem anexada
        </p>
      )}
      {erros?.[0] && <p className="mt-1 text-xs text-red-600">{erros[0]}</p>}
    </div>
  )
}

function BotaoVoltar({
  onClick,
  disabled,
  label = 'Voltar',
}: {
  onClick: () => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))] disabled:opacity-50"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  )
}

function BotaoPrimario({
  onClick,
  pending,
  disabled,
  label,
}: {
  onClick: () => void
  pending?: boolean
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending || disabled}
      className="inline-flex items-center gap-2 rounded-xl bg-[rgb(var(--color-primary))] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {label}
      {!pending && <ArrowRight className="h-4 w-4" />}
    </button>
  )
}

function Campo({
  label,
  obrigatorio,
  erros,
  children,
}: {
  label: string
  obrigatorio?: boolean
  erros?: string[]
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
        {label} {obrigatorio && <span className="text-red-500">*</span>}
      </label>
      {children}
      {erros && erros.length > 0 && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{erros[0]}</p>
      )}
    </div>
  )
}
