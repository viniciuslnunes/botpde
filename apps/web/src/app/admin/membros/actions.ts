'use server'

import { revalidatePath } from 'next/cache'
import { invalidarCachesComunidadeFeed } from '@/lib/comunidade-cache'
import { db, syncMembershipFromRoles, Prisma } from '@torcida/db'
import { assertAnyPermission, assertPermission } from '@/lib/authz'
import { vincularMembroCanaisAposAprovacao } from '@/lib/canais'
import { ExpectedError, isExpectedError } from '@/lib/expected-error'
import {
  assertOrigemDescendenteDaSede,
  desligarEspelhoDaOrigem,
  lockDecisaoAdmissaoTorcida,
  lockNumeroAssociadoDaTorcida,
  propagarLgeParaEspelho,
  REPROVACAO_LIMPA,
  sincronizarSocioNaSedeRaiz,
  sincronizarStatusEspelhoDaOrigem,
  validarNumeroAssociadoUnicoNaTorcida,
  type DadosReprovacaoEspelho,
} from '@/lib/membros-sede'
import {
  notificarSafe,
  emitNotificacaoPingCnDoSolicitante,
  reconciliarNotificacoesDoEvento,
} from '@/lib/notificacoes'
import { emitNotificacaoPing } from '@/lib/notificacoes-bus'
import { privatizarPerfilAoAprovarSocio } from '@/lib/social'
import { invalidatePermissionsCache } from '@/lib/tenant'
import { tentarAutoEmitirCarteirinhaAposAprovacao } from '@/lib/carteirinha-emissao'
import { espelharCarteirinhaDoTenant } from '@/lib/carteirinha-espelho'
import { diffCamposMembro } from '@/lib/membro-audit-diff'
import {
  executarPurgeMembro,
  membroPurgeSelect,
  motivoImpedeApagar,
  type MembroParaPurge,
} from '@/lib/membros-purge'
import {
  AtualizarMembroLgeSchema,
  BloquearMembroSchema,
  DesbloquearMembroSchema,
  DesligarMembroSchema,
  formatDataCompetenciaInput,
  formatNomeTorcida,
  labelCategoriaReprovacao,
  labelPontoReprovacao,
  PAPEL_DEPARTAMENTO,
  PERMISSIONS,
  ReprovarMembroSchema,
} from '@torcida/types'

const ERRO_ESPELHO_MUTACAO =
  'Este registro é um espelho da Sede. Altere na unidade de origem.'

/**
 * Decisão de admissão faz muitas idas ao banco em série (advisory locks,
 * espelho, `syncMembershipFromRoles` quando há departamento) — acima do
 * default de 5s do Prisma sob a latência do Postgres do Railway, causando
 * "Transaction API error: Transaction not found" (P2028-like) em produção.
 */
const TRANSACAO_DECISAO_MEMBRO_OPTS = { timeout: 20_000, maxWait: 10_000 }

function erroSolicitacaoJaAnalisada(
  aprovadoPorNome: string | null,
  aprovadoEm: Date | null,
): ExpectedError {
  const quem = aprovadoPorNome?.trim() || 'outro administrador'
  const quando = aprovadoEm ? ` em ${aprovadoEm.toLocaleString('pt-BR')}` : ''
  return new ExpectedError(`Esta solicitação já foi analisada por ${quem}${quando}.`)
}

/** Converte unique violation do Prisma em mensagem de UI (evita 500 genérico). */
function erroDecisaoPorUnique(err: unknown): { error: string } | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
    return null
  }
  const target = err.meta?.target
  const targetStr = Array.isArray(target) ? target.join(',') : String(target ?? '')
  if (targetStr.toLowerCase().includes('cpf')) {
    return {
      error:
        'Este CPF já está cadastrado na Sede por outro associado. Ajuste o cadastro antes de aprovar.',
    }
  }
  return {
    error:
      'Não foi possível concluir a decisão por conflito de dados (CPF ou vínculo duplicado). Verifique o cadastro.',
  }
}

