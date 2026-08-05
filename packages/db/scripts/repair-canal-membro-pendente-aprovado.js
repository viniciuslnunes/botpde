/**
 * Normaliza roster de canais reais:
 * - promove PENDENTE elegível em canal oficial (comportamento legado);
 * - rejeita PENDENTE sem `SaasMembro` local;
 * - encerra ATIVO sem `SaasMembro` local aprovado/ativo.
 *
 * Cenário: sócio pediu entrada no canal fechado (status PENDENTE) e depois
 * foi aprovado / vinculação automática rodou sem promover o status
 * (`vincularMembroCanaisAposAprovacao` só limpava `saiuEm`). Resultado:
 * inbox mostra o canal, composer liberado, POST /mensagens 400
 * "Aprove ou recuse a solicitação…".
 *
 *   node scripts/repair-canal-membro-pendente-aprovado.js
 *   node scripts/repair-canal-membro-pendente-aprovado.js --dry-run
 */
import { db } from '../src/index.js'

const dryRun = process.argv.includes('--dry-run')

const candidatos = await db.$queryRaw`
  SELECT mc.id
  FROM saas_membros_conversa mc
  JOIN saas_conversas c ON c.id = mc.conversa_id
  JOIN saas_tenants t ON t.id = c.tenant_id
  LEFT JOIN saas_membros m
    ON m.user_id = mc.user_id AND m.tenant_id = c.tenant_id
  LEFT JOIN saas_socios s
    ON s.user_id = mc.user_id AND s.tenant_id = c.tenant_id
  WHERE mc.saiu_em IS NULL
    AND mc.status IN ('PENDENTE', 'ATIVO')
    AND c.tipo = 'CANAL'
    AND c.comunidade = false
    AND t.sintetico = false
    AND (
      (mc.status = 'PENDENTE' AND (c.canal_oficial = true OR m.id IS NULL))
      OR
      (mc.status = 'ATIVO' AND (
        m.id IS NULL OR m.desligado_em IS NOT NULL
        OR (m.tipo = 'SOCIO' AND s.validade < NOW())
        OR (
          m.status <> 'APROVADO'
          -- §7 22: socio PENDENTE que entrou por convite acompanha o canal da
          -- propria unidade enquanto espera, de leitura. Expulsa-lo aqui
          -- desfazia o que solicitarVinculo acabara de fazer, e o roster
          -- passava a oscilar conforme o que rodasse por ultimo. Continua
          -- sendo encerrado no canal da SEDE, que e a comunidade da torcida e
          -- so se abre depois da aprovacao.
          AND EXISTS (
            SELECT 1 FROM saas_sedes sd
            WHERE sd.canal_conversa_id = c.id AND sd.tipo = 'SEDE'
          )
        )
      ))
    )`

const registros = await db.membroConversa.findMany({
  where: {
    id: { in: candidatos.map((item) => item.id) },
  },
  select: {
    id: true,
    userId: true,
    conversaId: true,
    status: true,
    conversa: {
      select: {
        tenantId: true,
        nome: true,
        canalOficial: true,
        sedeCanal: { select: { id: true, tipo: true } },
      },
    },
  },
})

let promovidos = 0
let rejeitados = 0
let encerrados = 0
let mantidos = 0

