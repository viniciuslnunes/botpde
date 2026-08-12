'use server'

import { db } from '@torcida/db'
import type { Prisma } from '@torcida/db'
import {
  getDescendantTenantIds,
  wouldCreateSedeCycle,
  invalidateHierarchyCache,
} from '@/lib/hierarquia'
import { ExpectedError } from '@/lib/expected-error'
import { PRAZO_REATIVACAO_DIAS, prazoReativacaoAPartirDe } from '@/lib/isolamento'
import { getEstadoCanalRestrito, temSolicitacaoEmAberto } from '@/lib/canal-restrito'
import { notificarUnidadeSobreCanal, reabrirCanal } from '@/lib/canal-restrito-mutacoes'
import {
  validarHierarquiaSede,
  validarRebaixamentoComFilhos,
  isPaiHerdadoDeTorcidaPrincipal,
  isTipoSedeTravado,
  type TipoSede,
} from '@/lib/sede-regras'
import { buildGeocodeQuery, geocodeLatLng, isGoogleMapsConfigured } from '@/lib/google-maps'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { assertPermission, assertPresidenteGlobal, assertTenantOwner } from '@/lib/authz'
import { isSuperAdminEmail, invalidateTorcidasSelecaoCache } from '@/lib/tenant-context'
import {
  apagarConversasAoExcluirUnidade,
  ensureCanalOficialParaSede,
  vincularResponsavelAoCanalDaSede,
} from '@/lib/canais'
import { notificarSafe } from '@/lib/notificacoes'
import { assertPodeMutarSedeNaArvore } from '@/lib/sede-acesso-mae'
import { PERMISSIONS, podeCriarUnidadeTerritorial } from '@torcida/types'

const emptyToNull = (v: string | undefined) => (v?.trim() ? v.trim() : null)

/**
 * Espelha nome/local/foto da Sede na SolicitacaoUnidade vinculada (se houver).
 * A UI de afiliações também lê a Sede ao vivo; isto evita snapshot defasado em
 * relatórios/consultas diretas às colunas da solicitação.
 */
async function sincronizarSolicitacaoDaSede(
  sedeId: string,
  dados: {
    nome?: string
    tipo?: TipoSede
    cidade?: string | null
    estado?: string | null
    endereco?: string | null
    cep?: string | null
    lat?: number | null
    lng?: number | null
    fotoUrl?: string | null
  },
): Promise<void> {
  const data: {
    nome?: string
    tipo?: 'SUBSEDE' | 'PONTO_ENCONTRO'
    cidade?: string
    estado?: string
    endereco?: string | null
    cep?: string | null
    lat?: number | null
    lng?: number | null
    fotoUrl?: string | null
  } = {}

  if (dados.nome !== undefined) data.nome = dados.nome
  if (dados.tipo === 'SUBSEDE' || dados.tipo === 'PONTO_ENCONTRO') data.tipo = dados.tipo
  if (dados.cidade != null && dados.cidade.trim()) data.cidade = dados.cidade
  if (dados.estado != null && dados.estado.trim()) data.estado = dados.estado
  if (dados.endereco !== undefined) data.endereco = dados.endereco
  if (dados.cep !== undefined) data.cep = dados.cep
  if (dados.lat !== undefined) data.lat = dados.lat
  if (dados.lng !== undefined) data.lng = dados.lng
  if (dados.fotoUrl !== undefined) data.fotoUrl = dados.fotoUrl

  if (Object.keys(data).length === 0) return

  await db.solicitacaoUnidade.updateMany({
    where: { sedeId },
    data,
  })
}

