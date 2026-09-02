'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, CheckCircle2, Download } from 'lucide-react'
import { toast } from '@torcida/ui'
import { importarMock, type ResultadoImportacao } from '@/app/admin/membros/importar/actions'
import { useTrackedForm } from '@/lib/unsaved-changes'
import { AppButton } from '@/components/ui/button'

/**
 * Formulário de importação. Só a origem MOCK está ativa nesta fase — BOT e CSV
 * aparecem desabilitadas ("em breve") até existir base real para consultar.
 * Ver docs/data/spec-importacao-membros.md.
 */
export function ImportForm() {
  const [pending, startTransition] = useTransition()
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const { formRef, markPristine } = useTrackedForm({ title: 'Importação de membros' })

  function handleSubmit(formData: FormData) {
    setResultado(null)
    startTransition(async () => {
      try {
        const res = await toast
          .promise(
            importarMock(formData).then((data) => {
              if (!data.success) {
                throw new Error(data.error ?? 'Não foi possível importar.')
              }
              return data
            }),
            {
              loading: 'Importando membros…',
              success: (data) =>
                `${data.importados ?? 0} importados · ${data.duplicados ?? 0} duplicados · ${data.erros ?? 0} erros`,
              error: (err) =>
                err instanceof Error ? err.message : 'Não foi possível importar.',
              id: 'importacao-membros',
            },
          )
          .unwrap()
        setResultado(res)
        markPristine()
      } catch (err) {
        setResultado({
          success: false,
          error: err instanceof Error ? err.message : 'Não foi possível importar.',
        })
      }
    })
  }

  return (
    <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
      <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Nova importação</h2>
      <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
        Dados de demonstração (mock) para validar a apresentação — rastreáveis e reversíveis.
      </p>

      {/* Seletor de origem — só MOCK habilitada nesta fase */}
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-lg border border-[rgb(var(--primary))] bg-[rgb(var(--primary))]/10 px-3 py-1.5 text-xs font-medium text-[rgb(var(--color-primary-fg))]">
          Mock (demonstração)
        </span>
        <span
          className="cursor-not-allowed rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] opacity-60"
          title="Disponível quando houver base real do bot"
        >
          Bot Discord — em breve
        </span>
        <span
          className="cursor-not-allowed rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] opacity-60"
          title="Disponível quando houver arquivo da torcida"
        >
          CSV — em breve
        </span>
      </div>

      <form ref={formRef} action={handleSubmit} className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="quantidade" className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Quantidade de membros
          </label>
          <input
            id="quantidade"
            name="quantidade"
            data-unsaved-label="Quantidade de membros"
            type="number"
            min={1}
            max={500}
            defaultValue={50}
            required
            className="mt-1 w-32 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-1.5 text-sm text-[rgb(var(--foreground))]"
          />
        </div>
        <AppButton
          variant="primary"
          icon={Download}
          loading={pending}
          type="submit"
          disabled={pending}
          className="flex gap-1.5 rounded-lg px-4 py-2 text-xs font-medium"
        >
          {pending ? 'Importando…' : 'Importar'}
        </AppButton>
      </form>

      {resultado && !resultado.success && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {resultado.error}
        </div>
      )}

      {resultado?.success && (
        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border alert-success px-4 py-3 text-xs">
          <span className="flex items-center gap-1.5 font-medium text-success">
            <CheckCircle2 className="h-4 w-4" /> Importação concluída
          </span>
          <span className="text-success">{resultado.importados} importados</span>
          <span className="text-success">{resultado.duplicados} duplicados</span>
          <span className="text-success">{resultado.erros} erros</span>
        </div>
      )}
    </div>
  )
}
