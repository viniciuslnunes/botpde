import { ExternalLink, FileText, Home, IdCard, UserCircle2 } from 'lucide-react'

export type SolicitacaoResumoCardData = {
  nome: string
  tipo: string
  telefone: string | null
  cidade: string | null
  dataNascimentoLabel?: string | null
  rg?: string | null
  cpf?: string | null
  logradouro?: string | null
  numero?: string | null
  bloco?: string | null
  complemento?: string | null
  bairro?: string | null
  cep?: string | null
  uf?: string | null
  responsavelNome?: string | null
  responsavelDocumento?: string | null
  imagemProva?: string | null
  fotoDocumentoUrl?: string | null
  comprovanteResidenciaUrl?: string | null
}

function Campo({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  if (!value) return null
  return (
    <div className="space-y-1 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        {label}
      </p>
      <p className="text-sm text-[rgb(var(--foreground))]">{value}</p>
    </div>
  )
}

function Anexo({
  titulo,
  url,
}: {
  titulo: string
  url: string | null | undefined
}) {
  if (!url) return null
  return (
    <article className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
      <div className="flex items-center justify-between border-b border-[rgb(var(--border))] px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-[rgb(var(--foreground))]">
          <FileText className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
          {titulo}
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
        >
          Abrir
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      <div className="bg-[rgb(var(--background))] p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={titulo} className="max-h-72 w-full rounded-xl object-contain" />
      </div>
    </article>
  )
}

function montarEndereco(data: SolicitacaoResumoCardData): string | null {
  const linha1 = [data.logradouro, data.numero].filter(Boolean).join(', ')
  const linha2 = [data.bloco, data.complemento, data.bairro].filter(Boolean).join(' · ')
  const linha3 = [data.cidade, data.uf, data.cep].filter(Boolean).join(' · ')
  return [linha1, linha2, linha3].filter(Boolean).join('\n') || null
}

export function SolicitacaoResumoCard({
  data,
  titulo = 'Informações enviadas',
  descricao = 'Confira abaixo os dados e anexos registrados nesta solicitação.',
}: {
  data: SolicitacaoResumoCardData
  titulo?: string
  descricao?: string
}) {
  const endereco = montarEndereco(data)
  const temResponsavel = data.responsavelNome || data.responsavelDocumento
  const temAnexos =
    data.imagemProva || data.fotoDocumentoUrl || data.comprovanteResidenciaUrl

  return (
    <section className="space-y-5 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <div>
        <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">{titulo}</h2>
        <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">{descricao}</p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          <UserCircle2 className="h-4 w-4" />
          Dados do cadastro
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nome" value={data.nome} />
          <Campo label="Tipo de vínculo" value={data.tipo} />
          <Campo label="Telefone" value={data.telefone} />
          <Campo label="Cidade" value={data.cidade} />
          <Campo label="Data de nascimento" value={data.dataNascimentoLabel} />
          <Campo label="RG" value={data.rg} />
          <Campo label="CPF" value={data.cpf} />
        </div>
      </div>

      {endereco ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            <Home className="h-4 w-4" />
            Endereço informado
          </div>
          <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-3 text-sm whitespace-pre-line text-[rgb(var(--foreground))]">
            {endereco}
          </div>
        </div>
      ) : null}

      {temResponsavel ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            <IdCard className="h-4 w-4" />
            Responsável legal
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nome do responsável" value={data.responsavelNome} />
            <Campo label="Documento do responsável" value={data.responsavelDocumento} />
          </div>
        </div>
      ) : null}

      {temAnexos ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            <FileText className="h-4 w-4" />
            Anexos enviados
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Anexo titulo="Comprovante de vínculo" url={data.imagemProva} />
            <Anexo titulo="Foto do documento" url={data.fotoDocumentoUrl} />
            <Anexo titulo="Comprovante de residência" url={data.comprovanteResidenciaUrl} />
          </div>
        </div>
      ) : null}
    </section>
  )
}
