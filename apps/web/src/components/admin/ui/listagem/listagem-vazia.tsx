import type { ReactNode } from 'react'
import Link from 'next/link'
import { FilterX } from 'lucide-react'
import {
  construirHrefLimparFiltros,
  temFiltroAtivo,
  type ListagemParams,
  type ListagemSpec,
} from '@/lib/listagem'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'

export interface ListagemVaziaProps {
  spec: ListagemSpec
  params: ListagemParams
  /** Estado de listagem realmente sem registros (nada cadastrado ainda). */
  vazio: { icon?: ReactNode; title: string; description?: ReactNode }
}

/**
 * Vazio de listagem. Distingue os dois casos que costumam ser tratados como um
 * só: não há registro cadastrado, ou há registros mas nenhum passa pelos filtros
 * atuais. No segundo caso o caminho de volta tem que estar na tela — senão o
 * admin conclui que perdeu dados.
 */
export function ListagemVazia({ spec, params, vazio }: ListagemVaziaProps) {
  if (!temFiltroAtivo(params)) {
    return (
      <MotionEmptyState
        icon={vazio.icon}
        title={vazio.title}
        description={vazio.description}
      />
    )
  }

  return (
    <MotionEmptyState
      icon={<FilterX className="h-10 w-10" aria-hidden />}
      title="Nenhum resultado para estes filtros"
      description={
        <>
          Os registros existem, mas nenhum passa pelos filtros atuais.{' '}
          <Link
            href={construirHrefLimparFiltros(spec, params)}
            className="font-medium text-[rgb(var(--color-primary-fg))] underline-offset-2 hover:underline"
          >
            Limpar filtros
          </Link>
          .
        </>
      }
    />
  )
}
