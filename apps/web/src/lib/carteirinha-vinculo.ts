/**
 * Vínculo do sócio na carteirinha: área e papel são por nível da hierarquia.
 *
 * Quem entra por uma unidade Caso B tem duas linhas (`SaasMembro` origem +
 * espelho na Sede) e pode ser gestor da bateria na PDE e membro da bateria
 * na sede — `Departamento` é por tenant. Preferência de onboarding ≠ equipe
 * em vigor (`UserDepartamento` / Role de área).
 *
 * Puro (sem Prisma) para o teste da regra. A carga mora em
 * `ficha-associacao-portal.ts`.
 */
import { PAPEL_DEPARTAMENTO } from '@torcida/types'

export type PapelAreaVinculo =
  | typeof PAPEL_DEPARTAMENTO.MEMBRO
  | typeof PAPEL_DEPARTAMENTO.GESTOR

export type AreaEfetivadaNivel = {
  departamentoId: string
  departamentoNome: string
  papel: PapelAreaVinculo | null
}

export type PreferenciaArea = { id: string; nome: string }

export type NivelVinculoInput = {
  nivel: 'unidade' | 'sede'
  localNome: string
  preferencia: PreferenciaArea | null
  efetivadas: AreaEfetivadaNivel[]
}

export type NivelVinculoView = {
  nivel: 'unidade' | 'sede'
  rotulo: string
  localNome: string
  departamentoNome: string | null
  papelLabel: string | null
  situacaoLabel: string
  /** Frase pronta: "Gestor da Bateria", "Bateria", "Sem área neste nível". */
  atuacao: string
}

export type MembroVinculoLite = {
  tenantId: string
  espelhado: boolean
  tenantNome: string
  sedeNome: string | null
  departamento: PreferenciaArea | null
  departamentoSede: PreferenciaArea | null
}

export type ParVinculoLite = {
  tenantId: string
  tenantNome: string
  sedeNome: string | null
  departamento: PreferenciaArea | null
} | null

const ROTULO_UNIDADE = 'Na sua unidade'
const ROTULO_SEDE = 'Na sede'
const ROTULO_TORCIDA = 'Na torcida'

export function rotuloPapelDepartamento(papel: PapelAreaVinculo | null): string | null {
  if (papel === PAPEL_DEPARTAMENTO.GESTOR) return 'Gestor'
  if (papel === PAPEL_DEPARTAMENTO.MEMBRO) return 'Membro'
  return null
}

export function papelAreaDe(raw: string | null | undefined): PapelAreaVinculo | null {
  if (raw === PAPEL_DEPARTAMENTO.GESTOR) return PAPEL_DEPARTAMENTO.GESTOR
  if (raw === PAPEL_DEPARTAMENTO.MEMBRO) return PAPEL_DEPARTAMENTO.MEMBRO
  return null
}

/**
 * Junta membership (`UserDepartamento`) com perfil de área (`Role`). O Role
 * carrega o papel; membership sozinho conta como em vigor sem papel explícito.
 * GESTOR vence MEMBRO no mesmo departamento.
 */
export function mesclarEquipeNivel(
  memberships: Array<{ departamentoId: string; departamentoNome: string }>,
  perfis: Array<{
    departamentoId: string
    departamentoNome: string
    papel: string | null
  }>,
): AreaEfetivadaNivel[] {
  const porId = new Map<string, AreaEfetivadaNivel>()

  const registrar = (
    departamentoId: string,
    departamentoNome: string,
    papel: PapelAreaVinculo | null,
  ) => {
    if (!departamentoId) return
    const atual = porId.get(departamentoId)
    if (!atual) {
      porId.set(departamentoId, { departamentoId, departamentoNome, papel })
      return
    }
    if (papel === PAPEL_DEPARTAMENTO.GESTOR) atual.papel = PAPEL_DEPARTAMENTO.GESTOR
    else if (papel && !atual.papel) atual.papel = papel
    if (departamentoNome && !atual.departamentoNome) atual.departamentoNome = departamentoNome
  }

  for (const m of memberships) registrar(m.departamentoId, m.departamentoNome, null)
  for (const p of perfis) registrar(p.departamentoId, p.departamentoNome, papelAreaDe(p.papel))

  return [...porId.values()].sort((a, b) =>
    a.departamentoNome.localeCompare(b.departamentoNome, 'pt-BR'),
  )
}

