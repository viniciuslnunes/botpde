'use server'

import { revalidatePath } from 'next/cache'
import { invalidarBadgesAutorTenant } from '@/lib/comunidade-cache'
import { db, syncMembershipFromRoles, type Prisma } from '@torcida/db'
import { assertAnyPermission, assertPermission } from '@/lib/authz'
import { vincularMembroCanaisAposAprovacao } from '@/lib/canais'
import { ExpectedError } from '@/lib/expected-error'
import {
  assertOrigemDescendenteDaSede,
  desligarEspelhoDaOrigem,
  lockDecisaoAdmissaoTorcida,
  lockNumeroAssociadoDaTorcida,
  propagarLgeParaEspelho,
  sincronizarSocioNaSedeRaiz,
  sincronizarStatusEspelhoDaOrigem,
  validarNumeroAssociadoUnicoNaTorcida,
} from '@/lib/membros-sede'
import { notificarSafe } from '@/lib/notificacoes'
import { emitNotificacaoPing } from '@/lib/notificacoes-bus'
import { privatizarPerfilAoAprovarSocio } from '@/lib/social'
import { invalidatePermissionsCache } from '@/lib/tenant'
import {
  AtualizarMembroLgeSchema,
  DesligarMembroSchema,
  formatDataCompetenciaInput,
  PAPEL_DEPARTAMENTO,
  PERMISSIONS,
} from '@torcida/types'

const ERRO_ESPELHO_MUTACAO =
  'Este registro é um espelho da Sede. Altere na unidade de origem.'

function erroSolicitacaoJaAnalisada(
  aprovadoPorNome: string | null,
  aprovadoEm: Date | null,
): ExpectedError {
  const quem = aprovadoPorNome?.trim() || 'outro administrador'
  const quando = aprovadoEm ? ` em ${aprovadoEm.toLocaleString('pt-BR')}` : ''
  return new ExpectedError(`Esta solicitação já foi analisada por ${quem}${quando}.`)
}

type MembroDecisaoSelect = {
  id: string
  tenantId: string
  userId: string
  tipo: string
  nome: string
  status: string
  espelhado: boolean
  membroOrigemId: string | null
  aprovadoNaUnidadeTenantId: string | null
  numeroAssociado: string | null
  departamentoId: string | null
  sedeId: string | null
  aprovadoPorNome: string | null
  aprovadoEm: Date | null
  idade: number | null
  telefone: string | null
  cidade: string | null
  anosSocio: number | null
  cep: string | null
  numero: string | null
  bloco: string | null
  complemento: string | null
  imagemProva: string | null
  rg: string | null
  cpf: string | null
  filiacao: string | null
  escolaridade: string | null
  profissao: string | null
  dataNascimento: Date | null
  sexo: string | null
  estadoCivil: string | null
  nacionalidade: string | null
  logradouro: string | null
  bairro: string | null
  uf: string | null
  fotoDocumentoUrl: string | null
  comprovanteResidenciaUrl: string | null
  responsavelNome: string | null
  responsavelDocumento: string | null
  autorizacaoMenorAceitaEm: Date | null
  termoResponsabilidadeAceitoEm: Date | null
}

const membroDecisaoSelect = {
  id: true,
  tenantId: true,
  userId: true,
  tipo: true,
  nome: true,
  status: true,
  espelhado: true,
  membroOrigemId: true,
  aprovadoNaUnidadeTenantId: true,
  numeroAssociado: true,
  departamentoId: true,
  sedeId: true,
  aprovadoPorNome: true,
  aprovadoEm: true,
  idade: true,
  telefone: true,
  cidade: true,
  anosSocio: true,
  cep: true,
  numero: true,
  bloco: true,
  complemento: true,
  imagemProva: true,
  rg: true,
  cpf: true,
  filiacao: true,
  escolaridade: true,
  profissao: true,
  dataNascimento: true,
  sexo: true,
  estadoCivil: true,
  nacionalidade: true,
  logradouro: true,
  bairro: true,
  uf: true,
  fotoDocumentoUrl: true,
  comprovanteResidenciaUrl: true,
  responsavelNome: true,
  responsavelDocumento: true,
  autorizacaoMenorAceitaEm: true,
  termoResponsabilidadeAceitoEm: true,
} as const