const sedeSchema = z.object({
  nome: z.string().min(3, 'Nome muito curto').max(100),
  tipo: z.enum(['SEDE', 'SUBSEDE', 'PONTO_ENCONTRO']),
  sedeId: z
    .string()
    .optional()
    .transform((v) => v || null),
  endereco: z.string().max(200).optional().transform(emptyToNull),
  cidade: z.string().max(100).optional().transform(emptyToNull),
  estado: z.string().max(2).optional().transform(emptyToNull),
  cep: z.string().max(9).optional().transform(emptyToNull),
  capacidade: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : null))
    .pipe(z.number().int().positive().nullable().optional()),
  responsavel: z.string().max(100).optional().transform(emptyToNull),
  responsavelUserId: z
    .string()
    .optional()
    .transform((v) => v || null),
  telefone: z.string().max(20).optional().transform(emptyToNull),
  horarios: z.string().max(200).optional().transform(emptyToNull),
  descricao: z.string().max(1000).optional().transform(emptyToNull),
  fotoUrl: z
    .string()
    .optional()
    .transform((v) => {
      const t = v?.trim()
      return t ? t : null
    })
    .superRefine((val, ctx) => {
      if (val != null && !/^https?:\/\//i.test(val)) {
        ctx.addIssue({ code: 'custom', message: 'URL inválida (use http:// ou https://)' })
      }
    }),
  lat: z
    .string()
    .optional()
    .transform((v) => {
      if (!v?.trim()) return null
      const n = Number(v)
      return Number.isFinite(n) ? n : Number.NaN
    })
    .refine((n) => n === null || (n >= -90 && n <= 90), 'Latitude inválida'),
  lng: z
    .string()
    .optional()
    .transform((v) => {
      if (!v?.trim()) return null
      const n = Number(v)
      return Number.isFinite(n) ? n : Number.NaN
    })
    .refine((n) => n === null || (n >= -180 && n <= 180), 'Longitude inválida'),
  streetViewHeading: z
    .string()
    .optional()
    .transform((v) => {
      if (!v?.trim()) return null
      const n = Number.parseInt(v, 10)
      return Number.isFinite(n) ? n : Number.NaN
    })
    .refine((n) => n === null || (n >= 0 && n <= 359), 'Direção Street View inválida'),
  streetViewPitch: z
    .string()
    .optional()
    .transform((v) => {
      if (!v?.trim()) return null
      const n = Number.parseInt(v, 10)
      return Number.isFinite(n) ? n : Number.NaN
    })
    .refine((n) => n === null || (n >= -90 && n <= 90), 'Inclinação Street View inválida'),
  streetViewFov: z
    .string()
    .optional()
    .transform((v) => {
      if (!v?.trim()) return null
      const n = Number.parseInt(v, 10)
      return Number.isFinite(n) ? n : Number.NaN
    })
    .refine((n) => n === null || (n >= 10 && n <= 120), 'Zoom Street View inválido'),
})

export type SedeState = {
  errors?: Record<string, string[]>
  message?: string
}

export type GeocodeLoteResult = {
  ok: boolean
  processadas: number
  atualizadas: number
  falhas: number
  message: string
}

function parseSedeForm(formData: FormData) {
  return {
    nome: formData.get('nome') as string,
    tipo: formData.get('tipo') as string,
    sedeId: formData.get('sedeId') as string | undefined,
    endereco: formData.get('endereco') as string | undefined,
    cidade: formData.get('cidade') as string | undefined,
    estado: formData.get('estado') as string | undefined,
    cep: formData.get('cep') as string | undefined,
    capacidade: formData.get('capacidade') as string | undefined,
    responsavel: formData.get('responsavel') as string | undefined,
    responsavelUserId: formData.get('responsavelUserId') as string | undefined,
    telefone: formData.get('telefone') as string | undefined,
    horarios: formData.get('horarios') as string | undefined,
    descricao: formData.get('descricao') as string | undefined,
    fotoUrl: formData.get('fotoUrl') as string | undefined,
    lat: formData.get('lat') as string | undefined,
    lng: formData.get('lng') as string | undefined,
    streetViewHeading: formData.get('streetViewHeading') as string | undefined,
    streetViewPitch: formData.get('streetViewPitch') as string | undefined,
    streetViewFov: formData.get('streetViewFov') as string | undefined,
  }
}

async function resolverResponsavelUser(
  tenantId: string,
  responsavelUserId: string | null,
): Promise<{ userId: string | null; nome: string | null; error?: string }> {
  if (!responsavelUserId) return { userId: null, nome: null }
  const membro = await db.saasMembro.findFirst({
    where: { tenantId, userId: responsavelUserId, status: 'APROVADO' },
    select: {
      userId: true,
      nome: true,
      user: { select: { nome: true } },
    },
  })
  if (!membro) {
    return {
      userId: null,
      nome: null,
      error: 'Responsável precisa ser membro aprovado deste tenant.',
    }
  }
  return {
    userId: membro.userId,
    nome: membro.user.nome ?? membro.nome,
  }
}

async function resolverPai(
  sedePaiId: string | null,
  tenantId: string,
  opts?: { permitirPaiExternoId?: string | null },
): Promise<{
  pai: { id: string; tipo: TipoSede; tenantId: string | null } | null
  error?: string
}> {
  if (!sedePaiId) return { pai: null }
  const pai = await db.sede.findUnique({
    where: { id: sedePaiId },
    select: { id: true, tipo: true, tenantId: true },
  })
  if (!pai) {
    return { pai: null, error: 'Sede pai não encontrada.' }
  }
  if (pai.tenantId === tenantId) {
    return { pai: { id: pai.id, tipo: pai.tipo as TipoSede, tenantId: pai.tenantId } }
  }
  // Caso B: preservar vínculo já materializado com a torcida principal.
  if (opts?.permitirPaiExternoId && sedePaiId === opts.permitirPaiExternoId) {
    return { pai: { id: pai.id, tipo: pai.tipo as TipoSede, tenantId: pai.tenantId } }
  }
  return { pai: null, error: 'Sede pai não encontrada.' }
}

