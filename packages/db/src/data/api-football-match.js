/**
 * Casamento Afiliacao ↔ API-Football (decisão #7).
 * Puro (sem rede) — testável via `scripts/test-api-football-match.js`.
 *
 * Por que existe: `GET /teams?search=corinthians` devolve 10 resultados, e só
 * um é o clube que a torcida apoia — os outros são feminino (`Corinthians W`),
 * categorias de base (`U20`, `U23`) e homônimos de Malta, Gales e EUA.
 * Casar por nome sem filtro grava o id errado em `Afiliacao.apiExternalId` e
 * contamina TODO sync de `Partida` depois. Por isso: descarta ruído, desempata
 * por cidade e, na dúvida, devolve `revisar` em vez de chutar.
 *
 * Ver `docs/data/integracao-api-football.md`.
 */
import {
  ALIASES,
  chaveMatch,
  cidadesCompativeis,
  inferirUfDoNome,
  normalizeNome,
} from './afiliacoes-normalize.js'
import { localizacaoCompativel } from './escudos-thesportsdb-match.js'

/** @typedef {{ id: number, nome: string, cidade: string | null, logo: string | null }} TimeApi */
/** @typedef {'alta' | 'revisar' | 'sem-match'} StatusMatch */
/** @typedef {{ status: StatusMatch, escolhido: TimeApi | null, candidatos: TimeApi[], motivo: string }} ResultadoMatch */

/** Sufixo de time feminino: `Corinthians W`, `Flamengo W`. */
const RE_FEMININO = /\sW$/i
/** Categorias de base: `Corinthians U20`, `Santos Sub-17`. */
const RE_BASE = /\b(?:U|SUB[\s-]?)(?:15|16|17|18|19|20|21|23)\b/i
/** Times de reservas: `Palmeiras II`, `Gremio B`. */
const RE_RESERVAS = /\s(?:II|B)$/

/**
 * Time que nunca deve virar `apiExternalId` de uma Afiliacao: seleção nacional,
 * futebol feminino, categoria de base ou equipe reserva.
 *
 * A torcida organizada apoia o clube profissional masculino — é o calendário
 * dele que alimenta Agenda e caravana.
 *
 * @param {{ name: string, national?: boolean }} time
 * @returns {boolean}
 */
export function ehTimeIgnorado(time) {
  if (time.national) return true
  const nome = String(time.name || '')
  return RE_FEMININO.test(nome) || RE_BASE.test(nome) || RE_RESERVAS.test(nome)
}

/**
 * Indexa o snapshot da API por `chaveMatch`, já descartando o ruído.
 * Homônimos legítimos (dois clubes de nome igual em UFs diferentes) ficam
 * juntos na mesma chave de propósito — quem desempata é a cidade.
 *
 * @param {Array<{ team: { id: number, name: string, country?: string, national?: boolean, logo?: string | null }, venue?: { city?: string | null } | null }>} resposta
 * @returns {Map<string, TimeApi[]>}
 */
export function indexarTimesApiFootball(resposta) {
  /** @type {Map<string, TimeApi[]>} */
  const indice = new Map()
  for (const item of resposta ?? []) {
    const time = item?.team
    if (!time?.id || !time?.name) continue
    if (ehTimeIgnorado(time)) continue

    const chave = chaveMatch(time.name)
    if (!chave) continue

    const atual = indice.get(chave) ?? []
    atual.push({
      id: time.id,
      nome: time.name,
      cidade: item?.venue?.city ?? null,
      logo: time.logo ?? null,
    })
    indice.set(chave, atual)
  }
  return indice
}

/**
 * A cidade da API vem como "Rio de Janeiro, Rio de Janeiro" (cidade, estado) —
 * o segundo termo é o sinal mais forte que temos para desempatar homônimos,
 * porque nosso catálogo guarda a UF em `Afiliacao.estado`.
 * @param {string | null} cidadeApi
 * @returns {string}
 */
function cidadeDaApi(cidadeApi) {
  return String(cidadeApi ?? '').split(',')[0].trim()
}