function mapearErroDecisaoMembro(err: unknown): { error: string } | null {
  if (isExpectedError(err)) return { error: err.message }
  return erroDecisaoPorUnique(err)
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
  dataExpedicaoCarteirinha: Date | null
  periodicidadePretendida: string | null
  departamentoId: string | null
  departamentoSedeId: string | null
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
  dataExpedicaoCarteirinha: true,
  periodicidadePretendida: true,
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
  departamentoSedeId: true,
} as const

/**
 * A solicitação foi decidida — o badge cai para TODA a equipe que a recebeu,
 * não só para quem decidiu (Achado 10).
 */
async function marcarSolicitacoesLidas(
  solicitanteUserId: string,
  tenantIds: string[],
): Promise<void> {
  for (const tenantId of tenantIds) {
    await reconciliarNotificacoesDoEvento(tenantId, {
      tipo: 'MEMBRO_SOLICITADO',
      atorId: solicitanteUserId,
    })
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
): Promise<{
  perfisAreaRemovidos: number
  membrosRemovidos: number
  gestoresRemovidos: number
  areasRemovidas: number
}> {
  const rolesDeArea: { id: string }[] = await client.role.findMany({
    where: { tenantId, departamentoId: { not: null } },
    select: { id: true },
  })
  const perfisAreaRemovidos =
    rolesDeArea.length > 0
      ? (
          await client.userRole.deleteMany({
            where: {
              userId,
              tenantId,
              roleId: { in: rolesDeArea.map((r) => r.id) },
            },
          })
        ).count
      : 0

  const membrosRemovidos = await client.userDepartamento.deleteMany({
    where: { userId, tenantId },
  })
  const gestoresRemovidos = await client.departamentoGestor.deleteMany({
    where: { userId, departamento: { tenantId } },
  })
  // Quem sai do departamento perde as áreas dele — área não é RBAC, mas
  // organiza gente do departamento; sem membership, não há o que organizar.
  const areasRemovidas = await client.departamentoAreaMembro.deleteMany({
    where: { userId, area: { tenantId } },
  })
  return {
    perfisAreaRemovidos,
    membrosRemovidos: membrosRemovidos.count,
    gestoresRemovidos: gestoresRemovidos.count,
    areasRemovidas: areasRemovidas.count,
  }
}

/**
 * Coloca em vigor a área pretendida **deste tenant** para um sócio já APROVADO.
 *
 * Existe porque o vínculo de sócio é first-wins na torcida (quem decidir
 * primeiro aprova nos dois níveis), mas a área não: o departamento pedido para
 * a Sede só vale quando a Sede decide, e o da unidade só quando a unidade
 * decide. Quem aprovou primeiro já efetivou a sua na hora — o outro nível usa
 * esta ação. O gate é estrutural: `assertPermission` resolve no tenant ativo e
 * a query filtra por ele, então ninguém efetiva área fora do próprio nível.
 *
 * Idempotente: `aplicarDepartamentoPreferido` faz upsert.
 */
export async function efetivarAreaPretendida(
  membroId: string,
): Promise<{ error: string } | void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_APPROVE)

  try {
    const resultado = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const membro: {
        id: string
        userId: string
        tipo: string
        status: string
        departamentoId: string | null
      } | null = await tx.saasMembro.findFirst({
        where: { id: membroId, tenantId: tenant.id },
        select: { id: true, userId: true, tipo: true, status: true, departamentoId: true },
      })
      if (!membro) throw new ExpectedError('Membro não encontrado.')
      if (membro.tipo !== 'SOCIO') {
        throw new ExpectedError('Só sócio entra em departamento.')
      }
      if (membro.status !== 'APROVADO') {
        throw new ExpectedError('Aprove o vínculo antes de incluir na área.')
      }
      if (!membro.departamentoId) {
        throw new ExpectedError('Este cadastro não pediu área neste nível.')
      }

      await aplicarDepartamentoPreferido(tenant.id, membro.userId, membro.departamentoId, tx)

      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          atorId: session.user.id,
          acao: 'MEMBRO_AREA_EFETIVADA',
          entidade: 'SaasMembro',
          entidadeId: membro.id,
          detalhes: { departamentoId: membro.departamentoId },
        },
      })

      return { userId: membro.userId }
    })

    invalidatePermissionsCache(resultado.userId, tenant.id)
  } catch (error) {
    if (isExpectedError(error)) return { error: error.message }
    console.error('[efetivarAreaPretendida]', error)
    return { error: 'Não foi possível incluir na área. Tente novamente.' }
  }

  revalidatePath('/admin/torcedores')
  revalidatePath('/admin/membros')
  revalidatePath('/admin/socios')
  revalidatePath('/portal/departamentos')
}

