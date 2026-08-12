'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { m } from 'motion/react'
import { Plus, X } from 'lucide-react'
import {
  AdminModuleTabs,
  type AdminModuleTabItem,
} from '@/components/admin/ui'
import { springSnappy } from '@/lib/motion-presets'
import { ClubeForm } from './clube-form'

const CadastroClubeCtx = createContext<{ abrir: () => void } | null>(null)

/** UUID v4-ish — id de `Afiliacao` nas rotas `/clubes/[id]/…`. */
const CLUBE_ID_RE = /^\/super-admin\/clubes\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i

function clubeIdDoPathname(pathname: string): string | null {
  const m = CLUBE_ID_RE.exec(pathname)
  return m?.[1] ?? null
}

/**
 * Na listagem: tabs nacionais. No detalhe `/clubes/[id]…`: mesmas abas, hrefs
 * apontando para métricas/qualidade daquele clube — senão o operador cai nos
 * totais nacionais sem perceber.
 */
function tabsParaContexto(
  tabsNacionais: AdminModuleTabItem[],
  clubeId: string | null,
): AdminModuleTabItem[] {
  if (!clubeId) return tabsNacionais

  const base = `/super-admin/clubes/${clubeId}`
  return tabsNacionais.map((tab) => {
    if (tab.id === 'catalogo') {
      return {
        ...tab,
        href: base,
        matchPaths: [base],
      }
    }
    if (tab.id === 'metricas') {
      return {
        ...tab,
        href: `${base}/metricas`,
        matchPaths: undefined,
      }
    }
    if (tab.id === 'qualidade') {
      return {
        ...tab,
        href: `${base}/qualidade`,
        matchPaths: undefined,
        // Contagem nacional não cabe no contexto do clube.
        count: undefined,
      }
    }
    return tab
  })
}

/**
 * Chrome do módulo Clubes: tabs de rota no modo catálogo, e formulário
 * imersivo ao cadastrar (sem tabs / listagem por baixo — só confunde).
 */
export function ClubesModuloChrome({
  tabs,
  children,
}: {
  tabs: AdminModuleTabItem[]
  children: ReactNode
}) {
  const pathname = usePathname()
  const [cadastrando, setCadastrando] = useState(false)

  const clubeId = useMemo(() => clubeIdDoPathname(pathname), [pathname])
  const tabsEfetivas = useMemo(() => tabsParaContexto(tabs, clubeId), [tabs, clubeId])

  if (cadastrando) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Cadastrar clube</h2>
          <button
            type="button"
            onClick={() => setCadastrando(false)}
            aria-label="Fechar cadastro e voltar ao catálogo"
            className="rounded-lg p-1 text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <ClubeForm />
      </div>
    )
  }

  return (
    <CadastroClubeCtx.Provider value={{ abrir: () => setCadastrando(true) }}>
      <AdminModuleTabs tabs={tabsEfetivas}>{children}</AdminModuleTabs>
    </CadastroClubeCtx.Provider>
  )
}

/** Botão da toolbar do catálogo — abre o fluxo imersivo de cadastro. */
export function NovoClubeBotao() {
  const ctx = useContext(CadastroClubeCtx)
  if (!ctx) return null

  return (
    <m.button
      type="button"
      onClick={ctx.abrir}
      whileTap={{ scale: 0.97 }}
      transition={springSnappy}
      className="flex items-center gap-2 rounded-xl bg-[rgb(var(--color-primary))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-primary-on))] hover:opacity-90"
    >
      <Plus className="h-4 w-4" aria-hidden />
      Novo clube
    </m.button>
  )
}
