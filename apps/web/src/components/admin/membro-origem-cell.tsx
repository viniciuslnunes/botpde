import {
  Compass,
  Download,
  Link2,
  MapPin,
  Sparkles,
  UserRoundPlus,
} from 'lucide-react'
import type { AdminMembroItem } from '@/app/admin/membros/admin-membro-item'
import { formatCaixaAltaListagem } from '@/lib/admin-listagem-format'
import {
  resolverOrigemExibicao,
  type OrigemCanal,
} from '@/lib/membro-origem'

const ICONE: Record<OrigemCanal, typeof Link2> = {
  convite: Link2,
  onboarding: Compass,
  'associe-se': MapPin,
  importacao: Download,
  upgrade_torcedor: UserRoundPlus,
  portal: Sparkles,
}

/** Célula da coluna Origem — unidade de solicitação + canal de entrada. */
export function MembroOrigemCell({
  membro,
}: {
  membro: Pick<
    AdminMembroItem,
    'aprovadoNaUnidadeNome' | 'espelhado' | 'origemCanal' | 'importacaoId'
  >
}) {
  const origem = resolverOrigemExibicao(membro)
  const Icon = origem.canal ? ICONE[origem.canal] : MapPin

  return (
    <div className="min-w-[9rem] max-w-[16rem]">
      <p className="flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--foreground))]">
        <Icon
          className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--foreground-muted))]"
          aria-hidden
        />
        <span className="truncate">
          {formatCaixaAltaListagem(origem.unidadeNome) ?? origem.unidadeNome}
        </span>
      </p>
      {origem.canalLabel ? (
        <p className="mt-0.5 truncate pl-5 text-[11px] leading-tight text-[rgb(var(--foreground-muted))]">
          {origem.canalLabel}
        </p>
      ) : null}
    </div>
  )
}