export type AprovarMembroOpts = {
  /** Default true: aplica SaasMembro.departamentoId como membership. */
  incluirDepartamento?: boolean
}

export async function aprovarMembro(
  membroId: string,
  opts?: AprovarMembroOpts,
): Promise<{ error: string } | void> {
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

  try {
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
            ...REPROVACAO_LIMPA,
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
          // O vínculo de sócio é first-wins e propaga para os dois níveis, mas
          // a ÁREA não: cada nível efetiva a sua. Aqui quem decide é a Sede, e
          // `origemFresh.tenantId` é a unidade — aplicar o departamento dela
          // daria à Sede o poder de montar a equipe da Subsede/PDE. A unidade
          // efetiva a sua depois, por `efetivarAreaPretendida`.
          await sincronizarSocioNaSedeRaiz(tx, {
            tenantOrigemId: origemFresh.tenantId,
            membro: origemAtualizada,
            aprovadoPorUserId: aprovadoPorId,
            aprovadoPorNome,
          })
          // Área NA SEDE: é esta decisão que a coloca em vigor. Lê do espelho
          // (já sincronizado acima), cujo `departamentoId` veio de
          // `departamentoSedeId` declarado no onboarding.
          if (incluirDepartamento) {
            const espelhoSede: { departamentoId: string | null } | null =
              await tx.saasMembro.findFirst({
                where: { id: existente.id, tenantId: tenant.id },
                select: { departamentoId: true },
              })
            if (espelhoSede?.departamentoId) {
              await aplicarDepartamentoPreferido(
                tenant.id,
                origemAtualizada.userId,
                espelhoSede.departamentoId,
                tx,
              )
            }
          }
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
          tenantNotificarNome: formatNomeTorcida(unidadeTenant?.nome ?? tenant.nome),
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
          ...REPROVACAO_LIMPA,
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
        tenantNotificarNome: formatNomeTorcida(tenant.nome),
      }
    },
    TRANSACAO_DECISAO_MEMBRO_OPTS,
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
  await marcarSolicitacoesLidas(origem.userId, tenantIdsNotif)

  await vincularMembroCanaisAposAprovacao({
    tenantId: origem.tenantId,
    userId: origem.userId,
    sedeId: origem.sedeId,
    fallbackCriadoPorId: aprovadoPorId,
    // A fila lista os dois tipos: aprovar um torcedor aqui não pode inscrevê-lo
    // no canal da Sede (mesma regra do onboarding — ele é da unidade).
    tipo: origem.tipo === 'TORCEDOR' ? 'TORCEDOR' : 'SOCIO',
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
    // `/auth/contexto` grava cookie / redireciona ao subdomínio da torcida —
    // o solicitante ainda está na CN e precisa trocar de contexto na hora.
    link: '/auth/contexto',
  })
  await emitNotificacaoPingCnDoSolicitante(tenantNotificarId, origem.userId)

  // Sócio «Já sou sócio»: auto-emite carteirinha com validade = expedição + plano.
  // Best-effort — falha deixa o sócio em Aguardando emissão.
  if (origem.tipo === 'SOCIO') {
    const auto = await tentarAutoEmitirCarteirinhaAposAprovacao({
      tenantId: origem.tenantId,
      userId: origem.userId,
      nome: origem.nome,
      tipo: origem.tipo,
      numeroAssociado: origem.numeroAssociado,
      dataExpedicaoCarteirinha: origem.dataExpedicaoCarteirinha,
      periodicidadePretendida: origem.periodicidadePretendida,
      atorId: aprovadoPorId,
    })
    if (auto.emitida) {
      await notificarSafe({
        userId: origem.userId,
        tenantId: origem.tenantId,
        tipo: 'SOCIO_CARTEIRINHA_EMITIDA',
        titulo: 'Carteirinha de sócio emitida',
        corpo: origem.numeroAssociado
          ? `Você é o sócio nº ${origem.numeroAssociado}.`
          : 'Sua carteirinha digital foi ativada.',
        link: '/portal/carteirinha',
        atorId: aprovadoPorId,
      })
      // É o mesmo sócio nos dois níveis (mesmo nº, mesma validade): sem isto o
      // espelho na Sede fica preso em "Aguardando emissão" e some das abas
      // Emitidas/Ativos, que leem `SaasSocio`. Sem notificar de novo.
      await espelharCarteirinhaDoTenant({
        tenantId: origem.tenantId,
        userId: origem.userId,
        atorId: aprovadoPorId,
      })
    }
  }

  invalidarCachesComunidadeFeed(origem.tenantId)
  // Força recomputar contexto/caches compartilhados do portal (navbar + layout)
  // para refletir imediatamente `membro.status: APROVADO` no hard refresh.
  revalidatePath('/portal', 'layout')
  revalidatePath('/admin/torcedores')
  revalidatePath('/admin/membros')
  revalidatePath('/admin/socios')
  revalidatePath('/admin')
  revalidatePath('/portal/departamentos', 'layout')
  revalidatePath('/portal/comunidade')
  revalidatePath('/portal/carteirinha')
  revalidatePath(`/portal/comunidade/perfil/${origem.userId}`)
  } catch (err) {
    const mapped = mapearErroDecisaoMembro(err)
    if (mapped) return mapped
    throw err
  }
}