async function marcarSolicitacoesLidas(
  atorUserId: string,
  solicitanteUserId: string,
  tenantIds: string[],
): Promise<void> {
  for (const tenantId of tenantIds) {
    const { count } = await db.notificacao.updateMany({
      where: {
        userId: atorUserId,
        tenantId,
        atorId: solicitanteUserId,
        tipo: 'MEMBRO_SOLICITADO',
        lida: false,
      },
      data: { lida: true },
    })
    if (count > 0) emitNotificacaoPing(tenantId, atorUserId)
  }
}
/**
 * Concede acesso básico ao portal quando um membro é aprovado:
 * Role de sistema 'member' (se ainda não tiver).
 * Idempotente: seguro chamar mais de uma vez para o mesmo usuário/tenant.
 *
 * Sócio/Torcedor NÃO são departamentos (ver schema Departamento) — o tipo
 * vive em SaasMembro.tipo; departamentos reais (Financeiro, Comunicação…)
 * vêm da preferência do onboarding (SaasMembro.departamentoId) só neste
 * momento, ou depois via /admin/acessos.
 */
async function concederAcessoBasico(
  tenantId: string,
  userId: string,
  client: Prisma.TransactionClient | typeof db = db,
) {
  const memberRole = await client.role.findFirst({
    where: { tenantId, nome: 'member', isSystem: true },
  })

  if (!memberRole) return

  await client.userRole.upsert({
    where: { userId_tenantId_roleId: { userId, tenantId, roleId: memberRole.id } },
    create: { userId, tenantId, roleId: memberRole.id },
    update: {},
  })
}

/**
 * Aplica o departamento pretendido no onboarding (perfil Membro · área +
 * projeção UserDepartamento). Só chamar com membro já APROVADO.
 */
async function aplicarDepartamentoPreferido(
  tenantId: string,
  userId: string,
  departamentoId: string,
  client: Prisma.TransactionClient,
) {
  const depto: { id: string } | null = await client.departamento.findFirst({
    where: { id: departamentoId, tenantId },
    select: { id: true },
  })
  if (!depto) return

  const roleMembro: { id: string } | null = await client.role.findFirst({
    where: {
      tenantId,
      departamentoId,
      papelNoDepartamento: PAPEL_DEPARTAMENTO.MEMBRO,
    },
    select: { id: true },
  })

  if (roleMembro) {
    await client.userRole.upsert({
      where: {
        userId_tenantId_roleId: { userId, tenantId, roleId: roleMembro.id },
      },
      create: { userId, tenantId, roleId: roleMembro.id },
      update: {},
    })
  } else {
    await client.userDepartamento.upsert({
      where: {
        userId_tenantId_departamentoId: { userId, tenantId, departamentoId },
      },
      create: { userId, tenantId, departamentoId },
      update: {},
    })
  }

  await syncMembershipFromRoles(client, { userId, tenantId })
}

/**
 * Remove membership de área no tenant (UserDepartamento, gestores e perfis
 * com departamento). Usado ao reprovar/reverter — pendente/reprovado não
 * herda departamento.
 */
async function limparMembershipDepartamentos(
  tenantId: string,
  userId: string,
  client: Prisma.TransactionClient | typeof db = db,
) {
  const rolesDeArea: { id: string }[] = await client.role.findMany({
    where: { tenantId, departamentoId: { not: null } },
    select: { id: true },
  })
  if (rolesDeArea.length > 0) {
    await client.userRole.deleteMany({
      where: {
        userId,
        tenantId,
        roleId: { in: rolesDeArea.map((r) => r.id) },
      },
    })
  }

  await client.userDepartamento.deleteMany({ where: { userId, tenantId } })
  await client.departamentoGestor.deleteMany({
    where: { userId, departamento: { tenantId } },
  })
}

export type AprovarMembroOpts = {
  /** Default true: aplica SaasMembro.departamentoId como membership. */
  incluirDepartamento?: boolean
}

