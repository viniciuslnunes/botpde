import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O registro de alvos toca 15 delegates do Prisma. O mock devolve um objeto
 * com `findMany`/`update` por modelo para checar **quantas** queries saem —
 * a regra do registro é uma por tipo de alvo, nunca uma por linha da fila.
 */
const modelos = [
  'post',
  'comentario',
  'mensagemDireta',
  'forumTopico',
  'forumResposta',
  'pracaComentario',
  'momentoStory',
  'memoriaFato',
  'brechoAnuncio',
  'brechoLoja',
  'announcement',
  'evento',
  'perfilTorcedor',
  'conversa',
  'salaReuniao',
] as const

const dbMock = vi.hoisted(() => {
  const nomes = [
    'post',
    'comentario',
    'mensagemDireta',
    'forumTopico',
    'forumResposta',
    'pracaComentario',
    'momentoStory',
    'memoriaFato',
    'brechoAnuncio',
    'brechoLoja',
    'announcement',
    'evento',
    'perfilTorcedor',
    'conversa',
    'salaReuniao',
  ]
  const db: Record<string, { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }> =
    {}
  for (const nome of nomes) {
    db[nome] = {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn((args: unknown) => ({ __update: nome, args })),
    }
  }
  return db
})

vi.mock('@torcida/db', () => ({ db: dbMock }))

const {
  ALVOS_MODERACAO,
  alvoSoEscala,
  carregarAlvosModeracao,
  chaveAlvoModeracao,
  operacaoOcultarAlvo,
  ROTULO_ALVO_MODERACAO,
} = await import('../moderacao-alvos')

/** As 16 superfícies da spec (`docs/data/modulo-moderacao.md` §3). */
const ALVOS_ESPERADOS = [
  'POST',
  'COMENTARIO',
  'MENSAGEM',
  'FORUM_TOPICO',
  'FORUM_RESPOSTA',
  'PRACA_COMENTARIO',
  'STORY',
  'MEMORIA_FATO',
  'BRECHO_ANUNCIO',
  'BRECHO_LOJA',
  'COMUNICADO',
  'EVENTO',
  'PERFIL',
  'GRUPO',
  'CANAL',
  'SALA',
]

beforeEach(() => {
  for (const nome of modelos) {
    dbMock[nome].findMany.mockClear()
    dbMock[nome].findMany.mockResolvedValue([])
    dbMock[nome].update.mockClear()
  }
})

describe('registro de alvos de moderação', () => {
  it('cobre as 16 superfícies, sem sobra nem falta', () => {
    expect(Object.keys(ALVOS_MODERACAO).sort()).toEqual([...ALVOS_ESPERADOS].sort())
  })

  it('dá um rótulo legível a todo alvo', () => {
    for (const alvo of ALVOS_ESPERADOS) {
      expect(ROTULO_ALVO_MODERACAO[alvo as keyof typeof ROTULO_ALVO_MODERACAO]).toBeTruthy()
    }
  })

  it('marca como só escalonamento exatamente as superfícies sem ocultação', () => {
    const soEscala = ALVOS_ESPERADOS.filter((a) =>
      alvoSoEscala(a as keyof typeof ALVOS_MODERACAO),
    )
    expect(soEscala.sort()).toEqual(
      ['BRECHO_LOJA', 'COMUNICADO', 'EVENTO', 'PERFIL', 'GRUPO', 'CANAL'].sort(),
    )
  })
})