export type ReprovarMembroInput = {
  /** Id de `CATEGORIAS_REPROVACAO`. */
  categoria: string
  /** Justificativa livre do analista (obrigatória). */
  motivo: string
  /** Ids de `PONTOS_REPROVACAO` apontados como incorretos. */
  pontos: string[]
  /** false = reprovação definitiva; bloqueia o reenvio pelo solicitante. */
  permiteReenvio: boolean
  /**
   * true = além de reprovar, bloqueia novas solicitações na unidade ONDE a
   * solicitação nasceu. Exige `members:block` — revalidado no servidor.
   */
  bloquear?: boolean
}

export async function reprovarMembro(
  membroId: string,
  input: ReprovarMembroInput,
): Promise<{ error: string } | void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_REJECT)

  const parsed = ReprovarMembroSchema.safeParse({ membroId, ...input })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados da reprovação inválidos.' }
  }
  const { categoria, motivo: motivoTrim, pontos, permiteReenvio, bloquear } = parsed.data

  // Reprovar é `members:reject`; bloquear é `members:block`. Revalidado ANTES
  // de reprovar: quem não pode bloquear não deve ter a reprovação aplicada
  // pela metade, sem o bloqueio que pediu.
  if (bloquear) {
    await assertPermission(PERMISSIONS.MEMBERS_BLOCK)
  }

  const aprovadoPorNome = session.user.name ?? 'Admin'
  const aprovadoPorId = session.user.id
  const dadosReprovacao: DadosReprovacaoEspelho = {
    reprovadoEm: new Date(),
    reprovadoPorId: aprovadoPorId,
    reprovadoPorNome: aprovadoPorNome,
    reprovadoCategoria: categoria,
    reprovadoMotivo: motivoTrim,
    reprovadoPontos: pontos,
    reprovadoPermiteReenvio: permiteReenvio,
  }

  type ResultadoReprovacao = {
    origem: MembroDecisaoSelect
    espelhoId: string | null
    decididoEmTenantId: string
    tenantNotificarId: string
    tenantNotificarNome: string
  }

  try {
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

        const agora = dadosReprovacao.reprovadoEm
        const origemAtualizada = await tx.saasMembro.update({
          where: { id: origemFresh.id },
          data: {
            status: 'REPROVADO',
            aprovadoPorId,
            aprovadoPorNome,
            aprovadoEm: agora,
            ...dadosReprovacao,
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
          desligadoMotivo: motivoTrim,
          reprovacao: dadosReprovacao,
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
          tenantNotificarNome: formatNomeTorcida(unidadeTenant?.nome ?? tenant.nome),
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

      const agora = dadosReprovacao.reprovadoEm
      const atualizado = await tx.saasMembro.update({
        where: { id: membroId, tenantId: tenant.id },
        data: {
          status: 'REPROVADO',
          aprovadoPorId,
          aprovadoPorNome,
          aprovadoEm: agora,
          ...dadosReprovacao,
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
        desligadoMotivo: motivoTrim,
        reprovacao: dadosReprovacao,
      })

      return {
        origem: atualizado,
        espelhoId,
        decididoEmTenantId: tenant.id,
        tenantNotificarId: tenant.id,
        tenantNotificarNome: formatNomeTorcida(tenant.nome),
      }
    },
    TRANSACAO_DECISAO_MEMBRO_OPTS,
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
  await marcarSolicitacoesLidas(origem.userId, tenantIdsNotif)

  // Bloqueio vai para o tenant da UNIDADE de origem — é lá que a solicitação
  // nasceu e é lá que novas tentativas devem bater. Herda para os descendentes
  // dessa unidade, não para a Sede acima dela.
  if (bloquear) {
    const jaBloqueado: { id: string } | null = await db.membroBloqueio.findUnique({
      where: { tenantId_userId: { tenantId: origem.tenantId, userId: origem.userId } },
      select: { id: true },
    })
    if (!jaBloqueado) {
      const bloqueio: { id: string } = await db.membroBloqueio.create({
        data: {
          tenantId: origem.tenantId,
          userId: origem.userId,
          motivo: motivoTrim,
          bloqueadoPorId: aprovadoPorId,
          bloqueadoPorNome: aprovadoPorNome,
        },
        select: { id: true },
      })
      await db.auditLog.create({
        data: {
          tenantId: origem.tenantId,
          atorId: aprovadoPorId,
          acao: 'MEMBRO_BLOQUEADO',
          entidade: 'MembroBloqueio',
          entidadeId: bloqueio.id,
          detalhes: {
            userId: origem.userId,
            motivo: motivoTrim,
            origem: 'reprovacao',
            membroOrigemId: origem.id,
          },
        },
      })
    }
  }

  const detalhesAudit = {
    categoria,
    motivo: motivoTrim,
    pontos,
    permiteReenvio,
    bloqueado: bloquear,
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

  const pontosLabel = pontos.map((p) => labelPontoReprovacao(p)).join(', ')
  await notificarSafe({
    userId: origem.userId,
    tenantId: tenantNotificarId,
    tipo: 'MEMBRO_REPROVADO',
    titulo: `Sua solicitação em ${tenantNotificarNome} foi reprovada`,
    corpo: [
      labelCategoriaReprovacao(categoria),
      motivoTrim,
      pontosLabel ? `Revise: ${pontosLabel}.` : null,
      permiteReenvio
        ? 'Corrija os pontos apontados e reenvie seu cadastro.'
        : 'Fale com a diretoria antes de tentar de novo.',
    ]
      .filter(Boolean)
      .join(' · '),
    link: permiteReenvio ? '/portal/cadastro' : '/portal/comunidade',
  })
  await emitNotificacaoPingCnDoSolicitante(tenantNotificarId, origem.userId)

  invalidarCachesComunidadeFeed(origem.tenantId)
  revalidatePath('/portal', 'layout')
  revalidatePath('/admin/torcedores')
  revalidatePath('/admin/membros')
  revalidatePath('/admin/socios')
  revalidatePath('/admin')
  revalidatePath('/portal/departamentos', 'layout')
  revalidatePath('/portal/carteirinha')
  revalidatePath('/portal/cadastro')
  } catch (err) {
    const mapped = mapearErroDecisaoMembro(err)
    if (mapped) return mapped
    throw err
  }
}

export async function reverterMembro(membroId: string): Promise<{ error: string } | void> {
  // Reverte aprovação/reprovação para pendente — reaproveita MEMBERS_APPROVE
  // (não existe permissão dedicada para "reverter"; é a mesma decisão de
  // aprovação sendo desfeita). Espelho só é revertível pela origem.
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_APPROVE)

  try {
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
          ...REPROVACAO_LIMPA,
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
    }, TRANSACAO_DECISAO_MEMBRO_OPTS)

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

  invalidarCachesComunidadeFeed(resultado.origemTenantId)
  revalidatePath('/portal', 'layout')
  revalidatePath('/portal/comunidade')
  revalidatePath('/portal/carteirinha')
  revalidatePath('/portal/cadastro')
  revalidatePath('/admin/torcedores')
  revalidatePath('/admin/membros')
  revalidatePath('/admin/socios')
  revalidatePath('/portal/departamentos', 'layout')
  } catch (err) {
    const mapped = mapearErroDecisaoMembro(err)
    if (mapped) return mapped
    throw err
  }
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
  type LgeAntes = {
    id: string
    espelhado: boolean
    rg: string | null
    cpf: string | null
    filiacao: string | null
    escolaridade: string | null
    profissao: string | null
    dataNascimento: Date | null
    planoAssociacaoId: string | null
  }
  const existente: LgeAntes | null = await db.saasMembro.findFirst({
    where: { id: data.membroId, tenantId: tenant.id },
    select: {
      id: true,
      espelhado: true,
      rg: true,
      cpf: true,
      filiacao: true,
      escolaridade: true,
      profissao: true,
      dataNascimento: true,
      planoAssociacaoId: true,
    },
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
      detalhes: {
        alteracoes: diffCamposMembro(
          {
            rg: existente.rg,
            cpf: existente.cpf,
            filiacao: existente.filiacao,
            escolaridade: existente.escolaridade,
            profissao: existente.profissao,
            dataNascimento: existente.dataNascimento,
            planoAssociacaoId: existente.planoAssociacaoId,
          },
          { ...dadosLge, planoAssociacaoId: data.planoAssociacaoId ?? null },
        ),
      },
    },
  })

  revalidatePath('/admin/torcedores')
  revalidatePath('/admin/membros')
  revalidatePath('/admin/socios')
  revalidatePath(`/admin/torcedores/${existente.id}`)
  return { ok: true }
}