export async function aprovarMembro(membroId: string, opts?: AprovarMembroOpts) {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_APPROVE)
  const incluirDepartamento = opts?.incluirDepartamento !== false
  const aprovadoPorNome = session.user.name ?? 'Admin'
  const aprovadoPorId = session.user.id

  type ResultadoAprovacao = {
    origem: MembroDecisaoSelect
    espelhoId: string | null
    decididoEmTenantId: string
    tenantNotificarId: string
    tenantNotificarNome: string
  }

  const resultado: ResultadoAprovacao = await db.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const existente: MembroDecisaoSelect | null = await tx.saasMembro.findFirst({
        where: { id: membroId, tenantId: tenant.id },
        select: membroDecisaoSelect,
      })
      if (!existente) throw new ExpectedError('Membro não encontrado.')

      // ── Sede decide sobre espelho PENDENTE (exceção R1) ───────────────────
      if (existente.espelhado) {
        if (existente.status !== 'PENDENTE') {
          throw erroSolicitacaoJaAnalisada(existente.aprovadoPorNome, existente.aprovadoEm)
        }
        if (!existente.membroOrigemId) {
          throw new ExpectedError('Espelho sem origem vinculada.')
        }

        const origem: MembroDecisaoSelect | null = await tx.saasMembro.findFirst({
          where: { id: existente.membroOrigemId },
          select: membroDecisaoSelect,
        })
        if (!origem) throw new ExpectedError('Membro de origem não encontrado.')
        if (origem.espelhado) throw new ExpectedError('Origem inválida.')

        await assertOrigemDescendenteDaSede(tenant.id, origem.tenantId)
        await lockDecisaoAdmissaoTorcida(tx, origem.tenantId)

        const origemFresh: MembroDecisaoSelect | null = await tx.saasMembro.findFirst({
          where: { id: origem.id },
          select: membroDecisaoSelect,
        })
        const espelhoFresh: MembroDecisaoSelect | null = await tx.saasMembro.findFirst({
          where: { id: existente.id },
          select: membroDecisaoSelect,
        })
        if (!origemFresh || !espelhoFresh) throw new ExpectedError('Membro não encontrado.')
        if (origemFresh.status !== 'PENDENTE' || espelhoFresh.status !== 'PENDENTE') {
          throw erroSolicitacaoJaAnalisada(
            origemFresh.status !== 'PENDENTE'
              ? origemFresh.aprovadoPorNome
              : espelhoFresh.aprovadoPorNome,
            origemFresh.status !== 'PENDENTE' ? origemFresh.aprovadoEm : espelhoFresh.aprovadoEm,
          )
        }

        if (origemFresh.tipo === 'SOCIO' && origemFresh.numeroAssociado) {
          await lockNumeroAssociadoDaTorcida(tx, origemFresh.tenantId)
          await validarNumeroAssociadoUnicoNaTorcida(
            tx,
            origemFresh.tenantId,
            origemFresh.userId,
            origemFresh.numeroAssociado,
            origemFresh.id,
          )
        }

        const agora = new Date()
        const origemAtualizada = await tx.saasMembro.update({
          where: { id: origemFresh.id },
          data: {
            status: 'APROVADO',
            aprovadoPorId,
            aprovadoPorNome,
            aprovadoEm: agora,
          },
          select: membroDecisaoSelect,
        })

        await concederAcessoBasico(origemFresh.tenantId, origemAtualizada.userId, tx)

        if (origemAtualizada.tipo === 'SOCIO') {
          await privatizarPerfilAoAprovarSocio(
            origemAtualizada.userId,
            origemFresh.tenantId,
            tx,
          )
          if (incluirDepartamento && origemAtualizada.departamentoId) {
            await aplicarDepartamentoPreferido(
              origemFresh.tenantId,
              origemAtualizada.userId,
              origemAtualizada.departamentoId,
              tx,
            )
          }
          await sincronizarSocioNaSedeRaiz(tx, {
            tenantOrigemId: origemFresh.tenantId,
            membro: origemAtualizada,
            aprovadoPorUserId: aprovadoPorId,
            aprovadoPorNome,
          })
        }

        const unidadeTenant: { nome: string } | null = await tx.tenant.findFirst({
          where: { id: origemFresh.tenantId },
          select: { nome: true },
        })

        return {
          origem: origemAtualizada,
          espelhoId: existente.id,
          decididoEmTenantId: tenant.id,
          tenantNotificarId: origemFresh.tenantId,
          tenantNotificarNome: unidadeTenant?.nome ?? tenant.nome,
        }
      }

      // ── Unidade (origem) decide ───────────────────────────────────────────
      if (existente.status !== 'PENDENTE' && existente.status !== 'REPROVADO') {
        throw erroSolicitacaoJaAnalisada(existente.aprovadoPorNome, existente.aprovadoEm)
      }

      await lockDecisaoAdmissaoTorcida(tx, tenant.id)

      const fresh: MembroDecisaoSelect | null = await tx.saasMembro.findFirst({
        where: { id: existente.id },
        select: membroDecisaoSelect,
      })
      if (!fresh) throw new ExpectedError('Membro não encontrado.')
      if (fresh.status === 'APROVADO') {
        throw erroSolicitacaoJaAnalisada(fresh.aprovadoPorNome, fresh.aprovadoEm)
      }

      if (fresh.tipo === 'SOCIO' && fresh.numeroAssociado) {
        await lockNumeroAssociadoDaTorcida(tx, tenant.id)
        await validarNumeroAssociadoUnicoNaTorcida(
          tx,
          tenant.id,
          fresh.userId,
          fresh.numeroAssociado,
          fresh.id,
        )
      }

      const atualizado = await tx.saasMembro.update({
        where: { id: membroId, tenantId: tenant.id },
        data: {
          status: 'APROVADO',
          aprovadoPorId,
          aprovadoPorNome,
          aprovadoEm: new Date(),
        },
        select: membroDecisaoSelect,
      })

      await concederAcessoBasico(tenant.id, atualizado.userId, tx)

      let espelhoId: string | null = null
      if (atualizado.tipo === 'SOCIO') {
        await privatizarPerfilAoAprovarSocio(atualizado.userId, tenant.id, tx)
        if (incluirDepartamento && atualizado.departamentoId) {
          await aplicarDepartamentoPreferido(
            tenant.id,
            atualizado.userId,
            atualizado.departamentoId,
            tx,
          )
        }
        await sincronizarSocioNaSedeRaiz(tx, {
          tenantOrigemId: tenant.id,
          membro: atualizado,
          aprovadoPorUserId: aprovadoPorId,
          aprovadoPorNome,
        })
        const espelho: { id: string } | null = await tx.saasMembro.findUnique({
          where: { membroOrigemId: atualizado.id },
          select: { id: true },
        })
        espelhoId = espelho?.id ?? null
      }

      return {
        origem: atualizado,
        espelhoId,
        decididoEmTenantId: tenant.id,
        tenantNotificarId: tenant.id,
        tenantNotificarNome: tenant.nome,
      }
    },
  )

  const { origem, espelhoId, decididoEmTenantId, tenantNotificarId, tenantNotificarNome } =
    resultado

  invalidatePermissionsCache(origem.userId, origem.tenantId)

  const tenantIdsNotif = [origem.tenantId]
  if (espelhoId) {
    const espelhoTenant: { tenantId: string } | null = await db.saasMembro.findFirst({
      where: { id: espelhoId },
      select: { tenantId: true },
    })
    if (espelhoTenant && !tenantIdsNotif.includes(espelhoTenant.tenantId)) {
      tenantIdsNotif.push(espelhoTenant.tenantId)
    }
  }
  await marcarSolicitacoesLidas(aprovadoPorId, origem.userId, tenantIdsNotif)

  await vincularMembroCanaisAposAprovacao({
    tenantId: origem.tenantId,
    userId: origem.userId,
    sedeId: origem.sedeId,
    fallbackCriadoPorId: aprovadoPorId,
  })

  const detalhesAudit = {
    departamentoId: origem.departamentoId,
    incluirDepartamento,
    membroOrigemId: origem.id,
    espelhoId,
    decididoEmTenantId,
  }

  await db.auditLog.create({
    data: {
      tenantId: origem.tenantId,
      atorId: aprovadoPorId,
      acao: 'MEMBRO_APROVADO',
      entidade: 'SaasMembro',
      entidadeId: origem.id,
      detalhes: detalhesAudit,
    },
  })
  if (espelhoId && decididoEmTenantId !== origem.tenantId) {
    await db.auditLog.create({
      data: {
        tenantId: decididoEmTenantId,
        atorId: aprovadoPorId,
        acao: 'MEMBRO_APROVADO',
        entidade: 'SaasMembro',
        entidadeId: espelhoId,
        detalhes: detalhesAudit,
      },
    })
  } else if (espelhoId) {
    const espelhoRow: { tenantId: string } | null = await db.saasMembro.findFirst({
      where: { id: espelhoId },
      select: { tenantId: true },
    })
    if (espelhoRow && espelhoRow.tenantId !== origem.tenantId) {
      await db.auditLog.create({
        data: {
          tenantId: espelhoRow.tenantId,
          atorId: aprovadoPorId,
          acao: 'MEMBRO_APROVADO',
          entidade: 'SaasMembro',
          entidadeId: espelhoId,
          detalhes: detalhesAudit,
        },
      })
    }
  }

  await notificarSafe({
    userId: origem.userId,
    tenantId: tenantNotificarId,
    tipo: 'MEMBRO_APROVADO',
    titulo: 'Sua solicitação foi aprovada',
    corpo: `Você agora é membro de ${tenantNotificarNome}.`,
    link: '/portal/carteirinha',
  })

  invalidarBadgesAutorTenant(origem.tenantId)
  revalidatePath('/admin/membros')
  revalidatePath('/admin')
  revalidatePath('/portal/departamentos', 'layout')
  revalidatePath('/portal/comunidade')
  revalidatePath('/portal/carteirinha')
  revalidatePath(`/portal/comunidade/perfil/${origem.userId}`)
}