export async function criarSede(_prev: SedeState, formData: FormData): Promise<SedeState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.SEDES_MANAGE)

  // Só a Sede principal expande a hierarquia — subsede/PDE (Caso B) editam
  // a própria unidade com SEDES_MANAGE, mas não adicionam locais.
  const sedeRaiz: { tipo: string } | null = await db.sede.findFirst({
    where: { tenantId: tenant.id, tipo: 'SEDE' },
    select: { tipo: true },
  })
  if (!podeCriarUnidadeTerritorial(sedeRaiz?.tipo ?? 'PONTO_ENCONTRO')) {
    return {
      message: 'Apenas administradores da sede principal podem adicionar locais na hierarquia.',
    }
  }

  const parsed = sedeSchema.safeParse(parseSedeForm(formData))
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { nome, tipo, sedeId, responsavelUserId, responsavel, ...rest } = parsed.data
  const { pai, error: paiError } = await resolverPai(sedeId, tenant.id)
  if (paiError) return { errors: { sedeId: [paiError] } }

  const hierarquiaErro = validarHierarquiaSede(tipo, pai)
  if (hierarquiaErro) {
    return { errors: { sedeId: [hierarquiaErro], tipo: [hierarquiaErro] } }
  }

  const resp = await resolverResponsavelUser(tenant.id, responsavelUserId)
  if (resp.error) return { errors: { responsavelUserId: [resp.error] } }

  const sede = await db.sede.create({
    data: {
      tenantId: tenant.id,
      nome,
      tipo,
      sedeId: sedeId ?? null,
      responsavelUserId: resp.userId,
      responsavel: resp.nome ?? responsavel ?? null,
      ...rest,
    },
  })

  // SUBSEDE/PDE: canal oficial privado já na criação (Caso A), mesmo sem
  // admin do canal — propriedade/membros vêm depois. SEDE usa o mural do
  // tenant via getOrCreateCanalOficial na Comunidade.
  let canalConversaId: string | null = null
  if (tipo === 'SUBSEDE' || tipo === 'PONTO_ENCONTRO') {
    const canal = await ensureCanalOficialParaSede({
      sedeId: sede.id,
      tenantId: tenant.id,
      nome,
      criadoPorId: session.user.id,
      atorComoAdmin: false,
    })
    canalConversaId = canal.id
  }

  await vincularResponsavelAoCanalDaSede({
    sedeId: sede.id,
    canalConversaId,
    responsavelUserId: resp.userId,
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'SEDE_CRIADA',
      entidade: 'Sede',
      entidadeId: sede.id,
      detalhes: {
        tipo,
        temCoords: rest.lat != null && rest.lng != null,
        ...(canalConversaId ? { canalConversaId } : {}),
      },
    },
  })

  if (resp.userId) {
    await notificarSafe({
      userId: resp.userId,
      tenantId: tenant.id,
      tipo: 'SEDE_RESPONSAVEL_DEFINIDO',
      titulo: 'Você foi definido responsável por uma unidade',
      corpo: `Você é responsável por ${nome}.`,
      link: '/portal/sedes',
      atorId: session.user.id,
    })
  }

  revalidatePath('/admin/sedes')
  revalidatePath('/portal/sedes')
  revalidatePath('/portal/comunidade/canais')
  revalidatePath('/admin', 'layout')
  revalidatePath('/portal', 'layout')
  invalidateHierarchyCache(tenant.id)
  redirect('/admin/sedes')
}