export function montarNiveisVinculo(niveis: NivelVinculoInput[]): NivelVinculoView[] {
  const dual = niveis.length > 1
  return niveis.map((n) => {
    const efetivadas = n.efetivadas
    const usaEfetivadas = efetivadas.length > 0
    const papelLabelUnico =
      usaEfetivadas && efetivadas.length === 1
        ? rotuloPapelDepartamento(efetivadas[0]!.papel)
        : null

    let departamentoNome: string | null
    if (usaEfetivadas) {
      const preferida = n.preferencia
        ? efetivadas.find((e) => e.departamentoId === n.preferencia!.id)
        : undefined
      departamentoNome =
        efetivadas.length === 1
          ? (preferida ?? efetivadas[0]!).departamentoNome
          : efetivadas.map((e) => e.departamentoNome).join(' · ')
    } else {
      departamentoNome = n.preferencia?.nome ?? null
    }

    const situacaoLabel = usaEfetivadas
      ? 'Em vigor'
      : departamentoNome
        ? 'Pretendida — ainda não na equipe'
        : 'Sem área neste nível'

    return {
      nivel: n.nivel,
      rotulo: dual ? (n.nivel === 'unidade' ? ROTULO_UNIDADE : ROTULO_SEDE) : ROTULO_TORCIDA,
      localNome: n.localNome,
      departamentoNome,
      papelLabel: papelLabelUnico,
      situacaoLabel,
      atuacao: montarAtuacao(departamentoNome, efetivadas, usaEfetivadas),
    }
  })
}

function montarAtuacao(
  departamentoNome: string | null,
  efetivadas: AreaEfetivadaNivel[],
  usaEfetivadas: boolean,
): string {
  if (usaEfetivadas) {
    return efetivadas
      .map((e) => {
        const papel = rotuloPapelDepartamento(e.papel)
        return papel ? `${papel} da ${e.departamentoNome}` : e.departamentoNome
      })
      .join(' · ')
  }
  if (!departamentoNome) return 'Sem área neste nível'
  return departamentoNome
}

function localDe(m: {
  sedeNome: string | null
  tenantNome: string
}): string {
  return m.sedeNome?.trim() || m.tenantNome
}

/**
 * Decide os níveis a exibir: um só quando o vínculo nasce na raiz; dois
 * quando há origem em unidade com portal próprio (Caso B).
 */
export function montarInputsNiveisVinculo(opts: {
  atual: MembroVinculoLite
  origem: ParVinculoLite
  espelho: ParVinculoLite
  raiz: { tenantId: string; tenantNome: string }
  equipePorTenant: ReadonlyMap<string, AreaEfetivadaNivel[]>
}): NivelVinculoInput[] {
  const { atual, origem, espelho, raiz, equipePorTenant } = opts
  const casoB =
    atual.espelhado ||
    origem != null ||
    espelho != null ||
    atual.departamentoSede != null ||
    atual.tenantId !== raiz.tenantId

  const equipe = (tenantId: string) => equipePorTenant.get(tenantId) ?? []

  if (!casoB) {
    return [
      {
        nivel: 'sede',
        localNome: localDe(atual),
        preferencia: atual.departamento,
        efetivadas: equipe(atual.tenantId),
      },
    ]
  }

  const unidadeFonte: {
    tenantId: string
    tenantNome: string
    sedeNome: string | null
    departamento: PreferenciaArea | null
  } = atual.espelhado && origem
    ? origem
    : {
        tenantId: atual.tenantId,
        tenantNome: atual.tenantNome,
        sedeNome: atual.sedeNome,
        departamento: atual.departamento,
      }

  const sedeFonte: {
    tenantId: string
    tenantNome: string
    departamento: PreferenciaArea | null
  } = atual.espelhado
    ? {
        tenantId: atual.tenantId,
        tenantNome: atual.tenantNome,
        departamento: atual.departamento,
      }
    : espelho
      ? {
          tenantId: espelho.tenantId,
          tenantNome: espelho.tenantNome,
          departamento: espelho.departamento,
        }
      : {
          tenantId: raiz.tenantId,
          tenantNome: raiz.tenantNome,
          departamento: atual.departamentoSede,
        }

  const niveis: NivelVinculoInput[] = [
    {
      nivel: 'unidade',
      localNome: localDe(unidadeFonte),
      preferencia: unidadeFonte.departamento,
      efetivadas: equipe(unidadeFonte.tenantId),
    },
    {
      nivel: 'sede',
      localNome: sedeFonte.tenantNome,
      preferencia: sedeFonte.departamento,
      efetivadas: equipe(sedeFonte.tenantId),
    },
  ]

  if (niveis[0]!.localNome === niveis[1]!.localNome && unidadeFonte.tenantId === sedeFonte.tenantId) {
    return [
      {
        nivel: 'sede',
        localNome: niveis[1]!.localNome,
        preferencia: sedeFonte.departamento ?? unidadeFonte.departamento,
        efetivadas: equipe(sedeFonte.tenantId),
      },
    ]
  }

  return niveis
}
