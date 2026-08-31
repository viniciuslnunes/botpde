import { describe, expect, it, vi, beforeEach } from 'vitest'

const toastCustom = vi.fn()
const toastAction = vi.fn()
const toastDismiss = vi.fn()
const locationAssign = vi.fn()

vi.mock('@torcida/ui', () => ({
  toast: {
    custom: (...args: unknown[]) => toastCustom(...args),
    action: (...args: unknown[]) => toastAction(...args),
    dismiss: (...args: unknown[]) => toastDismiss(...args),
  },
}))

vi.mock('@/components/portal/notification-item-visual', () => ({
  NotificationAvatar: () => null,
}))

import {
  LINK_APOS_APROVACAO_MEMBRO,
  TIPOS_QUE_EXIGEM_REFRESH,
  criarVigiaDeNotificacoes,
  redirecionarAposAprovacaoMembro,
} from '@/lib/notification-toast'
import type { NotificationItem } from '@/components/portal/notification-bell'

function notif(partial: Partial<NotificationItem> & Pick<NotificationItem, 'id' | 'tipo'>): NotificationItem {
  return {
    titulo: 't',
    corpo: null,
    link: null,
    lida: false,
    criadoEm: new Date().toISOString(),
    ator: null,
    ...partial,
  }
}

describe('criarVigiaDeNotificacoes', () => {
  beforeEach(() => {
    toastCustom.mockClear()
    toastAction.mockClear()
    locationAssign.mockClear()
    vi.stubGlobal('window', { location: { assign: locationAssign } })
  })

  it('semear ids no primeiro fetch não dispara toast nem redirect', () => {
    const vigia = criarVigiaDeNotificacoes('/portal/comunidade/notificacoes')
    const navegar = vi.fn()
    const precisa = vigia(
      [notif({ id: 'n1', tipo: 'MEMBRO_APROVADO', link: '/auth/contexto' })],
      navegar,
    )
    expect(precisa).toBe(false)
    expect(toastCustom).not.toHaveBeenCalled()
    expect(locationAssign).not.toHaveBeenCalled()
  })

  it('MEMBRO_APROVADO nova redireciona na hora para /auth/contexto', () => {
    const vigia = criarVigiaDeNotificacoes('/portal/comunidade/notificacoes')
    const navegar = vi.fn()
    vigia([notif({ id: 'seed', tipo: 'MENCAO' })], navegar)

    const precisa = vigia(
      [
        notif({ id: 'seed', tipo: 'MENCAO' }),
        notif({
          id: 'aprov',
          tipo: 'MEMBRO_APROVADO',
          titulo: 'Sua solicitação foi aprovada',
          corpo: 'Você agora é membro.',
          link: LINK_APOS_APROVACAO_MEMBRO,
        }),
      ],
      navegar,
    )

    expect(precisa).toBe(false)
    expect(toastCustom).toHaveBeenCalledTimes(1)
    expect(locationAssign).toHaveBeenCalledWith(LINK_APOS_APROVACAO_MEMBRO)
    expect(navegar).not.toHaveBeenCalled()
  })

  it('usa /auth/contexto quando o link da aprovação vem vazio', () => {
    const vigia = criarVigiaDeNotificacoes('/portal/comunidade/notificacoes')
    vigia([], vi.fn())
    vigia([notif({ id: 'aprov', tipo: 'MEMBRO_APROVADO', link: '  ' })], vi.fn())
    expect(locationAssign).toHaveBeenCalledWith(LINK_APOS_APROVACAO_MEMBRO)
  })

  it('tipos que mudam chrome SSR pedem router.refresh', () => {
    const vigia = criarVigiaDeNotificacoes('/portal/comunidade/notificacoes')
    vigia([notif({ id: 'seed', tipo: 'MENCAO' })], vi.fn())
    const precisa = vigia(
      [
        notif({ id: 'seed', tipo: 'MENCAO' }),
        notif({ id: 'acesso', tipo: 'ACESSO_ATUALIZADO', titulo: 'Seu acesso mudou' }),
      ],
      vi.fn(),
    )
    expect(precisa).toBe(true)
    expect(toastCustom).toHaveBeenCalled()
    expect(TIPOS_QUE_EXIGEM_REFRESH.has('ACESSO_ATUALIZADO')).toBe(true)
    expect(TIPOS_QUE_EXIGEM_REFRESH.has('EVENTO_CANCELADO')).toBe(true)
    expect(TIPOS_QUE_EXIGEM_REFRESH.has('NOVA_REACAO')).toBe(false)
  })
})

describe('redirecionarAposAprovacaoMembro', () => {
  it('chama location.assign', () => {
    locationAssign.mockClear()
    vi.stubGlobal('window', { location: { assign: locationAssign } })
    redirecionarAposAprovacaoMembro('/auth/contexto')
    expect(locationAssign).toHaveBeenCalledWith('/auth/contexto')
  })
})