/**
 * Desempate de homônimo exige localização **conhecida** dos dois lados.
 *
 * `cidadesCompativeis`/`localizacaoCompativel` devolvem `true` quando um lado
 * está vazio — comportamento certo para "não contradiz", errado para escolher
 * um vencedor: sem isto, `Flamengo SE` (cidade nula) empata com o Flamengo do
 * Rio e um clube de 40 milhões de torcedores cai em revisão manual.
 *
 * @param {TimeApi} candidato
 * @param {{ cidade?: string | null, estado?: string | null }} afiliacao
 * @returns {boolean}
 */
function localizacaoBate(candidato, afiliacao) {
  if (!candidato.cidade) return false
  if (afiliacao.estado && localizacaoCompativel(candidato.cidade, afiliacao.estado)) return true
  if (afiliacao.cidade && cidadesCompativeis(afiliacao.cidade, cidadeDaApi(candidato.cidade))) {
    return true
  }
  return false
}

/**
 * Casa uma Afiliacao com o índice da API-Football.
 *
 * Nunca devolve `alta` quando há ambiguidade não resolvida: grava id errado é
 * pior que não gravar, porque o erro só aparece semanas depois, como jogo de
 * outro clube na Agenda.
 *
 * @param {{ nome: string, apelido?: string | null, cidade?: string | null, estado?: string | null }} afiliacao
 * @param {Map<string, TimeApi[]>} indice
 * @returns {ResultadoMatch}
 */
export function casarAfiliacaoApiFootball(afiliacao, indice) {
  const r = resolverCandidatos(afiliacao, indice)
  if (r.status !== 'alta' || r.viaAliasCurado) return r
  if (compartilhaTokenSignificativo(afiliacao.nome, r.escolhido.nome)) return r
  return {
    status: 'revisar',
    escolhido: null,
    candidatos: r.candidatos,
    motivo: `nome sem palavra em comum com "${r.escolhido.nome}" (id ${r.escolhido.id}) — confirmar`,
  }
}

/**
 * @param {{ nome: string, apelido?: string | null, cidade?: string | null, estado?: string | null }} afiliacao
 * @param {Map<string, TimeApi[]>} indice
 * @returns {ResultadoMatch & { viaAliasCurado?: boolean }}
 */