export async function reprovarMembro(membroId: string, motivo?: string) {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_REJECT)
  const aprovadoPorNome = session.user.name ?? 'Admin'
  const aprovadoPorId = session.user.id
  const motivoTrim = motivo?.trim() || null

  type ResultadoReprovacao = {
    origem: MembroDecisaoSelect
    espelhoId: string | null
    decididoEmTenantId: string
    tenantNotificarId: string
    tenantNotificarNome: string
  }

  const resultado: ResultadoReprovacao = await db.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const existente: MembroDecisaoSelect | null = await tx.saasMembro.findFirst({
        where: { id: membroId, tenantId: tenant.id },
        select: membroDecisaoSelect,
      })
      if (!existente) throw new ExpectedError('Membro não encontrado.')

      if (existente.espelhado) {
        if (existente.status !== 'PENDENTE') {
          throw erroSolicitacaoJaAnalisada(existente.aprovadoPorNome, existente.aprovadoEm)
        }
        if (!existente.membroOrigemId) {
          throw new ExpectedError('Espelho sem origem vinculada.')
        }

        const origem: MembroDecisaoSelect | null = await tx.saasMembro.findFirst({
          where: { id: existente.membroOrigemId },
          select: membroDecisaoSelect,
        })
        if (!origem) throw new ExpectedError('Membro de origem não encontrado.')

        await assertOrigemDescendenteDaSede(tenant.id, origem.tenantId)
        await lockDecisaoAdmissaoTorcida(tx, origem.tenantId)

        const origemFresh: MembroDecisaoSelect | null = await tx.saasMembro.findFirst({
          where: { id: origem.id },
          select: membroDecisaoSelect,
        })
        const espelhoFresh: MembroDecisaoSelect | null = await tx.saasMembro.findFirst({
          where: { id: existente.id },
          select: membroDecisaoSelect,
        })
        if (!origemFresh || !espelhoFresh) throw new ExpectedError('Membro não encontrado.')
        if (origemFresh.status !== 'PENDENTE' || espelhoFresh.status !== 'PENDENTE') {
          throw erroSolicitacaoJaAnalisada(
            origemFresh.status !== 'PENDENTE'
              ? origemFresh.aprovadoPorNome
              : espelhoFresh.aprovadoPorNome,
            origemFresh.status !== 'PENDENTE' ? origemFresh.aprovadoEm : espelhoFresh.aprovadoEm,
          )
        }

        const agora = new Date()
        const origemAtualizada = await tx.saasMembro.update({
          where: { id: origemFresh.id },
          data: {
            status: 'REPROVADO',
            aprovadoPorId,
            aprovadoPorNome,
            aprovadoEm: agora,
          },
          select: membroDecisaoSelect,
        })

        await limparMembershipDepartamentos(origemFresh.tenantId, origemAtualizada.userId, tx)
        await sincronizarStatusEspelhoDaOrigem(tx, {
          membroOrigemId: origemAtualizada.id,
          status: 'REPROVADO',
          aprovadoPorId,
          aprovadoPorNome,
          aprovadoEm: agora,
          desligadoMotivo: motivoTrim || 'Reprovado pela Sede',
        })

        const unidadeTenant: { nome: string } | null = await tx.tenant.findFirst({
          where: { id: origemFresh.tenantId },
          select: { nome: true },
        })

        return {
          origem: origemAtualizada,
          espelhoId: existente.id,
          decididoEmTenantId: tenant.id,
          tenantNotificarId: origemFresh.tenantId,
          tenantNotificarNome: unidadeTenant?.nome ?? tenant.nome,
        }
      }

      await lockDecisaoAdmissaoTorcida(tx, tenant.id)

      const fresh: MembroDecisaoSelect | null = await tx.saasMembro.findFirst({
        where: { id: existente.id },
        select: membroDecisaoSelect,
      })
      if (!fresh) throw new ExpectedError('Membro não encontrado.')
      if (fresh.status !== 'PENDENTE') {
        throw erroSolicitacaoJaAnalisada(fresh.aprovadoPorNome, fresh.aprovadoEm)
      }

      const agora = new Date()
      const atualizado = await tx.saasMembro.update({
        where: { id: membroId, tenantId: tenant.id },
        data: {
          status: 'REPROVADO',
          aprovadoPorId,
          aprovadoPorNome,
          aprovadoEm: agora,
        },
        select: membroDecisaoSelect,
      })

      await limparMembershipDepartamentos(tenant.id, atualizado.userId, tx)
      const espelhoId = await sincronizarStatusEspelhoDaOrigem(tx, {
        membroOrigemId: atualizado.id,
        status: 'REPROVADO',
        aprovadoPorId,
        aprovadoPorNome,
        aprovadoEm: agora,
        desligadoMotivo: motivoTrim || 'Reprovado na unidade de origem',
      })

      return {
        origem: atualizado,
        espelhoId,
        decididoEmTenantId: tenant.id,
        tenantNotificarId: tenant.id,
        tenantNotificarNome: tenant.nome,
      }
    },
  )

  const { origem, espelhoId, decididoEmTenantId, tenantNotificarId, tenantNotificarNome } =
    resultado

  const tenantIdsNotif = [origem.tenantId]
  if (espelhoId) {
    const espelhoTenant: { tenantId: string } | null = await db.saasMembro.findFirst({
      where: { id: espelhoId },
      select: { tenantId: true },
    })
    if (espelhoTenant && !tenantIdsNotif.includes(espelhoTenant.tenantId)) {
      tenantIdsNotif.push(espelhoTenant.tenantId)
    }
  }
  await marcarSolicitacoesLidas(aprovadoPorId, origem.userId, tenantIdsNotif)

  const detalhesAudit = {
    motivo: motivoTrim,
    membroOrigemId: origem.id,
    espelhoId,
    decididoEmTenantId,
  }

  await db.auditLog.create({
    data: {
      tenantId: origem.tenantId,
      atorId: aprovadoPorId,
      acao: 'MEMBRO_REPROVADO',
      entidade: 'SaasMembro',
      entidadeId: origem.id,
      detalhes: detalhesAudit,
    },
  })
  if (espelhoId) {
    const espelhoRow: { tenantId: string } | null = await db.saasMembro.findFirst({
      where: { id: espelhoId },
      select: { tenantId: true },
    })
    if (espelhoRow && espelhoRow.tenantId !== origem.tenantId) {
      await db.auditLog.create({
        data: {
          tenantId: espelhoRow.tenantId,
          atorId: aprovadoPorId,
          acao: 'MEMBRO_REPROVADO',
          entidade: 'SaasMembro',
          entidadeId: espelhoId,
          detalhes: detalhesAudit,
        },
      })
    }
  }

  await notificarSafe({
    userId: origem.userId,
    tenantId: tenantNotificarId,
    tipo: 'MEMBRO_REPROVADO',
    titulo: 'Sua solicitação foi reprovada',
    corpo: motivoTrim
      ? motivoTrim
      : `Sua solicitação de ingresso em ${tenantNotificarNome} não foi aprovada.`,
    link: '/portal/carteirinha',
  })

  revalidatePath('/admin/membros')
  revalidatePath('/admin')
  revalidatePath('/portal/departamentos', 'layout')
  revalidatePath('/portal/carteirinha')
}