for (const row of registros) {
  const membro = await db.saasMembro.findUnique({
    where: { tenantId_userId: { userId: row.userId, tenantId: row.conversa.tenantId } },
    select: { sedeId: true, status: true, tipo: true, desligadoEm: true },
  })
  const socio = membro?.tipo === 'SOCIO'
    ? await db.saasSocio.findUnique({
        where: {
          tenantId_userId: { userId: row.userId, tenantId: row.conversa.tenantId },
        },
        select: { validade: true },
      })
    : null
  const ativo =
    membro?.status === 'APROVADO' &&
    membro.desligadoEm === null &&
    (!socio || socio.validade >= new Date())

  if (row.status === 'PENDENTE' && !membro) {
    if (dryRun) {
      console.log(`[dry-run] rejeitar PENDENTE órfão ${row.userId} em "${row.conversa.nome ?? row.conversaId}"`)
    } else {
      await db.$transaction([
        db.membroConversa.update({
          where: { id: row.id },
          data: { status: 'REJEITADO' },
        }),
        db.auditLog.create({
          data: {
            tenantId: row.conversa.tenantId,
            atorId: null,
            acao: 'REPAIR_CANAL_MEMBRO_PENDENTE_INVALIDO',
            entidade: 'MembroConversa',
            entidadeId: row.id,
            detalhes: { conversaId: row.conversaId, userId: row.userId, de: 'PENDENTE', para: 'REJEITADO' },
          },
        }),
      ])
    }
    rejeitados++
    continue
  }

  if (row.status === 'ATIVO' && !ativo) {
    const motivo = !membro
      ? 'SEM_VINCULO_LOCAL'
      : membro.desligadoEm
        ? 'MEMBRO_DESLIGADO'
        : membro.status !== 'APROVADO'
          ? 'MEMBRO_NAO_APROVADO'
          : 'CARTEIRINHA_VENCIDA'
    if (dryRun) {
      console.log(`[dry-run] encerrar ATIVO inválido ${row.userId} em "${row.conversa.nome ?? row.conversaId}" (${motivo})`)
    } else {
      const agora = new Date()
      await db.$transaction([
        db.membroConversa.update({
          where: { id: row.id },
          data: { status: 'REJEITADO', saiuEm: agora },
        }),
        db.auditLog.create({
          data: {
            tenantId: row.conversa.tenantId,
            atorId: null,
            acao: 'REPAIR_CANAL_MEMBRO_ATIVO_INVALIDO',
            entidade: 'MembroConversa',
            entidadeId: row.id,
            detalhes: {
              conversaId: row.conversaId,
              userId: row.userId,
              de: 'ATIVO',
              para: 'REJEITADO',
              motivo,
            },
          },
        }),
      ])
    }
    encerrados++
    continue
  }

  if (row.status !== 'PENDENTE' || !ativo || !row.conversa.canalOficial) {
    mantidos++
    continue
  }

  // Canal de unidade Caso A: só promove se o sócio é daquela sede (ou sem sede
  // ainda — herda o mural principal; sedes SEDE sempre liberam).
  const sedeCanal = row.conversa.sedeCanal
  const unidadeCasoA =
    sedeCanal && (sedeCanal.tipo === 'SUBSEDE' || sedeCanal.tipo === 'PONTO_ENCONTRO')
      ? sedeCanal
      : null
  if (unidadeCasoA && membro.sedeId && membro.sedeId !== unidadeCasoA.id) {
    mantidos++
    continue
  }

  if (dryRun) {
    console.log(
      `[dry-run] promover ${row.userId} em "${row.conversa.nome ?? row.conversaId}"`,
    )
  } else {
    await db.$transaction([
      db.membroConversa.update({
        where: { id: row.id },
        data: { status: 'ATIVO' },
      }),
      db.auditLog.create({
        data: {
          tenantId: row.conversa.tenantId,
          atorId: null,
          acao: 'REPAIR_CANAL_MEMBRO_PENDENTE_APROVADO',
          entidade: 'MembroConversa',
          entidadeId: row.id,
          detalhes: { conversaId: row.conversaId, userId: row.userId, de: 'PENDENTE', para: 'ATIVO' },
        },
      }),
    ])
    console.log(`Promovido ${row.userId} em "${row.conversa.nome ?? row.conversaId}"`)
  }
  promovidos++
}

console.log(
  `\n${dryRun ? '[dry-run] ' : ''}${promovidos} promovido(s); ${rejeitados} PENDENTE(s) inválido(s) rejeitado(s); ${encerrados} ATIVO(s) inválido(s) encerrado(s); ${mantidos} mantido(s). ${registros.length} registro(s) analisado(s).`,
)
process.exit(0)
