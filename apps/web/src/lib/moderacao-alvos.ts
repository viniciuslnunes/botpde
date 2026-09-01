import { db } from '@torcida/db'
import type { AlvoModeracao, PrismaPromise } from '@torcida/db'
import { linkPostComunidade } from './comunidade-social'

export type { AlvoModeracao }

/**
 * Alvo de denúncia normalizado para a fila — a mesma forma para as 16
 * superfícies, para que a fila não precise saber de qual tabela veio.
 */
export type AlvoModeracaoCarregado = {
  id: string
  /** Quem publicou. Null quando a superfície não registra autor. */
  autorId: string | null
  autorNome: string | null
  /** Tenant dono do conteúdo. Null em superfície global (praça de escopo CLUBE). */
  tenantId: string | null
  /** Evidência curta para decidir — nunca o conteúdo inteiro. */
  trecho: string
  /** Já oculto por outra decisão: evita "resolver" duas vezes o mesmo conteúdo. */
  ocultado: boolean
  /** Permalink para ver em contexto; nem toda superfície tem um. */
  link: string | null
}

export type AlvoSpec = {
  /** Como o moderador lê o tipo de alvo na fila. */
  label: string
  /** Busca em lote — uma query por tipo de alvo, nunca uma por linha da fila. */
  carregar: (ids: string[]) => Promise<AlvoModeracaoCarregado[]>
  /**
   * Operação que esconde o alvo, para entrar no `$transaction` da decisão.
   * `null` = a superfície não tem ocultação; a resposta certa é registrar a
   * decisão e escalar, não fingir que agiu.
   */
  acaoOcultar: ((id: string) => PrismaPromise<unknown>) | null
}

const TRECHO_MAX = 280

/** Primeiro texto não vazio, truncado — a fila mostra evidência, não o conteúdo. */
function trechoDe(...partes: (string | null | undefined)[]): string {
  const texto = partes.map((p) => p?.trim()).find((p) => Boolean(p)) ?? ''
  if (!texto) return '(sem texto)'
  return texto.length > TRECHO_MAX ? texto.slice(0, TRECHO_MAX) + '…' : texto
}

export function chaveAlvoModeracao(alvoTipo: AlvoModeracao, alvoId: string): string {
  return alvoTipo + ':' + alvoId
}

type PostRow = {
  id: string
  autorId: string
  tenantId: string
  titulo: string | null
  conteudo: string
  oculto: boolean
  autor: { nome: string | null }
}

type ComentarioRow = {
  id: string
  autorId: string
  conteudo: string
  oculto: boolean
  postId: string
  post: { tenantId: string }
  autor: { nome: string | null }
}

type MensagemRow = {
  id: string
  autorId: string
  conteudo: string
  removidaEm: Date | null
  conversa: { tenantId: string }
  autor: { nome: string | null }
}

type TopicoRow = {
  id: string
  autorId: string
  tenantId: string | null
  titulo: string
  corpo: string
  status: string
  autor: { nome: string | null }
}

type RespostaRow = {
  id: string
  autorId: string
  conteudo: string
  oculto: boolean
  topicoId: string
  topico: { tenantId: string | null }
  autor: { nome: string | null }
}

type PracaComentarioRow = {
  id: string
  autorId: string
  conteudo: string
  oculto: boolean
  autor: { nome: string | null }
}

type StoryRow = {
  id: string
  userId: string
  tenantId: string
  conteudo: string | null
  oculto: boolean
  user: { nome: string | null }
}

type MemoriaFatoRow = {
  id: string
  autorId: string
  tenantId: string
  conteudo: string
  status: string
  autor: { nome: string | null }
}

type BrechoAnuncioRow = {
  id: string
  vendedorId: string
  tenantId: string
  titulo: string
  descricao: string
  status: string
  vendedor: { nome: string | null }
}

type BrechoLojaRow = {
  id: string
  userId: string
  tenantId: string
  nome: string
  bio: string | null
  ativa: boolean
  congeladaEm: Date | null
  user: { nome: string | null }
}

type ComunicadoRow = {
  id: string
  autorId: string
  tenantId: string
  titulo: string
  corpo: string
  autor: { nome: string | null }
}

type EventoRow = {
  id: string
  criadoPorId: string | null
  tenantId: string
  titulo: string
  descricao: string | null
}

type PerfilRow = {
  id: string
  userId: string
  bio: string | null
  regiao: string | null
  user: { nome: string | null }
}

type ConversaRow = {
  id: string
  criadoPorId: string
  tenantId: string
  nome: string | null
  descricao: string | null
  criadoPor: { nome: string | null }
}

type SalaRow = {
  id: string
  hostId: string
  tenantId: string
  titulo: string
  encerradaEm: Date | null
  host: { nome: string | null }
}

