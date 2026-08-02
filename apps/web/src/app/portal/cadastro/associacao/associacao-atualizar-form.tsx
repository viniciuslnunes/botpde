'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@torcida/ui'
import { PERIODICIDADE_PLANO_LABEL } from '@torcida/types'
import { uploadMediaToCloudinary } from '@/lib/cloudinary-upload'
import { UFS_BRASIL } from '@/lib/ufs-brasil'
import {
  CAMPO_PENDENCIA_LABEL,
  type CampoPendenciaCadastro,
} from '@/lib/pendencias-cadastro'
import {
  completarDadosAssociacao,
  type CompletarAssociacaoState,
} from './actions'

export type ValoresAssociacaoForm = {
  numeroAssociado: string
  cpf: string
  rg: string
  dataNascimento: string
  logradouro: string
  bairro: string
  cep: string
  uf: string
  imagemProva: string
  fotoDocumentoUrl: string
  comprovanteResidenciaUrl: string
  responsavelNome: string
  responsavelDocumento: string
  dataExpedicaoIso: string
  periodicidadeAtual: string
  termoAceito: boolean
}

type Props = {
  faltantes: CampoPendenciaCadastro[]
  progresso: { ok: number; total: number }
  valores: ValoresAssociacaoForm
  periodicidades: string[]
  exigirDocumentos: boolean
  temCarteirinha: boolean
}

const initial: CompletarAssociacaoState = {}

function CampoArquivo({
  name,
  label,
  value,
  onUploaded,
}: {
  name: string
  label: string
  value: string
  onUploaded: (url: string) => void
}) {
  const [pending, start] = useTransition()
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-[rgb(var(--foreground))]">{label}</span>
      {value ? (
        <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">Arquivo enviado</p>
      ) : null}
      <input type="hidden" name={name} value={value} />
      <input
        type="file"
        accept="image/*,application/pdf"
        disabled={pending}
        className="block w-full text-sm"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (!file) return
          start(async () => {
            try {
              const url = await uploadMediaToCloudinary(file, undefined, 'cadastro')
              onUploaded(url)
              toast.success('Arquivo enviado.')
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Falha no upload.')
            }
          })
        }}
      />
      {pending ? <span className="text-xs text-[rgb(var(--foreground-muted))]">Enviando…</span> : null}
    </label>
  )
}