export async function reverterMembro(membroId: string) {
  // Reverte aprovação/reprovação para pendente — reaproveita MEMBERS_APPROVE
  // (não existe permissão dedicada para "reverter"; é a mesma decisão de
  // aprovação sendo desfeita). Espelho só é revertível pela origem.
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_APPROVE)

  const resultado: { origemId: string; origemTenantId: string; espelhoId: string | null } =
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const existente: MembroDecisaoSelect | null = await tx.saasMembro.findFirst({
        where: { id: membroId, tenantId: tenant.id },
        select: membroDecisaoSelect,
      })
      if (!existente) throw new ExpectedError('Membro não encontrado.')
      if (existente.espelhado) throw new ExpectedError(ERRO_ESPELHO_MUTACAO)

      await lockDecisaoAdmissaoTorcida(tx, tenant.id)

      const atualizado = await tx.saasMembro.update({
        where: { id: membroId, tenantId: tenant.id },
        data: {
          status: 'PENDENTE',
          aprovadoPorId: null,
          aprovadoPorNome: null,
          aprovadoEm: null,
        },
        select: membroDecisaoSelect,
      })

      await limparMembershipDepartamentos(tenant.id, atualizado.userId, tx)
      const espelhoId = await sincronizarStatusEspelhoDaOrigem(tx, {
        membroOrigemId: atualizado.id,
        status: 'PENDENTE',
        aprovadoPorId: null,
        aprovadoPorNome: null,
        aprovadoEm: null,
      })

      return {
        origemId: atualizado.id,
        origemTenantId: tenant.id,
        espelhoId,
      }
    })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'MEMBRO_REVERTIDO_PENDENTE',
      entidade: 'SaasMembro',
      entidadeId: resultado.origemId,
      detalhes: {
        membroOrigemId: resultado.origemId,
        espelhoId: resultado.espelhoId,
        decididoEmTenantId: tenant.id,
      },
    },
  })
  if (resultado.espelhoId) {
    const espelhoRow: { tenantId: string } | null = await db.saasMembro.findFirst({
      where: { id: resultado.espelhoId },
      select: { tenantId: true },
    })
    if (espelhoRow && espelhoRow.tenantId !== tenant.id) {
      await db.auditLog.create({
        data: {
          tenantId: espelhoRow.tenantId,
          atorId: session.user.id,
          acao: 'MEMBRO_REVERTIDO_PENDENTE',
          entidade: 'SaasMembro',
          entidadeId: resultado.espelhoId,
          detalhes: {
            membroOrigemId: resultado.origemId,
            espelhoId: resultado.espelhoId,
            decididoEmTenantId: tenant.id,
          },
        },
      })
    }
  }

  revalidatePath('/admin/membros')
  revalidatePath('/portal/departamentos', 'layout')
}