type CarteirinhaRevogada = { id: string; numeroSocio: number; nome: string }

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

  const membro: {
    id: string
    userId: string
    desligadoEm: Date | null
    espelhado: boolean
  } | null =
    await db.saasMembro.findFirst({
      where: { id: parsed.data.membroId, tenantId: tenant.id },
      select: { id: true, userId: true, desligadoEm: true, espelhado: true },
    })
  if (!membro) return { error: 'Membro não encontrado' }
  if (membro.espelhado) return { error: ERRO_ESPELHO_MUTACAO }
  if (membro.desligadoEm) return { error: 'Membro já desligado' }

  const { espelhoTenantId } = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.saasMembro.update({
      where: { id: membro.id },
      data: {
        desligadoEm: new Date(),
        desligadoMotivo: parsed.data.motivo,
        desligadoPorId: session.user.id,
      },
    })
    const limpeza = await limparMembershipDepartamentos(tenant.id, membro.userId, tx)
    const espelho: { tenantId: string; userId: string } | null =
      await tx.saasMembro.findUnique({
        where: { membroOrigemId: membro.id },
        select: { tenantId: true, userId: true },
      })
    const limpezaEspelho = espelho
      ? await limparMembershipDepartamentos(espelho.tenantId, espelho.userId, tx)
      : null
    await desligarEspelhoDaOrigem(tx, membro.id, parsed.data.motivo)

    // Desligamento revoga a carteirinha: o `numeroSocio` volta ao pool da torcida.
    const carteirinhas: CarteirinhaRevogada[] = []
    for (const alvo of [
      { tenantId: tenant.id, userId: membro.userId },
      ...(espelho ? [{ tenantId: espelho.tenantId, userId: espelho.userId }] : []),
    ]) {
      const socio: CarteirinhaRevogada | null = await tx.saasSocio.findFirst({
        where: { tenantId: alvo.tenantId, userId: alvo.userId },
        select: { id: true, numeroSocio: true, nome: true },
      })
      if (!socio) continue
      await tx.saasSocio.delete({ where: { id: socio.id } })
      await tx.auditLog.create({
        data: {
          tenantId: alvo.tenantId,
          atorId: session.user.id,
          acao: 'SOCIO_CARTEIRINHA_REVOGADA',
          entidade: 'SaasSocio',
          entidadeId: socio.id,
          detalhes: {
            nome: socio.nome,
            numeroSocio: socio.numeroSocio,
            motivo: 'desligamento',
          },
        },
      })
      carteirinhas.push(socio)
    }

    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'MEMBRO_DESLIGADO',
        entidade: 'SaasMembro',
        entidadeId: membro.id,
        detalhes: {
          motivo: parsed.data.motivo,
          ...limpeza,
          limpezaEspelho,
          carteirinhasRevogadas: carteirinhas.map((c) => c.numeroSocio),
        },
      },
    })
    return { espelhoTenantId: espelho?.tenantId ?? null }
  })

  invalidatePermissionsCache(membro.userId, tenant.id)
  if (espelhoTenantId) {
    invalidatePermissionsCache(membro.userId, espelhoTenantId)
    invalidarCachesComunidadeFeed(espelhoTenantId)
  }
  invalidarCachesComunidadeFeed(tenant.id)
  revalidatePath('/admin/torcedores')
  revalidatePath('/admin/membros')
  revalidatePath('/admin/socios')
  revalidatePath(`/admin/torcedores/${membro.id}`)
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

  type MembroSede = {
    id: string
    sedeId: string | null
    espelhado: boolean
    sede: { nome: string } | null
  }
  const membro: MembroSede | null = await db.saasMembro.findFirst({
    where: { id: membroId, tenantId: tenant.id },
    select: { id: true, sedeId: true, espelhado: true, sede: { select: { nome: true } } },
  })
  if (!membro) return { ok: false, error: 'Membro não encontrado.' }
  if (membro.espelhado) {
    return { ok: false, error: 'Registro espelhado — altere na unidade de origem.' }
  }

  let sedeAlvoId: string | null = sedeId?.trim() || null
  let sedeAlvoNome: string | null = null
  if (sedeAlvoId) {
    const sede: { id: string; nome: string } | null = await db.sede.findFirst({
      where: { id: sedeAlvoId, tenantId: tenant.id, ativa: true },
      select: { id: true, nome: true },
    })
    if (!sede) return { ok: false, error: 'Unidade não encontrada ou inativa.' }
    sedeAlvoId = sede.id
    sedeAlvoNome = sede.nome
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
        alteracoes: [
          {
            campo: 'Unidade',
            de: membro.sede?.nome ?? null,
            para: sedeAlvoNome,
          },
        ],
      },
    },
  })

  revalidatePath('/admin/torcedores')
  revalidatePath('/admin/membros')
  revalidatePath('/admin/socios')
  revalidatePath(`/admin/torcedores/${membro.id}`)
  revalidatePath('/admin/sedes')
  revalidatePath('/admin/torcida')
  return { ok: true }
}