describe('operacaoOcultarAlvo', () => {
  it('esconde o tópico do fórum por status e a resposta por oculto', () => {
    operacaoOcultarAlvo('FORUM_TOPICO', 't1')
    expect(dbMock.forumTopico.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: 'OCULTO' },
    })

    operacaoOcultarAlvo('FORUM_RESPOSTA', 'r1')
    expect(dbMock.forumResposta.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { oculto: true },
    })
  })

  it('usa os campos novos de ocultação em comentário e story', () => {
    operacaoOcultarAlvo('COMENTARIO', 'c1')
    expect(dbMock.comentario.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { oculto: true },
    })

    operacaoOcultarAlvo('STORY', 's1')
    expect(dbMock.momentoStory.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { oculto: true },
    })
  })

  it('devolve null — e não muta nada — onde a resposta é escalonamento', () => {
    for (const alvo of ['COMUNICADO', 'EVENTO', 'PERFIL', 'GRUPO', 'CANAL', 'BRECHO_LOJA']) {
      expect(operacaoOcultarAlvo(alvo as keyof typeof ALVOS_MODERACAO, 'x')).toBeNull()
    }
    expect(dbMock.announcement.update).not.toHaveBeenCalled()
    expect(dbMock.evento.update).not.toHaveBeenCalled()
    expect(dbMock.perfilTorcedor.update).not.toHaveBeenCalled()
    expect(dbMock.conversa.update).not.toHaveBeenCalled()
    expect(dbMock.brechoLoja.update).not.toHaveBeenCalled()
  })
})

describe('carregarAlvosModeracao', () => {
  it('não toca no banco com fila vazia', async () => {
    const mapa = await carregarAlvosModeracao([])
    expect(mapa.size).toBe(0)
    for (const nome of modelos) expect(dbMock[nome].findMany).not.toHaveBeenCalled()
  })

  it('faz uma query por tipo presente, com os ids em lote', async () => {
    dbMock.forumResposta.findMany.mockResolvedValue([
      {
        id: 'r1',
        autorId: 'u1',
        conteudo: 'texto da resposta',
        oculto: false,
        topicoId: 't9',
        topico: { tenantId: 'tenant-1' },
        autor: { nome: 'Fulano' },
      },
    ])
    dbMock.pracaComentario.findMany.mockResolvedValue([
      {
        id: 'c1',
        autorId: 'u2',
        conteudo: 'texto do comentário',
        oculto: true,
        autor: { nome: 'Beltrano' },
      },
    ])

    const mapa = await carregarAlvosModeracao([
      { alvoTipo: 'FORUM_RESPOSTA', alvoId: 'r1' },
      { alvoTipo: 'FORUM_RESPOSTA', alvoId: 'r2' },
      // Id repetido não vira query nova nem id duplicado no `in`.
      { alvoTipo: 'FORUM_RESPOSTA', alvoId: 'r1' },
      { alvoTipo: 'PRACA_COMENTARIO', alvoId: 'c1' },
    ])

    expect(dbMock.forumResposta.findMany).toHaveBeenCalledTimes(1)
    expect(dbMock.pracaComentario.findMany).toHaveBeenCalledTimes(1)
    expect(dbMock.forumTopico.findMany).not.toHaveBeenCalled()

    const argsResposta = dbMock.forumResposta.findMany.mock.calls[0][0] as {
      where: { id: { in: string[] } }
    }
    expect(argsResposta.where.id.in).toEqual(['r1', 'r2'])

    const resposta = mapa.get(chaveAlvoModeracao('FORUM_RESPOSTA', 'r1'))
    expect(resposta).toMatchObject({
      autorId: 'u1',
      autorNome: 'Fulano',
      tenantId: 'tenant-1',
      trecho: 'texto da resposta',
      ocultado: false,
      link: '/portal/comunidade/forum/t9',
    })

    // Comentário da praça é a superfície global: não tem tenant nem permalink.
    const comentario = mapa.get(chaveAlvoModeracao('PRACA_COMENTARIO', 'c1'))
    expect(comentario).toMatchObject({ tenantId: null, ocultado: true, link: null })
  })

  it('trunca o trecho — a fila mostra evidência, não o conteúdo inteiro', async () => {
    dbMock.forumTopico.findMany.mockResolvedValue([
      {
        id: 't1',
        autorId: 'u1',
        tenantId: null,
        titulo: 'x'.repeat(400),
        corpo: 'corpo',
        status: 'VISIVEL',
        autor: { nome: null },
      },
    ])
    const mapa = await carregarAlvosModeracao([{ alvoTipo: 'FORUM_TOPICO', alvoId: 't1' }])
    const trecho = mapa.get(chaveAlvoModeracao('FORUM_TOPICO', 't1'))?.trecho ?? ''
    expect(trecho.length).toBeLessThan(400)
    expect(trecho.endsWith('…')).toBe(true)
  })
})