/** Grupo e canal são a mesma tabela (`Conversa`), separados por `tipo`. */
async function carregarConversas(
  ids: string[],
  tipo: 'GRUPO' | 'CANAL',
): Promise<AlvoModeracaoCarregado[]> {
  const rows: ConversaRow[] = await db.conversa.findMany({
    where: { id: { in: ids }, tipo },
    select: {
      id: true,
      criadoPorId: true,
      tenantId: true,
      nome: true,
      descricao: true,
      criadoPor: { select: { nome: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    autorId: r.criadoPorId,
    autorNome: r.criadoPor.nome,
    tenantId: r.tenantId,
    trecho: trechoDe(r.nome, r.descricao),
    ocultado: false,
    link: null,
  }))
}

/**
 * Registro exaustivo das superfícies denunciáveis. É `Record<AlvoModeracao, …>`
 * de propósito: valor novo no enum sem entrada aqui vira **erro de compilação**
 * — a trava que impede superfície nova nascer sem caminho de moderação.
 */
export const ALVOS_MODERACAO: Record<AlvoModeracao, AlvoSpec> = {
  POST: {
    label: 'Post da comunidade',
    carregar: async (ids) => {
      const rows: PostRow[] = await db.post.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          autorId: true,
          tenantId: true,
          titulo: true,
          conteudo: true,
          oculto: true,
          autor: { select: { nome: true } },
        },
      })
      return rows.map((r) => ({
        id: r.id,
        autorId: r.autorId,
        autorNome: r.autor.nome,
        tenantId: r.tenantId,
        trecho: trechoDe(r.titulo, r.conteudo),
        ocultado: r.oculto,
        link: linkPostComunidade(r.id),
      }))
    },
    acaoOcultar: (id) => db.post.update({ where: { id }, data: { oculto: true } }),
  },

  COMENTARIO: {
    label: 'Comentário de post',
    carregar: async (ids) => {
      const rows: ComentarioRow[] = await db.comentario.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          autorId: true,
          conteudo: true,
          oculto: true,
          postId: true,
          post: { select: { tenantId: true } },
          autor: { select: { nome: true } },
        },
      })
      return rows.map((r) => ({
        id: r.id,
        autorId: r.autorId,
        autorNome: r.autor.nome,
        tenantId: r.post.tenantId,
        trecho: trechoDe(r.conteudo),
        ocultado: r.oculto,
        link: linkPostComunidade(r.postId),
      }))
    },
    acaoOcultar: (id) => db.comentario.update({ where: { id }, data: { oculto: true } }),
  },

  MENSAGEM: {
    label: 'Mensagem direta',
    carregar: async (ids) => {
      const rows: MensagemRow[] = await db.mensagemDireta.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          autorId: true,
          conteudo: true,
          removidaEm: true,
          conversa: { select: { tenantId: true } },
          autor: { select: { nome: true } },
        },
      })
      return rows.map((r) => ({
        id: r.id,
        autorId: r.autorId,
        autorNome: r.autor.nome,
        tenantId: r.conversa.tenantId,
        trecho: r.removidaEm ? 'Mensagem removida' : trechoDe(r.conteudo),
        ocultado: Boolean(r.removidaEm),
        link: null,
      }))
    },
    acaoOcultar: (id) =>
      db.mensagemDireta.update({ where: { id }, data: { removidaEm: new Date() } }),
  },

  FORUM_TOPICO: {
    label: 'Tópico do fórum',
    carregar: async (ids) => {
      const rows: TopicoRow[] = await db.forumTopico.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          autorId: true,
          tenantId: true,
          titulo: true,
          corpo: true,
          status: true,
          autor: { select: { nome: true } },
        },
      })
      return rows.map((r) => ({
        id: r.id,
        autorId: r.autorId,
        autorNome: r.autor.nome,
        tenantId: r.tenantId,
        trecho: trechoDe(r.titulo, r.corpo),
        ocultado: r.status === 'OCULTO' || r.status === 'REMOVIDO',
        link: '/portal/comunidade/forum/' + r.id,
      }))
    },
    acaoOcultar: (id) => db.forumTopico.update({ where: { id }, data: { status: 'OCULTO' } }),
  },

  FORUM_RESPOSTA: {
    label: 'Resposta do fórum',
    carregar: async (ids) => {
      const rows: RespostaRow[] = await db.forumResposta.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          autorId: true,
          conteudo: true,
          oculto: true,
          topicoId: true,
          topico: { select: { tenantId: true } },
          autor: { select: { nome: true } },
        },
      })
      return rows.map((r) => ({
        id: r.id,
        autorId: r.autorId,
        autorNome: r.autor.nome,
        tenantId: r.topico.tenantId,
        trecho: trechoDe(r.conteudo),
        ocultado: r.oculto,
        link: '/portal/comunidade/forum/' + r.topicoId,
      }))
    },
    acaoOcultar: (id) => db.forumResposta.update({ where: { id }, data: { oculto: true } }),
  },

  PRACA_COMENTARIO: {
    label: 'Comentário da praça',
    carregar: async (ids) => {
      // Comentário da praça não tem tenant nem permalink próprio.
      const rows: PracaComentarioRow[] = await db.pracaComentario.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          autorId: true,
          conteudo: true,
          oculto: true,
          autor: { select: { nome: true } },
        },
      })
      return rows.map((r) => ({
        id: r.id,
        autorId: r.autorId,
        autorNome: r.autor.nome,
        tenantId: null,
        trecho: trechoDe(r.conteudo),
        ocultado: r.oculto,
        link: null,
      }))
    },
    acaoOcultar: (id) => db.pracaComentario.update({ where: { id }, data: { oculto: true } }),
  },

  STORY: {
    label: 'Story',
    carregar: async (ids) => {
      const rows: StoryRow[] = await db.momentoStory.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          userId: true,
          tenantId: true,
          conteudo: true,
          oculto: true,
          user: { select: { nome: true } },
        },
      })
      return rows.map((r) => ({
        id: r.id,
        autorId: r.userId,
        autorNome: r.user.nome,
        tenantId: r.tenantId,
        trecho: trechoDe(r.conteudo, 'Story sem legenda (mídia)'),
        ocultado: r.oculto,
        link: null,
      }))
    },
    acaoOcultar: (id) => db.momentoStory.update({ where: { id }, data: { oculto: true } }),
  },

  MEMORIA_FATO: {
    label: 'Fato da linha do tempo',
    carregar: async (ids) => {
      const rows: MemoriaFatoRow[] = await db.memoriaFato.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          autorId: true,
          tenantId: true,
          conteudo: true,
          status: true,
          autor: { select: { nome: true } },
        },
      })
      return rows.map((r) => ({
        id: r.id,
        autorId: r.autorId,
        autorNome: r.autor.nome,
        tenantId: r.tenantId,
        trecho: trechoDe(r.conteudo),
        ocultado: r.status === 'REJEITADA',
        link: null,
      }))
    },
    acaoOcultar: (id) => db.memoriaFato.update({ where: { id }, data: { status: 'REJEITADA' } }),
  },

  BRECHO_ANUNCIO: {
    label: 'Anúncio do brechó',
    carregar: async (ids) => {
      const rows: BrechoAnuncioRow[] = await db.brechoAnuncio.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          vendedorId: true,
          tenantId: true,
          titulo: true,
          descricao: true,
          status: true,
          vendedor: { select: { nome: true } },
        },
      })
      return rows.map((r) => ({
        id: r.id,
        autorId: r.vendedorId,
        autorNome: r.vendedor.nome,
        tenantId: r.tenantId,
        trecho: trechoDe(r.titulo, r.descricao),
        ocultado: r.status === 'OCULTO' || r.status === 'REMOVIDO',
        link: null,
      }))
    },
    acaoOcultar: (id) => db.brechoAnuncio.update({ where: { id }, data: { status: 'OCULTO' } }),
  },

  BRECHO_LOJA: {
    label: 'Vitrine do brechó',
    carregar: async (ids) => {
      const rows: BrechoLojaRow[] = await db.brechoLoja.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          userId: true,
          tenantId: true,
          nome: true,
          bio: true,
          ativa: true,
          congeladaEm: true,
          user: { select: { nome: true } },
        },
      })
      return rows.map((r) => ({
        id: r.id,
        autorId: r.userId,
        autorNome: r.user.nome,
        tenantId: r.tenantId,
        trecho: trechoDe(r.nome, r.bio),
        ocultado: !r.ativa || Boolean(r.congeladaEm),
        link: null,
      }))
    },
    // Congelar vitrine é decisão do brechó (com atendente e motivo próprios),
    // não efeito colateral de denúncia: aqui a resposta é escalar.
    acaoOcultar: null,
  },

  COMUNICADO: {
    label: 'Comunicado',
    carregar: async (ids) => {
      const rows: ComunicadoRow[] = await db.announcement.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          autorId: true,
          tenantId: true,
          titulo: true,
          corpo: true,
          autor: { select: { nome: true } },
        },
      })
      return rows.map((r) => ({
        id: r.id,
        autorId: r.autorId,
        autorNome: r.autor.nome,
        tenantId: r.tenantId,
        trecho: trechoDe(r.titulo, r.corpo),
        ocultado: false,
        link: null,
      }))
    },
    // Comunicado é ato da diretoria: quem publica já tem permissão de admin. A
    // resposta certa é escalonamento, não ocultar por trás de quem administra.
    acaoOcultar: null,
  },

  EVENTO: {
    label: 'Evento da agenda',
    carregar: async (ids) => {
      const rows: EventoRow[] = await db.evento.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          criadoPorId: true,
          tenantId: true,
          titulo: true,
          descricao: true,
        },
      })
      return rows.map((r) => ({
        id: r.id,
        autorId: r.criadoPorId,
        autorNome: null,
        tenantId: r.tenantId,
        trecho: trechoDe(r.titulo, r.descricao),
        ocultado: false,
        link: null,
      }))
    },
    // Mesmo caso do comunicado: quem cria evento é gestão do tenant.
    acaoOcultar: null,
  },

  PERFIL: {
    label: 'Perfil de torcedor',
    carregar: async (ids) => {
      const rows: PerfilRow[] = await db.perfilTorcedor.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          userId: true,
          bio: true,
          regiao: true,
          user: { select: { nome: true } },
        },
      })
      return rows.map((r) => ({
        id: r.id,
        autorId: r.userId,
        autorNome: r.user.nome,
        tenantId: null,
        trecho: trechoDe(r.bio, r.regiao),
        ocultado: false,
        link: null,
      }))
    },
    // Perfil é a pessoa, não uma peça de conteúdo: a resposta é sanção ao autor
    // (fase seguinte) via escalonamento, nunca "ocultar o perfil".
    acaoOcultar: null,
  },

  GRUPO: {
    label: 'Grupo da comunidade',
    carregar: (ids) => carregarConversas(ids, 'GRUPO'),
    // `Conversa` não tem campo de encerramento: fechar grupo é ação de gestão.
    acaoOcultar: null,
  },

  CANAL: {
    label: 'Canal da comunidade',
    carregar: (ids) => carregarConversas(ids, 'CANAL'),
    acaoOcultar: null,
  },

  SALA: {
    label: 'Sala de reunião',
    carregar: async (ids) => {
      const rows: SalaRow[] = await db.salaReuniao.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          hostId: true,
          tenantId: true,
          titulo: true,
          encerradaEm: true,
          host: { select: { nome: true } },
        },
      })
      return rows.map((r) => ({
        id: r.id,
        autorId: r.hostId,
        autorNome: r.host.nome,
        tenantId: r.tenantId,
        trecho: trechoDe(r.titulo),
        ocultado: Boolean(r.encerradaEm),
        link: null,
      }))
    },
    acaoOcultar: (id) =>
      db.salaReuniao.update({ where: { id }, data: { encerradaEm: new Date() } }),
  },
}

