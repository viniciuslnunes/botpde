'use server'

import { db } from '@torcida/db'
import { wouldCreateSedeCycle, invalidateHierarchyCache } from '@/lib/hierarquia'
import {
  validarHierarquiaSede,
  validarRebaixamentoComFilhos,
  isPaiHerdadoDeTorcidaPrincipal,
  type TipoSede,
} from '@/lib/sede-regras'
import { buildGeocodeQuery, geocodeLatLng, isGoogleMapsConfigured } from '@/lib/google-maps'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { assertPermission, assertPresidenteGlobal } from '@/lib/authz'
import { ensureCanalOficialParaSede, vincularResponsavelAoCanalDaSede } from '@/lib/canais'
import { PERMISSIONS, podeCriarUnidadeTerritorial } from '@torcida/types'

const emptyToNull = (v: string | undefined) => (v?.trim() ? v.trim() : null)

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
    return { userId: null, nome: null, error: 'Responsável precisa ser membro aprovado deste tenant.' }
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
): Promise<{ pai: { id: string; tipo: TipoSede; tenantId: string | null } | null; error?: string }> {
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

export async function criarSede(
  _prev: SedeState,
  formData: FormData,
): Promise<SedeState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.SEDES_MANAGE)

  // Só a Sede principal expande a hierarquia — subsede/PDE (Caso B) editam
  // a própria unidade com SEDES_MANAGE, mas não adicionam locais.
  const sedeRaiz: { tipo: string } | null = await db.sede.findFirst({
    where: { tenantId: tenant.id, tipo: 'SEDE' },
    select: { tipo: true },
  })
  if (!podeCriarUnidadeTerritorial(sedeRaiz?.tipo ?? 'PONTO_ENCONTRO')) {
    return {
      message:
        'Apenas administradores da sede principal podem adicionar locais na hierarquia.',
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

  const existing = await db.sede.findUnique({
    where: { id: sedeId },
    select: {
      tenantId: true,
      sedeId: true,
      tipo: true,
      canalConversaId: true,
      filhos: { select: { tipo: true } },
    },
  })
  if (!existing || existing.tenantId !== tenant.id) {
    return { message: 'Sede não encontrada.' }
  }

  const { nome, tipo, sedeId: sedePaiIdForm, responsavelUserId, responsavel, ...rest } =
    parsed.data

  // Caso B: pai na torcida principal — trava tipo + sedeId (não se altera aqui).
  let tipoFinal: TipoSede = tipo
  let sedePaiId: string | null = sedePaiIdForm
  let permitirPaiExternoId: string | null = null

  if (existing.sedeId) {
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

  if (sedePaiId && (await wouldCreateSedeCycle(sedeId, sedePaiId))) {
    return {
      errors: { sedeId: ['Esta sede não pode ser filha de si mesma ou de uma de suas próprias subsedes.'] },
    }
  }

  const { pai, error: paiError } = await resolverPai(sedePaiId, tenant.id, {
    permitirPaiExternoId,
  })
  if (paiError) return { errors: { sedeId: [paiError] } }

  const hierarquiaErro = validarHierarquiaSede(tipoFinal, pai)
  if (hierarquiaErro) {
    return { errors: { sedeId: [hierarquiaErro], tipo: [hierarquiaErro] } }
  }

  const rebaixamentoErro = validarRebaixamentoComFilhos(
    tipoFinal,
    existing.filhos.map((f: { tipo: string }) => f.tipo as TipoSede),
  )
  if (rebaixamentoErro) {
    return { errors: { tipo: [rebaixamentoErro] } }
  }

  const resp = await resolverResponsavelUser(tenant.id, responsavelUserId)
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

  await vincularResponsavelAoCanalDaSede({
    sedeId,
    canalConversaId: existing.canalConversaId,
    responsavelUserId: resp.userId,
  })

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
      },
    },
  })

  revalidatePath('/admin/sedes')
  revalidatePath('/portal/sedes')
  revalidatePath(`/admin/sedes/${sedeId}`)
  // Header admin/portal usa Sede.fotoUrl como fallback do logo do tenant
  // (resolveTenantLogoUrl) — sem revalidar os layouts, a foto nova só
  // aparece depois que o router cache do cliente expira sozinho.
  revalidatePath('/admin', 'layout')
  revalidatePath('/portal', 'layout')
  invalidateHierarchyCache(tenant.id)
  redirect('/admin/sedes')
}

/**
 * Persiste só a foto da unidade (upload imediato no formulário de edição).
 * Revalida layouts para o header refletir o fallback resolveTenantLogoUrl.
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

  const existing: { id: string } | null = await db.sede.findFirst({
    where: { id: sedeId, tenantId: tenant.id },
    select: { id: true },
  })
  if (!existing) return { ok: false, message: 'Sede não encontrada.' }

  await db.sede.update({
    where: { id: sedeId },
    data: { fotoUrl: url },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'SEDE_FOTO_ATUALIZADA',
      entidade: 'Sede',
      entidadeId: sedeId,
      detalhes: { temFoto: url != null },
    },
  })

  revalidatePath('/admin/sedes')
  revalidatePath(`/admin/sedes/${sedeId}`)
  revalidatePath('/portal/sedes')
  revalidatePath('/admin', 'layout')
  revalidatePath('/portal', 'layout')

  return { ok: true }
}

export async function alterarStatusSede(sedeId: string, ativa: boolean) {
  const { session, tenant } = await assertPermission(PERMISSIONS.SEDES_MANAGE)

  const existing = await db.sede.findUnique({
    where: { id: sedeId },
    select: { tenantId: true },
  })
  if (!existing || existing.tenantId !== tenant.id) throw new Error('Sede não encontrada')

  if (!ativa) {
    const filhosAtivos = await db.sede.count({
      where: { sedeId, ativa: true, tenantId: tenant.id },
    })
    if (filhosAtivos > 0) {
      throw new Error(
        `Não é possível desativar: há ${filhosAtivos} unidade(s) filha(s) ativa(s). Desative ou reatribua os filhos antes.`,
      )
    }
  }

  await db.sede.update({ where: { id: sedeId }, data: { ativa } })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: ativa ? 'SEDE_ATIVADA' : 'SEDE_DESATIVADA',
      entidade: 'Sede',
      entidadeId: sedeId,
    },
  })

  revalidatePath('/admin/sedes')
  revalidatePath('/portal/sedes')
  invalidateHierarchyCache(tenant.id)
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

export type PromoverSedeActionResult =
  | {
      ok: true
      novoSlug: string
      membrosMigrados: number
      filhosMovidos: number
      message: string
    }
  | { ok: false; error: string }

/** Promove SUBSEDE/PDE a tenant próprio (Caso B). Só Presidente da SEDE. */
export async function promoverSedeAction(sedeId: string): Promise<PromoverSedeActionResult> {
  const { session, tenant } = await assertPresidenteGlobal()

  const { promoverSedeParaTenant } = await import('@/lib/promover-sede')
  const result = await promoverSedeParaTenant({
    sedeId,
    tenantMaeId: tenant.id,
    atorId: session.user.id,
  })

  if (!result.ok) return result

  revalidatePath('/admin/sedes')
  revalidatePath(`/admin/sedes/${sedeId}`)
  revalidatePath('/admin/torcida')
  revalidatePath('/portal/sedes')

  return {
    ok: true,
    novoSlug: result.novoSlug,
    membrosMigrados: result.membrosMigrados,
    filhosMovidos: result.filhosMovidos,
    message: `Unidade promovida ao tenant “${result.novoSlug}” (${result.membrosMigrados} membros, ${result.filhosMovidos} filhos).`,
  }
}