function resolverCandidatos(afiliacao, indice) {
  // Nosso catálogo guarda o nome formal ("Associação Ferroviária de Esportes");
  // a API usa o nome curto ("Ferroviaria"). `ALIASES` é a ponte que o repo já
  // mantém para esse mesmo problema — reusar evita um segundo dicionário.
  const alias = ALIASES[normalizeNome(afiliacao.nome)]
  /** @type {Array<{ chave: string, curada: boolean }>} */
  const chaves = [{ chave: chaveMatch(afiliacao.nome), curada: false }]
  if (alias) chaves.push({ chave: chaveMatch(alias), curada: true })
  if (afiliacao.apelido) chaves.push({ chave: chaveMatch(afiliacao.apelido), curada: false })

  /** @type {TimeApi[]} */
  let candidatos = []
  let viaAliasCurado = false
  const vistas = new Set()
  for (const { chave, curada } of chaves) {
    if (!chave || vistas.has(chave)) continue
    vistas.add(chave)
    const achados = indice.get(chave)
    if (achados?.length) {
      candidatos = achados
      viaAliasCurado = curada
      break
    }
  }

  if (candidatos.length === 0) {
    return { status: 'sem-match', escolhido: null, candidatos: [], motivo: 'nenhum time com esse nome' }
  }

  if (candidatos.length === 1) {
    const unico = candidatos[0]
    const uf = afiliacao.estado || inferirUfDoNome(afiliacao.nome)

    // Com nome único no Brasil, a UF é o veto certo. A cidade não serve como
    // veto aqui: nosso catálogo tem bairro e erro de digitação no campo
    // (`"Centro"`, `"1000"`, `"Corumbrá"`), e reprovar por isso mandaria clube
    // certo para a fila manual. Cidade só decide quando não há UF.
    if (uf && unico.cidade) {
      if (localizacaoCompativel(unico.cidade, uf)) {
        return { status: 'alta', escolhido: unico, candidatos, motivo: 'nome único + UF confere', viaAliasCurado }
      }
      return {
        status: 'revisar',
        escolhido: null,
        candidatos,
        motivo: `UF divergente (nossa: ${uf} · API: ${unico.cidade})`,
      }
    }

    const cidadeApi = cidadeDaApi(unico.cidade)
    if (!uf && afiliacao.cidade && cidadeApi && !cidadesCompativeis(afiliacao.cidade, cidadeApi)) {
      return {
        status: 'revisar',
        escolhido: null,
        candidatos,
        motivo: `sem UF e cidade divergente (nossa: ${afiliacao.cidade} · API: ${cidadeApi})`,
      }
    }
    return { status: 'alta', escolhido: unico, candidatos, motivo: 'nome único no catálogo BR', viaAliasCurado }
  }

  // Homônimos: só a localização desempata, e ela precisa ser conhecida.
  const porLocal = candidatos.filter((c) => localizacaoBate(c, afiliacao))
  if (porLocal.length === 1) {
    return {
      status: 'alta',
      escolhido: porLocal[0],
      candidatos,
      motivo: `desempate por localização (${cidadeDaApi(porLocal[0].cidade)})`,
      viaAliasCurado,
    }
  }

  // Nome idêntico (sem normalização de ruído) reduz, mas não resolve sozinho.
  const exatos = candidatos.filter((c) => normalizeNome(c.nome) === normalizeNome(afiliacao.nome))
  if (exatos.length === 1) {
    return {
      status: 'revisar',
      escolhido: null,
      candidatos,
      motivo: `${candidatos.length} homônimos; nome exato bate com id ${exatos[0].id} — confirmar`,
    }
  }

  return {
    status: 'revisar',
    escolhido: null,
    candidatos,
    motivo: `${candidatos.length} homônimos sem desempate`,
  }
}

/**
 * Ids externos reivindicados por mais de uma Afiliacao.
 *
 * Um time da API é UM clube. Duas afiliações apontando para o mesmo id são
 * duplicata do nosso catálogo (ex.: "Gama" e "Sociedade Esportiva Gama", ambas
 * DF) — e gravar as duas faria o sync criar a mesma partida duas vezes, sem que
 * `@@unique([afiliacaoId, fonteExternalId])` percebesse, já que o `afiliacaoId`
 * difere. Invariante de conjunto: só visível depois de casar todo mundo.
 *
 * @param {Array<{ id: number }>} escolhidos ids externos aprovados, na ordem
 * @returns {Set<number>} ids em disputa (nenhum deve ser gravado)
 */
export function detectarColisoesIdExterno(escolhidos) {
  const contagem = new Map()
  for (const e of escolhidos) {
    contagem.set(e.id, (contagem.get(e.id) ?? 0) + 1)
  }
  return new Set([...contagem].filter(([, n]) => n > 1).map(([id]) => id))
}

/**
 * Rede de segurança final: um casamento de confiança alta precisa compartilhar
 * pelo menos uma palavra significativa com o nome da API.
 *
 * `chaveMatch` remove ruído ("associação", "esporte", "clube", sufixo de UF) —
 * duas afiliações distintas podem colapsar na mesma chave e passar no desempate
 * por UF. Alias curado à mão (`ALIASES`) é isento: "Centro Sportivo Alagoano" →
 * "CSA" não compartilha token nenhum e mesmo assim está certo.
 *
 * @param {string} nomeNosso
 * @param {string} nomeApi
 * @returns {boolean}
 */
export function compartilhaTokenSignificativo(nomeNosso, nomeApi) {
  const nossos = new Set(chaveMatch(nomeNosso).split(' ').filter((t) => t.length > 2))
  return chaveMatch(nomeApi)
    .split(' ')
    .some((t) => t.length > 2 && nossos.has(t))
}