export type MembroLgeState = {
  ok?: boolean
  error?: string
  errors?: Record<string, string[]>
}

function formToLgePayload(formData: FormData) {
  return {
    membroId: formData.get('membroId'),
    rg: formData.get('rg') ?? undefined,
    cpf: formData.get('cpf') ?? undefined,
    filiacao: formData.get('filiacao') ?? undefined,
    escolaridade: formData.get('escolaridade') ?? undefined,
    profissao: formData.get('profissao') ?? undefined,
    dataNascimento: formData.get('dataNascimento') ?? undefined,
    planoAssociacaoId: formData.get('planoAssociacaoId') ?? undefined,
  }
}

export async function atualizarDadosLge(
  _prev: MembroLgeState,
  formData: FormData,
): Promise<MembroLgeState> {
  const { session, tenant } = await assertAnyPermission([
    PERMISSIONS.MEMBERS_VIEW,
    PERMISSIONS.MEMBERS_APPROVE,
  ])

  const parsed = AtualizarMembroLgeSchema.safeParse(formToLgePayload(formData))
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const data = parsed.data
  const existente: { id: string; espelhado: boolean } | null = await db.saasMembro.findFirst({
    where: { id: data.membroId, tenantId: tenant.id },
    select: { id: true, espelhado: true },
  })
  if (!existente) return { error: 'Membro não encontrado' }
  if (existente.espelhado) return { error: ERRO_ESPELHO_MUTACAO }

  if (data.planoAssociacaoId) {
    const plano: { id: string } | null = await db.planoAssociacao.findFirst({
      where: { id: data.planoAssociacaoId, tenantId: tenant.id },
      select: { id: true },
    })
    if (!plano) return { errors: { planoAssociacaoId: ['Plano inválido'] } }
  }

  let dataNascimento: Date | null = null
  if (data.dataNascimento) {
    const { parseDataCompetencia } = await import('@torcida/types')
    dataNascimento = parseDataCompetencia(data.dataNascimento)
  }

  const dadosLge = {
    rg: data.rg ?? null,
    cpf: data.cpf ?? null,
    filiacao: data.filiacao ?? null,
    escolaridade: data.escolaridade ?? null,
    profissao: data.profissao ?? null,
    dataNascimento,
  }

  await db.saasMembro.update({
    where: { id: existente.id },
    data: {
      ...dadosLge,
      planoAssociacaoId: data.planoAssociacaoId ?? null,
    },
  })

  await propagarLgeParaEspelho(db, existente.id, dadosLge)

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'MEMBRO_LGE_ATUALIZADO',
      entidade: 'SaasMembro',
      entidadeId: existente.id,
    },
  })

  revalidatePath('/admin/membros')
  revalidatePath(`/admin/membros/${existente.id}`)
  return { ok: true }
}