export async function editarSede(
  sedeId: string,
  _prev: SedeState,
  formData: FormData,
): Promise<SedeState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.SEDES_MANAGE)

  const parsed = sedeSchema.safeParse(parseSedeForm(formData))
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  let existing: Awaited<ReturnType<typeof assertPodeMutarSedeNaArvore>>
  try {
    existing = await assertPodeMutarSedeNaArvore(session, tenant, sedeId)
  } catch (e) {
    return { message: e instanceof Error ? e.message : 'Sede não encontrada.' }
  }

  const tenantDaUnidade = existing.tenantId ?? tenant.id
  const filhosDaUnidade: { tipo: string }[] = await db.sede.findMany({
    where: { sedeId },
    select: { tipo: true },
  })

  const { nome, tipo, sedeId: sedePaiIdForm, responsavelUserId, responsavel, ...rest } = parsed.data

  // Caso B (editado pela mãe ou unidade com pai herdado): trava tipo + sedeId.
  let tipoFinal: TipoSede = tipo
  let sedePaiId: string | null = sedePaiIdForm
  let permitirPaiExternoId: string | null = null

  if (existing.portalProprio) {
    // Mãe edita portal filho: não reparenta nem muda tipo pela lista da mãe.
    sedePaiId = existing.sedeId
    tipoFinal = existing.tipo as TipoSede
    if (existing.sedeId) permitirPaiExternoId = existing.sedeId
  } else if (existing.sedeId) {
    const paiAtual: { tenantId: string | null } | null = await db.sede.findUnique({
      where: { id: existing.sedeId },
      select: { tenantId: true },
    })
    if (isPaiHerdadoDeTorcidaPrincipal(paiAtual?.tenantId, tenant.id)) {
      permitirPaiExternoId = existing.sedeId
      sedePaiId = existing.sedeId
      tipoFinal = existing.tipo as TipoSede
    }
  }

  // Sede raiz: tipo SEDE não pode ser rebaixado via form (tampers no cliente).
  if (isTipoSedeTravado(existing.tipo as TipoSede)) {
    tipoFinal = 'SEDE'
  }

  if (sedePaiId && (await wouldCreateSedeCycle(sedeId, sedePaiId))) {
    return {
      errors: {
        sedeId: ['Esta sede não pode ser filha de si mesma ou de uma de suas próprias subsedes.'],
      },
    }
  }

  const { pai, error: paiError } = await resolverPai(sedePaiId, tenantDaUnidade, {
    permitirPaiExternoId,
  })
  if (paiError) return { errors: { sedeId: [paiError] } }

  const hierarquiaErro = validarHierarquiaSede(tipoFinal, pai)
  if (hierarquiaErro) {
    return { errors: { sedeId: [hierarquiaErro], tipo: [hierarquiaErro] } }
  }

  const rebaixamentoErro = validarRebaixamentoComFilhos(
    tipoFinal,
    filhosDaUnidade.map((f) => f.tipo as TipoSede),
  )
  if (rebaixamentoErro) {
    return { errors: { tipo: [rebaixamentoErro] } }
  }

  const resp = await resolverResponsavelUser(tenantDaUnidade, responsavelUserId)
  if (resp.error) return { errors: { responsavelUserId: [resp.error] } }

  await db.sede.update({
    where: { id: sedeId },
    data: {
      nome,
      tipo: tipoFinal,
      sedeId: sedePaiId ?? null,
      responsavelUserId: resp.userId,
      responsavel: resp.nome ?? responsavel ?? null,
      ...rest,
    },
  })

  // Mantém o snapshot da solicitação alinhado à Sede (aba /admin/afiliacoes).
  await sincronizarSolicitacaoDaSede(sedeId, {
    nome,
    tipo: tipoFinal,
    cidade: rest.cidade ?? null,
    estado: rest.estado ?? null,
    endereco: rest.endereco ?? null,
    cep: rest.cep ?? null,
    lat: rest.lat ?? null,
    lng: rest.lng ?? null,
    fotoUrl: rest.fotoUrl ?? null,
  })

  await vincularResponsavelAoCanalDaSede({
    sedeId,
    canalConversaId: existing.canalConversaId,
    responsavelUserId: resp.userId,
  })

  // Foto da unidade ↔ avatar do canal oficial (header/card da comunidade).
  if (existing.canalConversaId && 'fotoUrl' in rest) {
    await db.conversa.update({
      where: { id: existing.canalConversaId },
      data: { avatarUrl: typeof rest.fotoUrl === 'string' ? rest.fotoUrl : null },
    })
  }

  // Portal próprio: nome/logo do tenant filho acompanham a unidade.
  if (existing.portalProprio && existing.tenantId) {
    await db.tenant.update({
      where: { id: existing.tenantId },
      data: {
        nome,
        ...(typeof rest.fotoUrl === 'string' ? { logoUrl: rest.fotoUrl } : {}),
      },
    })
  }

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'SEDE_EDITADA',
      entidade: 'Sede',
      entidadeId: sedeId,
      detalhes: {
        tipo: tipoFinal,
        temCoords: rest.lat != null && rest.lng != null,
        ...(permitirPaiExternoId ? { paiHerdado: true } : {}),
        ...(existing.portalProprio ? { portalProprio: true, tenantFilhoId: existing.tenantId } : {}),
      },
    },
  })

  if (resp.userId && resp.userId !== existing.responsavelUserId) {
    await notificarSafe({
      userId: resp.userId,
      tenantId: tenantDaUnidade,
      tipo: 'SEDE_RESPONSAVEL_DEFINIDO',
      titulo: 'Você foi definido responsável por uma unidade',
      corpo: `Você é responsável por ${nome}.`,
      link: '/portal/sedes',
      atorId: session.user.id,
    })
  }

  revalidatePath('/admin/sedes')
  revalidatePath('/portal/sedes')
  revalidatePath(`/admin/sedes/${sedeId}`)
  revalidatePath('/admin/afiliacoes')
  revalidatePath('/super-admin/unidades')
  revalidatePath('/admin', 'layout')
  revalidatePath('/portal', 'layout')
  invalidateHierarchyCache(tenant.id)
  if (existing.portalProprio && existing.tenantId) {
    invalidateHierarchyCache(existing.tenantId)
  }
  redirect('/admin/sedes')
}

/**
 * Persiste só a foto da unidade (upload imediato no formulário de edição).
 * Revalida layouts para o header refletir resolveTenantLogoUrl (foto da raiz).
 */
