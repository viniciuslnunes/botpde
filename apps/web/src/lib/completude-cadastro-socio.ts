/**
 * Completude do cadastro de sócio — mesma regra do card admin
 * («Completude do cadastro» em `/admin/socios`) e do serviço de pendências
 * no portal. Funções puras, sem banco.
 */

export type CompletudeItemId =
  | 'numeroAssociado'
  | 'cpf'
  | 'rg'
  | 'nascimento'
  | 'logradouro'
  | 'bairro'
  | 'cep'
  | 'uf'
  | 'termo'
  | 'prova'
  | 'resp-nome'
  | 'resp-doc'
  | 'documento'
  | 'residencia'
  /** Extras de carteirinha (portal / emissão) — não entram no card admin. */
  | 'dataExpedicaoCarteirinha'
  | 'periodicidadePretendida'

export type CompletudeItem = {
  id: CompletudeItemId
  label: string
  ok: boolean
  obrigatorio: boolean
}

export type MembroParaCompletude = {
  isSocio: boolean
  idade?: number | null
  numeroAssociado?: string | null
  cpf?: string | null
  rg?: string | null
  /** ISO ou label já formatado — só precisa estar preenchido. */
  dataNascimento?: string | Date | null
  logradouro?: string | null
  bairro?: string | null
  cep?: string | null
  uf?: string | null
  termoResponsabilidadeAceitoEm?: Date | string | null
  imagemProva?: string | null
  responsavelNome?: string | null
  responsavelDocumento?: string | null
  autorizacaoMenorAceitaEm?: Date | string | null
  fotoDocumentoUrl?: string | null
  comprovanteResidenciaUrl?: string | null
  dataExpedicaoCarteirinha?: Date | string | null
  periodicidadePretendida?: string | null
}

export function preenchidoCompletude(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (v instanceof Date) return !Number.isNaN(v.getTime())
  return true
}

function ehMenor(m: MembroParaCompletude): boolean {
  return (
    (typeof m.idade === 'number' && m.idade < 18) ||
    preenchidoCompletude(m.responsavelNome) ||
    preenchidoCompletude(m.autorizacaoMenorAceitaEm)
  )
}

/**
 * Checklist espelhado no admin (`Completude do cadastro`).
 * `isSocio: false` → lista vazia.
 */
export function checklistCompletudeCadastro(m: MembroParaCompletude): CompletudeItem[] {
  if (!m.isSocio) return []
  const menor = ehMenor(m)
  return [
    {
      id: 'numeroAssociado',
      label: 'Nº de associado',
      ok: preenchidoCompletude(m.numeroAssociado),
      obrigatorio: true,
    },
    { id: 'cpf', label: 'CPF', ok: preenchidoCompletude(m.cpf), obrigatorio: true },
    { id: 'rg', label: 'RG', ok: preenchidoCompletude(m.rg), obrigatorio: true },
    {
      id: 'nascimento',
      label: 'Data de nascimento',
      ok: preenchidoCompletude(m.dataNascimento),
      obrigatorio: true,
    },
    {
      id: 'logradouro',
      label: 'Logradouro',
      ok: preenchidoCompletude(m.logradouro),
      obrigatorio: true,
    },
    { id: 'bairro', label: 'Bairro', ok: preenchidoCompletude(m.bairro), obrigatorio: true },
    { id: 'cep', label: 'CEP', ok: preenchidoCompletude(m.cep), obrigatorio: true },
    { id: 'uf', label: 'UF', ok: preenchidoCompletude(m.uf), obrigatorio: true },
    {
      id: 'termo',
      label: 'Termo de responsabilidade',
      ok: preenchidoCompletude(m.termoResponsabilidadeAceitoEm),
      obrigatorio: true,
    },
    {
      id: 'prova',
      label: 'Comprovante de vínculo',
      ok: preenchidoCompletude(m.imagemProva),
      obrigatorio: true,
    },
    ...(menor
      ? ([
          {
            id: 'resp-nome',
            label: 'Nome do responsável',
            ok: preenchidoCompletude(m.responsavelNome),
            obrigatorio: true,
          },
          {
            id: 'resp-doc',
            label: 'Documento do responsável',
            ok: preenchidoCompletude(m.responsavelDocumento),
            obrigatorio: true,
          },
        ] as CompletudeItem[])
      : []),
  ]
}

/** Documentos (aba Documents no card) — gateados por `exigirDocumentos`. */
export function checklistCompletudeDocumentos(
  m: MembroParaCompletude,
  exigirDocumentos: boolean,
): CompletudeItem[] {
  if (!m.isSocio || !exigirDocumentos) return []
  return [
    {
      id: 'prova',
      label: 'Comprovante de vínculo',
      ok: preenchidoCompletude(m.imagemProva),
      obrigatorio: true,
    },
    {
      id: 'documento',
      label: 'Foto do documento',
      ok: preenchidoCompletude(m.fotoDocumentoUrl),
      obrigatorio: true,
    },
    {
      id: 'residencia',
      label: 'Comprovante de residência',
      ok: preenchidoCompletude(m.comprovanteResidenciaUrl),
      obrigatorio: true,
    },
  ]
}

/**
 * Campos extras para emitir carteirinha digital (validade = expedição + período).
 * Só quando ainda não há `SaasSocio`.
 */
export function checklistCompletudeCarteirinha(
  m: MembroParaCompletude,
  temCarteirinha: boolean,
): CompletudeItem[] {
  if (!m.isSocio || temCarteirinha) return []
  return [
    {
      id: 'dataExpedicaoCarteirinha',
      label: 'Data de expedição da carteirinha',
      ok: preenchidoCompletude(m.dataExpedicaoCarteirinha),
      obrigatorio: true,
    },
    {
      id: 'periodicidadePretendida',
      label: 'Periodicidade / plano',
      ok: preenchidoCompletude(m.periodicidadePretendida),
      obrigatorio: true,
    },
  ]
}

export type CompletudeResumo = {
  itens: CompletudeItem[]
  okCount: number
  total: number
  faltando: CompletudeItem[]
  completo: boolean
}

/**
 * União cadastro + documentos (opcional) + carteirinha (se sem SaasSocio).
 * Fonte única para o serviço de pendências do portal.
 */
export function resumirCompletudeCadastroSocio(
  m: MembroParaCompletude,
  opts: { exigirDocumentos: boolean; temCarteirinha: boolean },
): CompletudeResumo {
  const porId = new Map<CompletudeItemId, CompletudeItem>()
  for (const item of [
    ...checklistCompletudeCadastro(m),
    ...checklistCompletudeDocumentos(m, opts.exigirDocumentos),
    ...checklistCompletudeCarteirinha(m, opts.temCarteirinha),
  ]) {
    // Documentos reusa `prova` — mantém o mais restritivo (já obrigatório).
    const prev = porId.get(item.id)
    if (!prev) {
      porId.set(item.id, item)
      continue
    }
    porId.set(item.id, {
      ...item,
      ok: prev.ok && item.ok,
      obrigatorio: prev.obrigatorio || item.obrigatorio,
    })
  }
  const itens = [...porId.values()]
  const faltando = itens.filter((i) => i.obrigatorio && !i.ok)
  return {
    itens,
    okCount: itens.filter((i) => i.ok).length,
    total: itens.length,
    faltando,
    completo: faltando.length === 0,
  }
}