/**
 * Bloqueia o usuário nesta torcida/unidade: novas solicitações de cadastro
 * passam a ser recusadas aqui e em todas as unidades DESCENDENTES
 * (`estaBloqueadoNoTenant` herda para baixo). O bloqueio é sobre o usuário, não
 * sobre a linha de `SaasMembro` — sobrevive ao cadastro ser apagado.
 *
 * Não desliga ninguém: desligamento é `members:dismiss`, permissão distinta, e
 * encadear as duas escondido apagaria o rastro de quem decidiu o quê.
 */
export async function bloquearMembro(
  userId: string,
  motivo: string,
): Promise<{ error: string } | void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_BLOCK)

  const parsed = BloquearMembroSchema.safeParse({ userId, motivo })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados do bloqueio inválidos.' }
  }

  const jaBloqueado: { id: string } | null = await db.membroBloqueio.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: parsed.data.userId } },
    select: { id: true },
  })
  if (jaBloqueado) return { error: 'Este usuário já está bloqueado nesta torcida.' }

  // Associado ativo precisa ser desligado antes — bloquear sem desligar deixaria
  // a pessoa dentro da torcida, com acesso, e apenas barrada de recadastrar.
  const vinculoAtivo: { id: string } | null = await db.saasMembro.findFirst({
    where: {
      tenantId: tenant.id,
      userId: parsed.data.userId,
      status: 'APROVADO',
      desligadoEm: null,
    },
    select: { id: true },
  })
  if (vinculoAtivo) {
    return { error: 'Desligue o associado antes de bloquear.' }
  }

  const bloqueio: { id: string } = await db.membroBloqueio.create({
    data: {
      tenantId: tenant.id,
      userId: parsed.data.userId,
      motivo: parsed.data.motivo,
      bloqueadoPorId: session.user.id,
      bloqueadoPorNome: session.user.name ?? 'Admin',
    },
    select: { id: true },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'MEMBRO_BLOQUEADO',
      entidade: 'MembroBloqueio',
      entidadeId: bloqueio.id,
      detalhes: { userId: parsed.data.userId, motivo: parsed.data.motivo },
    },
  })

  revalidatePath('/admin/torcedores')
  revalidatePath('/admin/membros')
  revalidatePath('/admin/socios')
}

