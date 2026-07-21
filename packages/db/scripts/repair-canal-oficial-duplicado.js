/**
 * Repara canais oficiais duplicados de unidades promovidas a portal (Caso B).
 *
 * Ao promover uma Subsede/PDE, o Sede.tenantId passa a apontar pro tenant
 * novo, mas o canal oficial (Conversa) pode continuar "emprestado" no tenant
 * da Sede-mãe por decisão de design (docs/data/proposta-governanca-hierarquica.md
 * — "deixar como está"). `getOrCreateCanalOficial` buscava o canal só por
 * Conversa.tenantId (sem checar Sede.canalConversaId) e, ao ser chamada do
 * lado do tenant novo (toda visita a /portal/comunidade/canais), criava um
 * segundo canal oficial órfão — bug corrigido em 2026-07-20.
 *
 * ATENÇÃO — histórico do incidente de 2026-07-21: a primeira versão deste
 * script buscava a duplicata filtrando só por `tenantId`, sem exigir que o
 * canal canônico morasse em OUTRO tenant. Ao processar a Sede da unidade-mãe
 * (cujo canalConversaId aponta pro canal dela mesma, tenantId = ela própria),
 * a busca encontrou os canais canônicos "emprestados" de unidades filhas
 * (Conversa.tenantId = tenant da mãe, por design) e os tratou como
 * duplicatas, apagando 3 canais legítimos. Corrigido: só considera duplicata
 * quando o canal canônico mora em tenant DIFERENTE do da própria unidade —
 * nunca varre o tenant onde o canônico vive à procura de "outros" canais.
 *
 *   node scripts/repair-canal-oficial-duplicado.js
 */
import { db } from '../src/index.js'

const sedes = await db.sede.findMany({
  where: { tenantId: { not: null }, canalConversaId: { not: null } },
  select: { id: true, nome: true, tenantId: true, canalConversaId: true },
})

let removidos = 0

for (const s of sedes) {
  const canonico = await db.conversa.findUnique({
    where: { id: s.canalConversaId },
    select: { id: true, tenantId: true },
  })
  if (!canonico) continue

  // Canal já mora no próprio tenant da unidade — não há "empréstimo" da mãe,
  // logo não há onde procurar duplicata sem risco de pegar canal de outra
  // unidade hospedado ali.
  if (canonico.tenantId === s.tenantId) continue

  const duplicatas = await db.conversa.findMany({
    where: {
      tenantId: s.tenantId,
      tipo: 'CANAL',
      canalOficial: true,
      id: { not: canonico.id },
    },
    select: { id: true, nome: true },
  })

  for (const dup of duplicatas) {
    const membros = await db.membroConversa.findMany({
      where: { conversaId: dup.id },
      select: { userId: true, papel: true, saiuEm: true },
    })
    for (const m of membros) {
      await db.membroConversa.upsert({
        where: { conversaId_userId: { conversaId: canonico.id, userId: m.userId } },
        create: { conversaId: canonico.id, userId: m.userId, papel: m.papel, saiuEm: m.saiuEm },
        update: { saiuEm: m.saiuEm },
      })
    }

    await db.post.updateMany({ where: { conversaId: dup.id }, data: { conversaId: canonico.id } })
    await db.mensagemDireta.updateMany({
      where: { conversaId: dup.id },
      data: { conversaId: canonico.id },
    })

    await db.conversa.delete({ where: { id: dup.id } })

    console.log(
      `Removido canal duplicado "${dup.nome}" (${dup.id}) da unidade "${s.nome}" — mesclado no canônico ${canonico.id}`,
    )
    removidos++
  }
}

console.log(`\n${removidos} canal(is) duplicado(s) removido(s) de ${sedes.length} unidade(s) verificada(s).`)
process.exit(0)
