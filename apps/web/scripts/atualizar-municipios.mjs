#!/usr/bin/env node
/**
 * Regenera `src/lib/data/municipios-brasil.json` a partir da API de localidades
 * do IBGE.
 *
 * A malha municipal é dado de referência que quase não muda (uma alteração a
 * cada poucos anos), mas o app dependia dela em runtime: o passo Região do
 * onboarding chamava o IBGE a cada busca. Qualquer indisponibilidade de rede
 * virava "Nenhuma cidade encontrada" — e, pior, ficava cacheada por 30 dias.
 * Agora a lista é versionada no repo e este script só roda quando quisermos
 * atualizá-la (rodar, conferir o diff, commitar).
 *
 *   node scripts/atualizar-municipios.mjs
 *   node scripts/atualizar-municipios.mjs --check   # não grava; exit 1 se mudou
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

const DESTINO = join(
  dirname(fileURLToPath(import.meta.url)),
  '../src/lib/data/municipios-brasil.json',
)
const TIMEOUT_MS = 15000
const TENTATIVAS = 3

async function baixarUf(uf) {
  let ultimoErro = null
  for (let i = 1; i <= TENTATIVAS; i += 1) {
    try {
      const res = await fetch(
        `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`,
        { signal: AbortSignal.timeout(TIMEOUT_MS) },
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const municipios = await res.json()
      if (!Array.isArray(municipios) || municipios.length === 0) {
        throw new Error('resposta sem municípios')
      }
      return municipios.map((m) => m.nome)
    } catch (err) {
      ultimoErro = err
    }
  }
  throw new Error(`${uf}: ${ultimoErro?.message ?? ultimoErro}`)
}

async function main() {
  const check = process.argv.includes('--check')

  const pares = await Promise.all(
    UFS.map(async (uf) => [uf, (await baixarUf(uf)).sort((a, b) => a.localeCompare(b, 'pt-BR'))]),
  )
  const mapa = Object.fromEntries(pares.sort(([a], [b]) => a.localeCompare(b)))
  const total = Object.values(mapa).reduce((acc, l) => acc + l.length, 0)

  // Sanidade: a malha brasileira tem 5.570 municípios (+ Fernando de Noronha
  // e afins na contagem do IBGE). Muito longe disso = resposta degradada.
  if (total < 5000) {
    throw new Error(`total suspeito de municípios: ${total}`)
  }

  const conteudo = `${JSON.stringify(mapa, null, 0)}\n`

  if (check) {
    const atual = readFileSync(DESTINO, 'utf8')
    if (atual === conteudo) {
      console.log(`municípios em dia (${total})`)
      return
    }
    console.error('municípios desatualizados — rode: node scripts/atualizar-municipios.mjs')
    process.exit(1)
  }

  writeFileSync(DESTINO, conteudo, 'utf8')
  console.log(`gravado ${DESTINO} — ${UFS.length} UFs, ${total} municípios`)
}

main().catch((err) => {
  console.error('falhou:', err.message)
  process.exit(1)
})
