import { createElement } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Briefcase,
  Bus,
  Calendar,
  Flag,
  Landmark,
  MessageCircle,
  Music2,
  PartyPopper,
  Shield,
  ShoppingBag,
  Users,
  Wallet,
} from 'lucide-react'

/** Ícone de domínio por slug canônico — hub e home da área. */
export const DEPARTAMENTO_ICONE: Record<string, LucideIcon> = {
  diretoria: Shield,
  financeiro: Wallet,
  patrimonio: Landmark,
  bandeiras: Flag,
  bateria: Music2,
  caravanas: Bus,
  carnaval: PartyPopper,
  'social-e-eventos': Calendar,
  'materiais-loja': ShoppingBag,
  comunicacao: MessageCircle,
  feminino: Users,
}

export function iconeDepartamento(slug: string): LucideIcon {
  return DEPARTAMENTO_ICONE[slug] ?? Briefcase
}

/**
 * Ícone do departamento como componente.
 *
 * Preferir a `iconeDepartamento` no JSX: guardar o retorno numa variável
 * (`const Icon = iconeDepartamento(slug)`) e usá-la como tag faz o React
 * Compiler ler aquilo como componente criado durante o render — ele não
 * enxerga que a origem é um mapa estático. Aqui o elemento sai de
 * `createElement`, sem binding de componente no render de quem chama.
 */
export function DepartamentoIcone({ slug, className }: { slug: string; className?: string }) {
  return createElement(iconeDepartamento(slug), { className, 'aria-hidden': true })
}
