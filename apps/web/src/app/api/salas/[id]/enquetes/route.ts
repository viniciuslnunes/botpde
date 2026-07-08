import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@torcida/db'
import { assertSalaAnfitriao, assertSalaMembro } from '@/lib/salas-api'

const criarEnqueteSchema = z.object({
  pergunta: z.string().trim().min(3).max(200),
  opcoes: z.array(z.string().trim().min(1).max(120)).min(2).max(6),
})

function serializeEnquete(
  enquete: {
    id: string
    pergunta: string
    encerradaEm: Date | null
    criadoEm: Date
    opcoes: { id: string; texto: string; ordem: number; _count?: { votos: number } }[]
  },
  meuVotoOpcaoId: string | null,
) {
  const totalVotos = enquete.opcoes.reduce((acc, o) => acc + (o._count?.votos ?? 0), 0)
  return {
    id: enquete.id,
    pergunta: enquete.pergunta,
    encerradaEm: enquete.encerradaEm?.toISOString() ?? null,
    criadoEm: enquete.criadoEm.toISOString(),
    meuVotoOpcaoId,
    totalVotos,
    opcoes: enquete.opcoes.map((o) => ({
      id: o.id,
      texto: o.texto,
      votos: o._count?.votos ?? 0,
      percentual: totalVotos > 0 ? Math.round(((o._count?.votos ?? 0) / totalVotos) * 100) : 0,
    })),
  }
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: salaId } = await context.params
    const { session } = await assertSalaMembro(salaId)

    const enquetes = await db.enqueteReuniao.findMany({
      where: { salaId, encerradaEm: null },
      include: {
        opcoes: {
          orderBy: { ordem: 'asc' },
          include: { _count: { select: { votos: true } } },
        },
        votos: { where: { userId: session.user.id }, select: { opcaoId: true } },
      },
      orderBy: { criadoEm: 'desc' },
      take: 5,
    })

    return NextResponse.json({
      enquetes: enquetes.map((e: (typeof enquetes)[number]) =>
        serializeEnquete(e, e.votos[0]?.opcaoId ?? null),
      ),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao carregar enquetes.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: salaId } = await context.params
    const { session, tenant, sala } = await assertSalaAnfitriao(salaId)

    const body: unknown = await request.json()
    const parsed = criarEnqueteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Enquete inválida' },
        { status: 400 },
      )
    }

    const enquete = await db.enqueteReuniao.create({
      data: {
        salaId: sala.id,
        criadorId: session.user.id,
        pergunta: parsed.data.pergunta,
        opcoes: {
          create: parsed.data.opcoes.map((texto, ordem) => ({ texto, ordem })),
        },
      },
      include: {
        opcoes: {
          orderBy: { ordem: 'asc' },
          include: { _count: { select: { votos: true } } },
        },
      },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'SALA_ENQUETE_CRIADA',
        entidade: 'EnqueteReuniao',
        entidadeId: enquete.id,
        detalhes: { pergunta: enquete.pergunta },
      },
    })

    return NextResponse.json({ enquete: serializeEnquete(enquete, null) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao criar enquete.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