export async function salvarFotoSede(
  sedeId: string,
  fotoUrl: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { session, tenant } = await assertPermission(PERMISSIONS.SEDES_MANAGE)

  const parsed = z
    .string()
    .nullable()
    .superRefine((val, ctx) => {
      if (val != null && val !== '' && !/^https?:\/\//i.test(val)) {
        ctx.addIssue({ code: 'custom', message: 'URL inválida (use http:// ou https://)' })
      }
    })
    .safeParse(fotoUrl)

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'URL inválida.' }
  }

  const url = parsed.data?.trim() ? parsed.data.trim() : null

  let existing: Awaited<ReturnType<typeof assertPodeMutarSedeNaArvore>>
  try {
    existing = await assertPodeMutarSedeNaArvore(session, tenant, sedeId)
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Sede não encontrada.' }
  }

  await db.sede.update({
    where: { id: sedeId },
    data: { fotoUrl: url },
  })

  await sincronizarSolicitacaoDaSede(sedeId, { fotoUrl: url })

  // Mantém o avatar do canal oficial alinhado à foto da unidade (header + card).
  if (existing.canalConversaId) {
    await db.conversa.update({
      where: { id: existing.canalConversaId },
      data: { avatarUrl: url },
    })
  }

  if (existing.portalProprio && existing.tenantId) {
    await db.tenant.update({
      where: { id: existing.tenantId },
      data: { logoUrl: url },
    })
  }

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'SEDE_FOTO_ATUALIZADA',
      entidade: 'Sede',
      entidadeId: sedeId,
      detalhes: {
        temFoto: url != null,
        ...(existing.portalProprio ? { portalProprio: true } : {}),
      },
    },
  })

  revalidatePath('/admin/sedes')
  revalidatePath(`/admin/sedes/${sedeId}`)
  revalidatePath('/portal/sedes')
  revalidatePath('/portal/comunidade/canais')
  revalidatePath('/admin/afiliacoes')
  revalidatePath('/super-admin/unidades')
  revalidatePath('/admin', 'layout')
  revalidatePath('/portal', 'layout')

  return { ok: true }
}

export async function alterarStatusSede(sedeId: string, ativa: boolean) {
  const { session, tenant } = await assertPermission(PERMISSIONS.SEDES_MANAGE)

  const existing = await assertPodeMutarSedeNaArvore(session, tenant, sedeId)

  if (!ativa) {
    const filhosAtivos = await db.sede.count({
      where: {
        sedeId,
        ativa: true,
        ...(existing.portalProprio && existing.tenantId
          ? { tenantId: existing.tenantId }
          : { tenantId: tenant.id }),
      },
    })
    if (filhosAtivos > 0) {
      throw new Error(
        `Não é possível desativar: há ${filhosAtivos} unidade(s) filha(s) ativa(s). Desative ou reatribua os filhos antes.`,
      )
    }
  }

  await db.sede.update({ where: { id: sedeId }, data: { ativa } })

  // Portal próprio: o tenant filho acompanha o status da unidade na árvore.
  if (existing.portalProprio && existing.tenantId) {
    await db.tenant.update({
      where: { id: existing.tenantId },
      data: { ativo: ativa },
    })
  }

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: ativa ? 'SEDE_ATIVADA' : 'SEDE_DESATIVADA',
      entidade: 'Sede',
      entidadeId: sedeId,
      ...(existing.portalProprio
        ? {
            detalhes: {
              portalProprio: true,
              tenantFilhoId: existing.tenantId,
            },
          }
        : {}),
    },
  })

  revalidatePath('/admin/sedes')
  revalidatePath('/portal/sedes')
  invalidateHierarchyCache(tenant.id)
  if (existing.portalProprio && existing.tenantId) {
    invalidateHierarchyCache(existing.tenantId)
  }
}

/**
 * Geocodifica e persiste lat/lng de todas as sedes ativas do tenant sem coordenadas.
 * Reduz dependência do enrich client-side no portal.
 */
export async function geocodificarSedesSemCoords(): Promise<GeocodeLoteResult> {
  const { session, tenant } = await assertPermission(PERMISSIONS.SEDES_MANAGE)

  if (!isGoogleMapsConfigured()) {
    return {
      ok: false,
      processadas: 0,
      atualizadas: 0,
      falhas: 0,
      message: 'Chave do Google Maps não configurada.',
    }
  }

  type SedeGeo = {
    id: string
    nome: string
    endereco: string | null
    cidade: string | null
    estado: string | null
  }

  const pendentes: SedeGeo[] = await db.sede.findMany({
    where: {
      tenantId: tenant.id,
      ativa: true,
      OR: [{ lat: null }, { lng: null }],
    },
    select: {
      id: true,
      nome: true,
      endereco: true,
      cidade: true,
      estado: true,
    },
    take: 40,
  })

  let atualizadas = 0
  let falhas = 0

  for (const sede of pendentes) {
    const query = buildGeocodeQuery(sede)
    if (!query) {
      falhas += 1
      continue
    }
    const coords = await geocodeLatLng(query)
    if (!coords) {
      falhas += 1
      continue
    }
    await db.sede.update({
      where: { id: sede.id },
      data: { lat: coords.lat, lng: coords.lng },
    })
    await sincronizarSolicitacaoDaSede(sede.id, { lat: coords.lat, lng: coords.lng })
    atualizadas += 1
  }

  if (atualizadas > 0) {
    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'SEDES_GEOCODE_LOTE',
        entidade: 'Sede',
        detalhes: {
          processadas: pendentes.length,
          atualizadas,
          falhas,
        },
      },
    })
  }

  revalidatePath('/admin/sedes')
  revalidatePath('/portal/sedes')
  revalidatePath('/admin/afiliacoes')
  revalidatePath('/super-admin/unidades')

  return {
    ok: true,
    processadas: pendentes.length,
    atualizadas,
    falhas,
    message:
      pendentes.length === 0
        ? 'Todas as sedes ativas já têm coordenadas.'
        : `Geocodificadas ${atualizadas} de ${pendentes.length} (falhas: ${falhas}).`,
  }
}