/** Remove o bloqueio. Apaga a linha — o histórico fica no `AuditLog`. */
export async function desbloquearMembro(userId: string): Promise<{ error: string } | void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_BLOCK)

  const parsed = DesbloquearMembroSchema.safeParse({ userId })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Usuário inválido.' }
  }

  const bloqueio: { id: string; motivo: string } | null = await db.membroBloqueio.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: parsed.data.userId } },
    select: { id: true, motivo: true },
  })
  if (!bloqueio) return { error: 'Este usuário não está bloqueado nesta torcida.' }

  await db.membroBloqueio.delete({ where: { id: bloqueio.id } })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'MEMBRO_DESBLOQUEADO',
      entidade: 'MembroBloqueio',
      entidadeId: bloqueio.id,
      detalhes: { userId: parsed.data.userId, motivo: bloqueio.motivo },
    },
  })

  revalidatePath('/admin/torcedores')
  revalidatePath('/admin/membros')
  revalidatePath('/admin/socios')
}

/**
 * Apaga o cadastro DE VEZ (hard delete), junto com o espelho na Sede e a
 * carteirinha. Só depois de reprovado ou desligado — cadastro ativo não some
 * por acidente; para tirar alguém de dentro, o caminho é desligar.
 *
 * NÃO apaga o `AuditLog` nem o `MembroBloqueio`: o rastro da decisão precisa
 * sobreviver ao registro, e apagar o cadastro não pode virar a porta dos fundos
 * para quem está bloqueado voltar a se inscrever.
 */
export async function apagarMembroDefinitivo(
  membroId: string,
): Promise<{ error: string } | void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_PURGE)

  const membro: MembroParaPurge | null = await db.saasMembro.findFirst({
    where: { id: membroId, tenantId: tenant.id },
    select: membroPurgeSelect,
  })
  if (!membro) return { error: 'Membro não encontrado.' }

  const impedimento = motivoImpedeApagar(membro)
  if (impedimento) return { error: impedimento }

  await executarPurgeMembro(membro, session.user.id)

  invalidarCachesComunidadeFeed(tenant.id)
  invalidatePermissionsCache(membro.userId, tenant.id)
  revalidatePath('/admin/torcedores')
  revalidatePath('/admin/membros')
  revalidatePath('/admin/socios')
  revalidatePath('/admin')
}
