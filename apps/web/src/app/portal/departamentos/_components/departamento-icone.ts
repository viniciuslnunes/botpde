import type { LucideIcon } from 'lucide-react'
import {
  Briefcase,
  Bus,
  Calendar,
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