export type ExcluirSedeResult =
  { ok: true; membrosRemanejados: number; message: string } | { ok: false; error: string }

/**
 * Exclui uma Sede/Subsede/PDE, remanejando membros e eventos vinculados.
 * - **Local** (mesmo tenant): super-admin qualquer unidade; Presidente/Vice só
 *   Sede duplicada (`tipo: 'SEDE'` com mais de uma no tenant).
 * - **Portal próprio (Caso B)**: sede principal com `affiliation:manage` pode
 *   excluir só se **não** houver liderança vinculada (`responsavelUserId`).
 *   Com liderança + portal, use desativar.
 * Bloqueia se houver unidades filhas ou dados do Bar.
 */
export async function excluirSede(
  sedeId: string,
  destinoSedeId: string,
): Promise<ExcluirSedeResult> {
  const { session, tenant } = await assertPresidenteGlobal()
  const isSuperAdmin = isSuperAdminEmail(session.user.email)

  if (sedeId === destinoSedeId) {
    return { ok: false, error: 'Escolha uma unidade de destino diferente.' }
  }

  const [sede, destino] = await Promise.all([
    db.sede.findUnique({
      where: { id: sedeId },
      select: {
        tenantId: true,
        nome: true,
        tipo: true,
        canalConversaId: true,
        responsavelUserId: true,
      },
    }),
    db.sede.findUnique({ where: { id: destinoSedeId }, select: { tenantId: true, tipo: true } }),
  ])
  if (!sede) {
    return { ok: false, error: 'Unidade não encontrada.' }
  }
  if (!destino || destino.tenantId !== tenant.id) {
    return { ok: false, error: 'Unidade de destino não encontrada.' }
  }
  if (destino.tipo !== 'SEDE') {
    return { ok: false, error: 'O destino do remanejamento precisa ser uma Sede.' }
  }

  const portalProprio = Boolean(sede.tenantId && sede.tenantId !== tenant.id)

  if (portalProprio) {
    try {
      await assertPodeMutarSedeNaArvore(session, tenant, sedeId)
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Sem permissão.' }
    }
    if (sede.responsavelUserId) {
      return {
        ok: false,
        error:
          'Esta unidade tem liderança vinculada. Remova a liderança ou apenas desative — exclusão não é permitida com portal e liderança.',
      }
    }
  } else if (sede.tenantId !== tenant.id) {
    return { ok: false, error: 'Unidade não encontrada.' }
  } else if (!isSuperAdmin) {
    if (sede.tipo !== 'SEDE') {
      return {
        ok: false,
        error: 'Só o super-admin pode excluir Subsede/PDE. O Presidente só remove Sedes duplicadas.',
      }
    }
    const sedesTipoSede = await db.sede.count({ where: { tenantId: tenant.id, tipo: 'SEDE' } })
    if (sedesTipoSede <= 1) {
      return {
        ok: false,
        error:
          'Só é possível excluir quando há Sede duplicada. Para os demais casos, peça ao super-admin.',
      }
    }
  }

  const tenantDaUnidade = sede.tenantId ?? tenant.id
  const [filhos, dadosBar] = await Promise.all([
    db.sede.count({ where: { sedeId, tenantId: tenantDaUnidade } }),
    db.barProduto.count({ where: { sedeId } }),
  ])
  if (filhos > 0) {
    return {
      ok: false,
      error: `Esta unidade tem ${filhos} unidade(s) filha(s). Reatribua-as (Editar → Unidade pai) antes de excluir.`,
    }
  }
  if (dadosBar > 0) {
    return {
      ok: false,
      error:
        'Esta unidade tem catálogo/estoque do Bar vinculado. Migre esses dados manualmente antes de excluir.',
    }
  }

  let membrosRemanejados = 0

  if (portalProprio && sede.tenantId) {
    const membrosFilho: {
      userId: string
      nome: string
      status: string
      tipo: string
    }[] = await db.saasMembro.findMany({
      where: { tenantId: sede.tenantId, sedeId },
      select: { userId: true, nome: true, status: true, tipo: true },
    })

    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const m of membrosFilho) {
        const naMae: { id: string } | null = await tx.saasMembro.findUnique({
          where: { tenantId_userId: { tenantId: tenant.id, userId: m.userId } },
          select: { id: true },
        })
        if (naMae) {
          await tx.saasMembro.update({
            where: { id: naMae.id },
            data: { sedeId: destinoSedeId },
          })
        } else {
          await tx.saasMembro.create({
            data: {
              tenantId: tenant.id,
              userId: m.userId,
              nome: m.nome,
              tipo: m.tipo as 'SOCIO' | 'TORCEDOR',
              status: (m.status === 'APROVADO' ? 'APROVADO' : 'PENDENTE') as 'APROVADO' | 'PENDENTE',
              sedeId: destinoSedeId,
            },
          })
        }
        membrosRemanejados += 1
      }

      await tx.saasMembro.updateMany({
        where: { tenantId: sede.tenantId!, sedeId },
        data: { sedeId: null },
      })
      await tx.evento.updateMany({
        where: { tenantId: sede.tenantId!, sedeId },
        data: { sedeId: null },
      })
      // Canal oficial (pode ter ficado com tenantId da mãe pós-promoção) +
      // canais/grupos do tenant filho — senão continuam na inbox após desativar.
      await apagarConversasAoExcluirUnidade(tx, {
        tenantId: sede.tenantId!,
        ids: sede.canalConversaId ? [sede.canalConversaId] : undefined,
      })
      await tx.sede.delete({ where: { id: sedeId } })
      await tx.tenant.update({
        where: { id: sede.tenantId! },
        data: { ativo: false },
      })
    })
  } else {
    const { count } = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const remanejados: { count: number } = await tx.saasMembro.updateMany({
        where: { tenantId: tenant.id, sedeId },
        data: { sedeId: destinoSedeId },
      })
      await tx.evento.updateMany({
        where: { tenantId: tenant.id, sedeId },
        data: { sedeId: destinoSedeId },
      })
      if (sede.canalConversaId) {
        await apagarConversasAoExcluirUnidade(tx, { ids: [sede.canalConversaId] })
      }
      await tx.sede.delete({ where: { id: sedeId } })
      return remanejados
    })
    membrosRemanejados = count
  }

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'SEDE_EXCLUIDA',
      entidade: 'Sede',
      entidadeId: sedeId,
      detalhes: {
        nome: sede.nome,
        destinoSedeId,
        membrosRemanejados,
        ...(portalProprio ? { portalProprio: true, tenantFilhoId: sede.tenantId } : {}),
      },
    },
  })

  revalidatePath('/admin/sedes')
  revalidatePath('/portal/sedes')
  revalidatePath('/admin', 'layout')
  revalidatePath('/portal', 'layout')
  invalidateHierarchyCache(tenant.id)
  if (portalProprio && sede.tenantId) {
    invalidateHierarchyCache(sede.tenantId)
  }

  return {
    ok: true,
    membrosRemanejados,
    message: portalProprio
      ? `“${sede.nome}” excluída e portal desativado. ${membrosRemanejados} membro(s) remanejado(s).`
      : `“${sede.nome}” excluída. ${membrosRemanejados} membro(s) remanejado(s).`,
  }
}

