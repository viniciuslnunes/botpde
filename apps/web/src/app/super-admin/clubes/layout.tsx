import type { ReactNode } from 'react'
import { Shield, BarChart3, ListChecks } from 'lucide-react'
import { db } from '@torcida/db'
import { AdminPageHeader, type AdminModuleTabItem } from '@/components/admin/ui'
import { ClubesModuloChrome } from './_components/clubes-modulo-chrome'

const ICONE = 'h-4 w-4 shrink-0'

/**
 * Módulo Clubes do super-admin — catálogo global de `Afiliacao`.
 *
 * Tab = rota (padrão `AdminModuleTabs`), com o detalhe `/clubes/[id]` casando a
 * tab Catálogo por `matchPaths`. O gate de acesso já é do layout de
 * `/super-admin` (allowlist de e-mail); aqui não há RBAC por tenant porque a
 * entidade é global.
 *
 * O chrome client esconde as tabs no fluxo de cadastro (mesmo motivo da
 * listagem: não competir com o formulário em etapas).
 */
export default async function ClubesModuloLayout({ children }: { children: ReactNode }) {
  // Cadastro incompleto é a pendência acionável do módulo — vira contagem na
  // tab de Qualidade para não precisar entrar para descobrir que há trabalho.
  const incompletos: number = await db.afiliacao.count({
    where: {
      ativo: true,
      OR: [
        { escudoUrl: null },
        { escudoUrl: '' },
        { serie: null },
        { estado: null },
        { estado: '' },
        { slug: null },
      ],
    },
  })

  const tabs: AdminModuleTabItem[] = [
    {
      id: 'catalogo',
      label: 'Catálogo',
      href: '/super-admin/clubes',
      icon: <Shield className={ICONE} />,
      matchPaths: ['/super-admin/clubes'],
    },
    {
      id: 'metricas',
      label: 'Métricas',
      href: '/super-admin/clubes/metricas',
      icon: <BarChart3 className={ICONE} />,
    },
    {
      id: 'qualidade',
      label: 'Qualidade',
      href: '/super-admin/clubes/qualidade',
      icon: <ListChecks className={ICONE} />,
      count: incompletos,
      countClass: 'bg-[rgb(var(--color-warning)_/_0.16)] text-[rgb(var(--color-warning-fg))]',
    },
  ]

  return (
    <div className="flex min-h-full flex-col">
      <AdminPageHeader
        title="Clubes"
        description="Catálogo global de times apoiados. É o que o onboarding oferece, o que o mapa desenha e o que os widgets da Sofascore resolvem por slug — cadastro incompleto apaga funcionalidade em silêncio."
        icon={<Shield className="h-5 w-5" />}
      />

      <div className="app-container min-w-0 flex-1 space-y-6 py-5 sm:py-8">
        <ClubesModuloChrome tabs={tabs}>{children}</ClubesModuloChrome>
      </div>
    </div>
  )
}