export async function desligarMembro(
  _prev: MembroLgeState,
  formData: FormData,
): Promise<MembroLgeState> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_DISMISS)

  const parsed = DesligarMembroSchema.safeParse({
    membroId: formData.get('membroId'),
    motivo: formData.get('motivo'),
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const membro: { id: string; desligadoEm: Date | null; espelhado: boolean } | null =
    await db.saasMembro.findFirst({
      where: { id: parsed.data.membroId, tenantId: tenant.id },
      select: { id: true, desligadoEm: true, espelhado: true },
    })
  if (!membro) return { error: 'Membro não encontrado' }
  if (membro.espelhado) return { error: ERRO_ESPELHO_MUTACAO }
  if (membro.desligadoEm) return { error: 'Membro já desligado' }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.saasMembro.update({
      where: { id: membro.id },
      data: {
        desligadoEm: new Date(),
        desligadoMotivo: parsed.data.motivo,
        desligadoPorId: session.user.id,
      },
    })
    await desligarEspelhoDaOrigem(tx, membro.id, parsed.data.motivo)
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'MEMBRO_DESLIGADO',
      entidade: 'SaasMembro',
      entidadeId: membro.id,
      detalhes: { motivo: parsed.data.motivo },
    },
  })

  revalidatePath('/admin/membros')
  revalidatePath(`/admin/membros/${membro.id}`)
  return { ok: true }
}