export type PromoverSedeActionResult =
  | {
      ok: true
      novoSlug: string
      membrosMigrados: number
      filhosMovidos: number
      message: string
    }
  | { ok: false; error: string }

/** Promove SUBSEDE/PDE a portal próprio (Caso B). Só Presidente da SEDE. */
export async function promoverSedeAction(sedeId: string): Promise<PromoverSedeActionResult> {
  const { session, tenant } = await assertPresidenteGlobal()

  const { promoverSedeParaTenant } = await import('@/lib/promover-sede')
  const result = await promoverSedeParaTenant({
    sedeId,
    tenantMaeId: tenant.id,
    atorId: session.user.id,
  })

  if (!result.ok) return result

  invalidateTorcidasSelecaoCache()
  revalidatePath('/admin/sedes')
  revalidatePath(`/admin/sedes/${sedeId}`)
  revalidatePath('/admin/torcida')
  revalidatePath('/portal/sedes')
  revalidatePath('/admin')

  return {
    ok: true,
    novoSlug: result.novoSlug,
    membrosMigrados: result.membrosMigrados,
    filhosMovidos: result.filhosMovidos,
    message: `Portal próprio criado (${result.membrosMigrados} membros, ${result.filhosMovidos} unidades filhas).`,
  }
}

// ── R5 — Canal restrito: ações da Sede sobre unidades isoladas ────────────────

const solicitacaoReativacaoSchema = z.object({
  tenantId: z.string().uuid('Unidade inválida'),
  mensagem: z
    .string()
    .trim()
    .max(600, 'Use no máximo 600 caracteres.')
    .optional()
    .transform((v) => (v ? v : null)),
})

