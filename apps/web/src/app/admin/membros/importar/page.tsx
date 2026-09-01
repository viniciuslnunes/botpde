import { db } from '@torcida/db'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS } from '@torcida/types'
import { redirect } from 'next/navigation'
import { Inbox, Upload } from 'lucide-react'
import { AdminDetailHeader } from '@/components/admin/ui'
import { ImportForm } from '@/components/admin/import-form'
import { UndoImportButton } from '@/components/admin/undo-import-button'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Importar membros — Admin' }

/** Linha do histórico — tipo explícito (ver ARCHITECTURE.md §5.2). */
type ImportacaoLite = {
  id: string
  origem: 'CSV' | 'BOT' | 'DISCORD' | 'MOCK'
  status: 'PENDENTE' | 'PROCESSANDO' | 'CONCLUIDA' | 'ERRO'
  totalLinhas: number
  importados: number
  duplicados: number
  criadoEm: Date
}

const ORIGEM_LABEL: Record<ImportacaoLite['origem'], string> = {
  CSV: 'CSV',
  BOT: 'Bot Discord',
  DISCORD: 'Discord',
  MOCK: 'Mock (demonstração)',
}

const STATUS_BADGE: Record<ImportacaoLite['status'], { label: string; className: string }> = {
  PENDENTE: {
    label: 'Pendente',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  },
  PROCESSANDO: {
    label: 'Processando',
    className: 'bg-[rgb(var(--color-info)_/_0.14)] text-[rgb(var(--color-info-fg))]',
  },
  CONCLUIDA: {
    label: 'Concluída',
    className: 'bg-[rgb(var(--color-success)_/_0.14)] text-[rgb(var(--color-success-fg))]',
  },
  ERRO: {
    label: 'Erro',
    className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  },
}

export default async function ImportarMembrosPage() {
  // Tenant do próprio gate (tenant ativo), não do host.
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.MEMBERS_VIEW))
  } catch {
    redirect('/admin')
  }

  const importacoes: ImportacaoLite[] = await db.importacaoMembros.findMany({
    where: { tenantId: tenant.id },
    select: {
      id: true,
      origem: true,
      status: true,
      totalLinhas: true,
      importados: true,
      duplicados: true,
      criadoEm: true,
    },
    orderBy: { criadoEm: 'desc' },
    take: 20,
  })

  return (
    <div className="space-y-6">
      <AdminDetailHeader
        title="Importar base de associados"
        backHref="/admin/torcedores"
        backLabel="Membros"
        icon={<Upload className="h-5 w-5" />}
        description="Traga a base existente da torcida para o sistema. Nesta fase, use dados de demonstração para validar a apresentação."
      />

      <ImportForm />

      <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
        <div className="border-b border-[rgb(var(--border))] px-6 py-4">
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Histórico de importações</h2>
        </div>

        {importacoes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <Inbox className="h-8 w-8 text-[rgb(var(--foreground-muted))]" />
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Nenhuma importação ainda. Use o formulário acima para a primeira.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--border))] text-left text-xs text-[rgb(var(--foreground-muted))]">
                  <th className="px-6 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Origem</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Linhas</th>
                  <th className="px-4 py-3 text-right font-medium">Importados</th>
                  <th className="px-4 py-3 text-right font-medium">Duplicados</th>
                  <th className="px-6 py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {importacoes.map((imp) => (
                  <tr key={imp.id} className="border-b border-[rgb(var(--border))] last:border-0">
                    <td className="px-6 py-3 text-[rgb(var(--foreground))]">
                      {imp.criadoEm.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-4 py-3 text-[rgb(var(--foreground))]">{ORIGEM_LABEL[imp.origem]}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[imp.status].className}`}
                      >
                        {STATUS_BADGE[imp.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-[rgb(var(--foreground))]">{imp.totalLinhas}</td>
                    <td className="px-4 py-3 text-right text-[rgb(var(--foreground))]">{imp.importados}</td>
                    <td className="px-4 py-3 text-right text-[rgb(var(--foreground-muted))]">{imp.duplicados}</td>
                    <td className="px-6 py-3">
                      <div className="flex justify-end">
                        {imp.origem === 'MOCK' && <UndoImportButton importacaoId={imp.id} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
