import Link from 'next/link'
import { ArrowLeft, Eye } from 'lucide-react'
import { Badge } from '@torcida/ui'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { DepartamentoIcone } from '../../_components/departamento-icone'

export function DepartamentoCockpitHeader({
  nome,
  slug,
  cor,
  moduloLabel,
  mission,
  isGestor,
  isAtuacao,
  totalPendentes,
}: {
  nome: string
  slug: string
  cor: string
  moduloLabel: string
  mission: string
  isGestor: boolean
  isAtuacao: boolean
  totalPendentes: number
}) {
  const papel = isGestor ? (
    <Badge variant="primary">Gestor</Badge>
  ) : isAtuacao ? (
    <Badge variant="neutral">Membro</Badge>
  ) : (
    <Badge variant="neutral" icon={<Eye className="h-3 w-3" aria-hidden />}>
      Só leitura
    </Badge>
  )

  return (
    <div className="space-y-3">
      <Link
        href="/portal/departamentos"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Departamentos
      </Link>

      <MotionReveal>
        <header className="flex flex-wrap items-start gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white"
            style={{ backgroundColor: cor }}
          >
            <DepartamentoIcone slug={slug} className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">{nome}</h1>
              {papel}
            </div>
            <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
              {moduloLabel}
              {totalPendentes > 0
                ? ` · ${totalPendentes} pendente${totalPendentes === 1 ? '' : 's'} na fila`
                : ''}
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
              {mission}
            </p>
          </div>
        </header>
      </MotionReveal>
    </div>
  )
}