/**
 * Presidente/Vice pedem à liderança que reabra o canal de uma unidade.
 * A liderança tem `PRAZO_REATIVACAO_DIAS` para responder; passado o prazo sem
 * resposta, o canal é reativado sozinho (a expiração é derivada na leitura —
 * ver `lib/isolamento.ts`).
 */
export async function solicitarReativacaoCanal(formData: FormData): Promise<void> {
  const { session, tenant } = await assertPresidenteGlobal()

  const parsed = solicitacaoReativacaoSchema.safeParse({
    tenantId: String(formData.get('tenantId') ?? ''),
    mensagem: String(formData.get('mensagem') ?? ''),
  })
  if (!parsed.success) {
    throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Dados inválidos.')
  }

  const alvo = await assertUnidadeRestritaDaTorcida(tenant.id, parsed.data.tenantId)

  if (await temSolicitacaoEmAberto(alvo.id)) {
    throw new ExpectedError('Já existe uma solicitação de reativação aguardando resposta.')
  }

  const agora = new Date()
  const solicitacao = await db.solicitacaoReativacaoCanal.create({
    data: {
      tenantId: alvo.id,
      solicitanteTenantId: tenant.id,
      solicitadoPorId: session.user.id,
      mensagem: parsed.data.mensagem,
      prazoEm: prazoReativacaoAPartirDe(agora),
    },
    select: { id: true, prazoEm: true },
  })

  await db.auditLog.createMany({
    data: [tenant.id, alvo.id].map((tenantId) => ({
      tenantId,
      atorId: session.user.id,
      acao: 'CANAL_REATIVACAO_SOLICITADA',
      entidade: 'SolicitacaoReativacaoCanal',
      entidadeId: solicitacao.id,
      detalhes: { unidadeId: alvo.id, prazoEm: solicitacao.prazoEm.toISOString() },
    })),
  })

  revalidatePath('/admin/sedes')
  await notificarUnidadeSobreCanal(alvo.id, session.user.id, {
    tipo: 'CANAL_REATIVACAO_SOLICITADA',
    titulo: 'A Sede pediu a reabertura do canal',
    corpo: `Você tem ${PRAZO_REATIVACAO_DIAS} dias para responder. Sem resposta até lá, o canal é reaberto automaticamente.`,
  })
}

const imposicaoSchema = z.object({
  tenantId: z.string().uuid('Unidade inválida'),
  motivo: z
    .string()
    .trim()
    .min(10, 'Explique em pelo menos 10 caracteres.')
    .max(600, 'Use no máximo 600 caracteres.'),
})

/**
 * Último recurso da Sede: o owner (Presidente) impõe a reabertura mesmo após
 * recusa da liderança. Sem esta saída, a regra teria um furo — como o silêncio
 * reabre em 5 dias, recusar seria a jogada dominante para isolar para sempre.
 * Exige justificativa, fica registrada nos dois tenants e notifica a unidade.
 */
export async function imporReativacaoCanal(formData: FormData): Promise<void> {
  const { session, tenant } = await assertPresidenteGlobal()
  await assertTenantOwner(session.user.id, tenant.id)

  const parsed = imposicaoSchema.safeParse({
    tenantId: String(formData.get('tenantId') ?? ''),
    motivo: String(formData.get('motivo') ?? ''),
  })
  if (!parsed.success) {
    throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Dados inválidos.')
  }

  const alvo = await assertUnidadeRestritaDaTorcida(tenant.id, parsed.data.tenantId)

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'CANAL_REATIVACAO_IMPOSTA',
      entidade: 'Tenant',
      entidadeId: alvo.id,
      detalhes: { unidadeId: alvo.id, motivo: parsed.data.motivo },
    },
  })

  await reabrirCanal({
    tenantId: alvo.id,
    tenantNome: alvo.nome,
    atorId: session.user.id,
    acao: 'CANAL_REATIVACAO_IMPOSTA',
    statusSolicitacao: 'IMPOSTA',
    motivo: parsed.data.motivo,
    corpoNotificacao: `A Sede determinou a reabertura do canal. Motivo: ${parsed.data.motivo}`,
  })
}

/** Alvo precisa ser unidade descendente desta torcida E estar com canal restrito. */
async function assertUnidadeRestritaDaTorcida(
  sedeTenantId: string,
  alvoTenantId: string,
): Promise<{ id: string; nome: string }> {
  const descendentes = await getDescendantTenantIds(sedeTenantId)
  if (!descendentes.includes(alvoTenantId)) {
    throw new ExpectedError('Esta unidade não pertence à sua torcida.')
  }

  const estado = await getEstadoCanalRestrito(alvoTenantId)
  if (!estado.restrito) {
    throw new ExpectedError('O canal desta unidade já está aberto.')
  }

  const alvo: { id: string; nome: string } | null = await db.tenant.findUnique({
    where: { id: alvoTenantId },
    select: { id: true, nome: true },
  })
  if (!alvo) throw new ExpectedError('Unidade não encontrada.')
  return alvo
}