/**
 * `ModeracaoDenuncia` guarda `(alvoTipo, alvoId)` sem relação — cada tipo mora
 * em outra tabela. Resolve o lote com **uma query por tipo presente**, nunca
 * uma por linha da fila.
 */
export async function carregarAlvosModeracao(
  denuncias: { alvoTipo: AlvoModeracao; alvoId: string }[],
): Promise<Map<string, AlvoModeracaoCarregado>> {
  const mapa = new Map<string, AlvoModeracaoCarregado>()
  if (denuncias.length === 0) return mapa

  const porTipo = new Map<AlvoModeracao, Set<string>>()
  for (const d of denuncias) {
    const set = porTipo.get(d.alvoTipo) ?? new Set<string>()
    set.add(d.alvoId)
    porTipo.set(d.alvoTipo, set)
  }

  const lotes: [AlvoModeracao, string[]][] = [...porTipo].map(([tipo, ids]) => [tipo, [...ids]])
  const resultados: AlvoModeracaoCarregado[][] = await Promise.all(
    lotes.map(([tipo, ids]) => ALVOS_MODERACAO[tipo].carregar(ids)),
  )

  lotes.forEach(([tipo], i) => {
    for (const alvo of resultados[i] ?? []) {
      mapa.set(chaveAlvoModeracao(tipo, alvo.id), alvo)
    }
  })

  return mapa
}

/**
 * Operação que esconde o alvo, ou `null` quando a superfície não tem ocultação
 * — nesse caso a decisão é registrada e escalada, sem mutar o alvo.
 */
export function operacaoOcultarAlvo(
  alvoTipo: AlvoModeracao,
  alvoId: string,
): PrismaPromise<unknown> | null {
  const acao = ALVOS_MODERACAO[alvoTipo].acaoOcultar
  return acao ? acao(alvoId) : null
}

/** Superfície sem ocultação: a decisão só registra e escala. */
export function alvoSoEscala(alvoTipo: AlvoModeracao): boolean {
  return ALVOS_MODERACAO[alvoTipo].acaoOcultar === null
}

export const ROTULO_ALVO_MODERACAO: Record<AlvoModeracao, string> = Object.fromEntries(
  (Object.keys(ALVOS_MODERACAO) as AlvoModeracao[]).map((tipo) => [
    tipo,
    ALVOS_MODERACAO[tipo].label,
  ]),
) as Record<AlvoModeracao, string>
