'use client'

import { useRef, useState, useTransition } from 'react'
import { Camera, CheckCircle2, DoorOpen, QrCode, StopCircle, UserPlus } from 'lucide-react'
import { AppButton } from '@/components/ui/button'
import { useQrScanner } from '@/lib/use-qr-scanner'
import {
  registrarEntradaManual,
  registrarEntradaPorQr,
  type ResultadoPortariaEntrada,
} from '@/app/admin/portaria/actions'

export function PortariaScanner() {
  const [codigo, setCodigo] = useState('')
  const [resultado, setResultado] = useState<ResultadoPortariaEntrada | null>(null)
  const [pendente, iniciar] = useTransition()
  const ultimoRef = useRef('')

  const {
    videoRef,
    iniciar: abrirCamera,
    parar: fecharCamera,
    ativo,
    erro: erroCamera,
  } = useQrScanner(registrar)

  function registrar(bruto: string) {
    const limpo = bruto.trim()
    if (!limpo || limpo === ultimoRef.current || pendente) return
    ultimoRef.current = limpo

    iniciar(async () => {
      const r = await registrarEntradaPorQr(limpo)
      setResultado(r)
      if (r.ok) {
        setCodigo('')
        ultimoRef.current = ''
      }
    })
  }

  return (
    <section className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
          <DoorOpen className="h-4 w-4 text-[rgb(var(--color-primary-fg))]" />
          Carteirinha na portaria
        </h2>
        {ativo ? (
          <AppButton
            variant="secondary-soft"
            size="sm"
            icon={StopCircle}
            type="button"
            onClick={fecharCamera}
          >
            Parar câmera
          </AppButton>
        ) : (
          <AppButton
            variant="secondary-soft"
            size="sm"
            icon={Camera}
            type="button"
            onClick={() => void abrirCamera()}
          >
            Abrir câmera
          </AppButton>
        )}
      </div>

      <p className="text-xs text-[rgb(var(--foreground-muted))]">
        Valida a carteirinha e registra a entrada na sede. Diferente de{' '}
        <span className="font-medium">/carteirinha/validar</span>, que só consulta sem gravar histórico.
      </p>

      <video
        ref={videoRef}
        muted
        playsInline
        className={
          ativo
            ? 'aspect-video w-full max-w-md rounded-xl bg-black object-cover'
            : 'pointer-events-none absolute h-0 w-0 opacity-0'
        }
      />

      {erroCamera && (
        <p className="text-xs text-amber-700 dark:text-amber-400">{erroCamera}</p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          registrar(codigo)
        }}
        className="flex gap-2"
      >
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder="Ou cole o código da carteirinha"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 font-mono text-xs"
        />
        <AppButton
          variant="primary"
          icon={QrCode}
          type="submit"
          disabled={pendente || !codigo.trim()}
          loading={pendente}
        >
          Registrar
        </AppButton>
      </form>

      {resultado?.ok && (
        <div className="alert-success rounded-xl border p-3">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-[rgb(var(--foreground))]">
            <CheckCircle2 className="h-4 w-4 text-success" />
            Entrada registrada — {resultado.nome}
          </p>
          {resultado.numeroSocio !== undefined && (
            <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
              Nº sócio {String(resultado.numeroSocio).padStart(5, '0')}
            </p>
          )}
          {resultado.jaEntrouHoje && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              Atenção: esta pessoa já entrou hoje nesta sede.
            </p>
          )}
        </div>
      )}

      {resultado && !resultado.ok && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {resultado.error}
        </p>
      )}
    </section>
  )
}

export function PortariaVisitanteManual({ sedes }: { sedes: Array<{ id: string; nome: string }> }) {
  const [resultado, setResultado] = useState<ResultadoPortariaEntrada | null>(null)
  const [pendente, iniciar] = useTransition()

  return (
    <section className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
        <UserPlus className="h-4 w-4 text-[rgb(var(--color-primary-fg))]" />
        Visitante sem carteirinha
      </h2>
      <p className="text-xs text-[rgb(var(--foreground-muted))]">
        Convidado, prestador ou apoio pontual — registra nome e observação, sem vínculo de sócio.
      </p>

      <form
        className="space-y-3"
        action={(formData) => {
          iniciar(async () => {
            const r = await registrarEntradaManual(null, formData)
            setResultado(r)
          })
        }}
      >
        <div>
          <label htmlFor="visitanteNome" className="mb-1 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Nome
          </label>
          <input
            id="visitanteNome"
            name="visitanteNome"
            required
            minLength={2}
            className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm"
            placeholder="Ex.: João — convidado da diretoria"
          />
        </div>

        {sedes.length > 0 && (
          <div>
            <label htmlFor="sedeId" className="mb-1 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Unidade (opcional)
            </label>
            <select
              id="sedeId"
              name="sedeId"
              className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm"
              defaultValue=""
            >
              <option value="">Sede principal</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="observacao" className="mb-1 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Observação (opcional)
          </label>
          <input
            id="observacao"
            name="observacao"
            maxLength={280}
            className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm"
            placeholder="Motivo da visita"
          />
        </div>

        <AppButton variant="primary" icon={UserPlus} type="submit" loading={pendente}>
          Registrar visitante
        </AppButton>
      </form>

      {resultado?.ok && (
        <p className="alert-success rounded-xl border p-3 text-xs font-medium">
          Entrada registrada — {resultado.nome}
        </p>
      )}
      {resultado && !resultado.ok && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {resultado.error}
        </p>
      )}
    </section>
  )
}