export function AssociacaoAtualizarForm({
  faltantes,
  progresso,
  valores,
  periodicidades,
  exigirDocumentos,
  temCarteirinha,
}: Props) {
  const router = useRouter()
  const [state, action, pending] = useActionState(completarDadosAssociacao, initial)
  const falta = new Set(faltantes)

  const [prova, setProva] = useState(valores.imagemProva)
  const [doc, setDoc] = useState(valores.fotoDocumentoUrl)
  const [residencia, setResidencia] = useState(valores.comprovanteResidenciaUrl)

  useEffect(() => {
    if (!state.ok) return
    if (state.emitida) {
      toast.success(state.message ?? 'Carteirinha emitida.')
      router.push('/portal/carteirinha')
      router.refresh()
      return
    }
    toast.message(state.message ?? 'Dados salvos.')
    router.refresh()
  }, [state, router])

  const show = (id: CampoPendenciaCadastro) => falta.has(id)

  return (
    <form action={action} className="space-y-5">
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        Completude: {progresso.ok}/{progresso.total}
        {faltantes.length > 0 ? ` · ${faltantes.length} obrigatório(s) faltando` : ' · completo'}
      </p>

      {state.message && state.errors && Object.keys(state.errors).length > 0 && !state.emitida ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
          {state.message}
        </p>
      ) : null}
      {state.message && !state.ok ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          {state.message}
        </p>
      ) : null}

      {show('numeroAssociado') ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{CAMPO_PENDENCIA_LABEL.numeroAssociado}</span>
          <input
            name="numeroAssociado"
            inputMode="numeric"
            defaultValue={valores.numeroAssociado}
            className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2.5 text-sm"
          />
        </label>
      ) : (
        <input type="hidden" name="numeroAssociado" value={valores.numeroAssociado} />
      )}

      {show('cpf') ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{CAMPO_PENDENCIA_LABEL.cpf}</span>
          <input
            name="cpf"
            defaultValue={valores.cpf}
            className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2.5 text-sm"
          />
        </label>
      ) : null}

      {show('rg') ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{CAMPO_PENDENCIA_LABEL.rg}</span>
          <input
            name="rg"
            defaultValue={valores.rg}
            className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2.5 text-sm"
          />
        </label>
      ) : null}

      {show('nascimento') ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{CAMPO_PENDENCIA_LABEL.nascimento}</span>
          <input
            type="date"
            name="dataNascimento"
            defaultValue={valores.dataNascimento}
            className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2.5 text-sm"
          />
        </label>
      ) : null}

      {show('logradouro') ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{CAMPO_PENDENCIA_LABEL.logradouro}</span>
          <input
            name="logradouro"
            defaultValue={valores.logradouro}
            className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2.5 text-sm"
          />
        </label>
      ) : null}

      {show('bairro') ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{CAMPO_PENDENCIA_LABEL.bairro}</span>
          <input
            name="bairro"
            defaultValue={valores.bairro}
            className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2.5 text-sm"
          />
        </label>
      ) : null}

      {show('cep') ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{CAMPO_PENDENCIA_LABEL.cep}</span>
          <input
            name="cep"
            defaultValue={valores.cep}
            className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2.5 text-sm"
          />
        </label>
      ) : null}

      {show('uf') ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{CAMPO_PENDENCIA_LABEL.uf}</span>
          <select
            name="uf"
            defaultValue={valores.uf}
            className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2.5 text-sm"
          >
            <option value="">Selecione</option>
            {UFS_BRASIL.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {show('resp-nome') ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{CAMPO_PENDENCIA_LABEL['resp-nome']}</span>
          <input
            name="responsavelNome"
            defaultValue={valores.responsavelNome}
            className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2.5 text-sm"
          />
        </label>
      ) : null}

      {show('resp-doc') ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{CAMPO_PENDENCIA_LABEL['resp-doc']}</span>
          <input
            name="responsavelDocumento"
            defaultValue={valores.responsavelDocumento}
            className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2.5 text-sm"
          />
        </label>
      ) : null}

      {show('termo') && !valores.termoAceito ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="termoResponsabilidade" value="true" className="mt-1" />
          <span>Li e aceito o termo de responsabilidade da torcida.</span>
        </label>
      ) : null}

      {show('prova') ? (
        <CampoArquivo
          name="imagemProva"
          label={CAMPO_PENDENCIA_LABEL.prova}
          value={prova}
          onUploaded={setProva}
        />
      ) : (
        <input type="hidden" name="imagemProva" value={prova} />
      )}

      {exigirDocumentos && show('documento') ? (
        <CampoArquivo
          name="fotoDocumentoUrl"
          label={CAMPO_PENDENCIA_LABEL.documento}
          value={doc}
          onUploaded={setDoc}
        />
      ) : null}

      {exigirDocumentos && show('residencia') ? (
        <CampoArquivo
          name="comprovanteResidenciaUrl"
          label={CAMPO_PENDENCIA_LABEL.residencia}
          value={residencia}
          onUploaded={setResidencia}
        />
      ) : null}

      {!temCarteirinha && show('dataExpedicaoCarteirinha') ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">
            {CAMPO_PENDENCIA_LABEL.dataExpedicaoCarteirinha}
          </span>
          <input
            type="date"
            name="dataExpedicaoCarteirinha"
            defaultValue={valores.dataExpedicaoIso}
            className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2.5 text-sm"
          />
        </label>
      ) : null}

      {!temCarteirinha && show('periodicidadePretendida') ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">
            {CAMPO_PENDENCIA_LABEL.periodicidadePretendida}
          </span>
          <select
            name="periodicidadePretendida"
            defaultValue={valores.periodicidadeAtual || periodicidades[0] || ''}
            className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2.5 text-sm"
          >
            {periodicidades.map((p) => (
              <option key={p} value={p}>
                {PERIODICIDADE_PLANO_LABEL[p as keyof typeof PERIODICIDADE_PLANO_LABEL] ?? p}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-[rgb(var(--color-primary))] px-4 py-3 text-sm font-semibold text-[rgb(var(--color-primary-fg))] disabled:opacity-60"
      >
        {pending ? 'Salvando…' : 'Salvar cadastro'}
      </button>
    </form>
  )
}