function csvEscape(val: string): string {
  if (/[",\n\r]/.test(val)) return `"${val.replace(/"/g, '""')}"`
  return val
}

export async function exportarCadastroLgeCsv(): Promise<
  { ok: true; csv: string; filename: string } | { ok: false; error: string }
> {
  const { tenant } = await assertPermission(PERMISSIONS.MEMBERS_EXPORT_LGE)

  type Row = {
    nome: string
    cpf: string | null
    rg: string | null
    filiacao: string | null
    escolaridade: string | null
    profissao: string | null
    dataNascimento: Date | null
    cidade: string | null
    telefone: string | null
    status: string
    adimplente: boolean
    desligadoEm: Date | null
  }

  const rows: Row[] = await db.saasMembro.findMany({
    where: { tenantId: tenant.id },
    orderBy: { nome: 'asc' },
    select: {
      nome: true,
      cpf: true,
      rg: true,
      filiacao: true,
      escolaridade: true,
      profissao: true,
      dataNascimento: true,
      cidade: true,
      telefone: true,
      status: true,
      adimplente: true,
      desligadoEm: true,
    },
  })

  const header =
    'nome,cpf,rg,filiacao,escolaridade,profissao,dataNascimento,cidade,telefone,status,adimplente,desligadoEm'
  const lines = rows.map((r) =>
    [
      r.nome,
      r.cpf ?? '',
      r.rg ?? '',
      r.filiacao ?? '',
      r.escolaridade ?? '',
      r.profissao ?? '',
      r.dataNascimento ? formatDataCompetenciaInput(r.dataNascimento) : '',
      r.cidade ?? '',
      r.telefone ?? '',
      r.status,
      r.adimplente ? 'sim' : 'nao',
      r.desligadoEm ? r.desligadoEm.toISOString() : '',
    ]
      .map((v) => csvEscape(String(v)))
      .join(','),
  )

  const csv = [header, ...lines].join('\n')
  const filename = `lge-${tenant.slug}-${new Date().toISOString().slice(0, 10)}.csv`
  return { ok: true, csv, filename }
}

/**
 * Corrige / transfere a unidade territorial do membro (SaasMembro.sedeId).
 * Afeta KPIs da Visão da torcida, contagens em Sedes e escopo de eventos.
 */
export async function reatribuirSedeMembro(
  membroId: string,
  sedeId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_APPROVE)

  const membro: { id: string; sedeId: string | null; espelhado: boolean } | null =
    await db.saasMembro.findFirst({
      where: { id: membroId, tenantId: tenant.id },
      select: { id: true, sedeId: true, espelhado: true },
    })
  if (!membro) return { ok: false, error: 'Membro não encontrado.' }
  if (membro.espelhado) {
    return { ok: false, error: 'Registro espelhado — altere na unidade de origem.' }
  }

  let sedeAlvoId: string | null = sedeId?.trim() || null
  if (sedeAlvoId) {
    const sede = await db.sede.findFirst({
      where: { id: sedeAlvoId, tenantId: tenant.id, ativa: true },
      select: { id: true },
    })
    if (!sede) return { ok: false, error: 'Unidade não encontrada ou inativa.' }
    sedeAlvoId = sede.id
  }

  if (membro.sedeId === sedeAlvoId) return { ok: true }

  await db.saasMembro.update({
    where: { id: membro.id },
    data: { sedeId: sedeAlvoId },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'MEMBRO_SEDE_REATRIBUIDA',
      entidade: 'SaasMembro',
      entidadeId: membro.id,
      detalhes: {
        sedeIdAntes: membro.sedeId,
        sedeIdDepois: sedeAlvoId,
      },
    },
  })

  revalidatePath('/admin/membros')
  revalidatePath(`/admin/membros/${membro.id}`)
  revalidatePath('/admin/sedes')
  revalidatePath('/admin/torcida')
  return { ok: true }
}
