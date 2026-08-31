import { AlertTriangle, CheckCircle2, ChevronDown, IdCard } from 'lucide-react'
import { AssociacaoAtualizarForm } from '@/app/portal/cadastro/associacao/associacao-atualizar-form'
import type { CompletudeItemId } from '@/lib/completude-cadastro-socio'
import type { FichaAssociacaoPortal } from '@/lib/ficha-associacao-portal'

type TabId = 'resumo' | 'cadastro' | 'documentos' | 'associacao' | 'operacao'

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

function tabInicialDaFicha(ficha: FichaAssociacaoPortal): TabId {
  if (ficha.resumo.completo) return 'resumo'
  const primeiro = ficha.resumo.faltando[0]?.id
  if (!primeiro) return 'cadastro'
  return TAB_DO_CAMPO[primeiro] ?? 'cadastro'
}

type Props = {
  ficha: FichaAssociacaoPortal
}

/** Ficha permanente na carteirinha: progresso + formulário (sempre editável). */
export function CarteirinhaCadastroPanel({ ficha }: Props) {
  const { resumo } = ficha
  const completo = resumo.completo
  const tabInicial = tabInicialDaFicha(ficha)

  return (
    <section id="cadastro" className="scroll-mt-24 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-[rgb(var(--foreground))]">Cadastro de sócio</h2>
          <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
            Dados da ficha, documentos e da carteirinha — sempre à mão nesta aba.
          </p>
        </div>
        {completo ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Etapa concluída
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            Precisa atualizar
          </span>
        )}
      </div>

      {!completo ? (
        <p className="text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
          {resumo.okCount}/{resumo.total} preenchidos
          {resumo.faltando.length > 0
            ? ` · ${resumo.faltando.length} obrigatório(s) faltando`
            : null}
          . Complete para regularizar a vigência.
        </p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-[0_12px_40px_rgb(0_0_0_/_0.12)] sm:p-6">
        <AssociacaoAtualizarForm
          tenantId={ficha.tenantId}
          valores={ficha.valores}
          exigirDocumentos={ficha.exigirDocumentos}
          temCarteirinha={ficha.temCarteirinha}
          periodicidades={ficha.periodicidades}
          prefillOrigemNome={ficha.prefillOrigemNome}
          operacao={ficha.operacao}
          tabInicial={tabInicial}
          embutido
        />
      </div>
    </section>
  )
}

/** Chip no topo da carteirinha: em dia ou atalho para a ficha. */
export function CarteirinhaCadastroChip({
  completo,
  ok,
  total,
  faltando,
}: {
  completo: boolean
  ok: number
  total: number
  faltando: number
}) {
  return (
    <a
      href="#cadastro"
      className={[
        'flex min-h-11 items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
        completo
          ? 'border-green-200 bg-green-50 hover:bg-green-100/80 dark:border-green-900 dark:bg-green-950/30 dark:hover:bg-green-950/50'
          : 'border-amber-200 bg-amber-50 hover:bg-amber-100/80 dark:border-amber-900 dark:bg-amber-950/30 dark:hover:bg-amber-950/50',
      ].join(' ')}
    >
      {completo ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-700 dark:text-green-400" />
      ) : (
        <IdCard className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
      )}
      <div className="min-w-0 flex-1">
        <p
          className={[
            'text-sm font-semibold',
            completo
              ? 'text-green-900 dark:text-green-100'
              : 'text-amber-950 dark:text-amber-100',
          ].join(' ')}
        >
          {completo ? 'Cadastro de sócio em dia' : 'Completar cadastro de sócio'}
        </p>
        <p
          className={[
            'text-xs',
            completo
              ? 'text-green-800/80 dark:text-green-200/80'
              : 'text-amber-900/80 dark:text-amber-200/80',
          ].join(' ')}
        >
          {completo
            ? `${ok}/${total} · revisar ou atualizar dados`
            : `${ok}/${total} · ${faltando} obrigatório(s) faltando`}
        </p>
      </div>
      <ChevronDown className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" aria-hidden />
    </a>
  )
}
