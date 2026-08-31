/**
 * Coleta as cores predominantes do ESCUDO de cada clube via Cloudinary Admin API
 * (`?colors=true`) e grava um dataset offline revisável.
 *
 *   TORCIDA_ENV=local pnpm --filter @torcida/db coleta:cores-escudos
 *   TORCIDA_ENV=local pnpm --filter @torcida/db coleta:cores-escudos -- --limite=20
 *
 * Por que existe: `CLUBE_PALETAS` (packages/types/src/design.js) é curada à mão e
 * cobre ~35 clubes. O catálogo tem 318 — o resto entra no Estúdio Design sem cor
 * de clube nenhuma. O escudo já está no nosso Cloudinary, e a Admin API devolve a
 * distribuição de cores da imagem; isso dá um ponto de partida honesto.
 *
 * Limites conhecidos (por isso o dataset é PROPOSTA, não verdade):
 * - anti-aliasing gera tons intermediários — mitigado por fusão de cores próximas
 *   e corte de participação mínima;
 * - escudo com fundo/detalhe dourado ou sombra sugere cor que a torcida não usa;
 * - preto e branco são cores legítimas de clube (Corinthians, Santos, Botafogo,
 *   Vasco) e NÃO são filtrados — ver docs/knowledge/identidade-visual-cores.md.
 *
 * A Admin API tem cota horária. O script serializa as chamadas, respeita
 * `x-featureratelimit-remaining` e para sozinho se a cota acabar.
 */
import { PrismaClient } from '@prisma/client'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { prepareSeedEnv } from './lib/seed-env.js'
import { MONOREPO_ROOT } from './lib/cloudinary-admin.js'
import {
  consolidarCores,
  publicIdDaUrl,
  PARTICIPACAO_MINIMA,
  MAX_CORES,
  DISTANCIA_FUSAO,
} from './lib/cores-escudo.js'

prepareSeedEnv({ scriptLabel: 'coleta:cores-escudos' })

const db = new PrismaClient()

const SAIDA = resolve(MONOREPO_ROOT, 'packages/db/src/data/cores-escudos.json')

const argLimite = process.argv.find((a) => a.startsWith('--limite='))
const LIMITE = argLimite ? Number(argLimite.split('=')[1]) : null

async function main() {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME
  const key = process.env.CLOUDINARY_API_KEY
  const secret = process.env.CLOUDINARY_API_SECRET
  if (!cloud || !key || !secret) {
    throw new Error(
      'coleta:cores-escudos precisa de CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET.',
    )
  }
  const auth = `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`

  /** @type {{ id: string, nome: string, estado: string | null, escudoUrl: string | null }[]} */
  const clubes = await db.afiliacao.findMany({
    where: { escudoUrl: { not: null } },
    select: { id: true, nome: true, estado: true, escudoUrl: true },
    orderBy: [{ tenants: { _count: 'desc' } }, { nome: 'asc' }],
    ...(LIMITE ? { take: LIMITE } : {}),
  })

  console.log(`Escudos a analisar: ${clubes.length}`)

  const itens = []
  let semPublicId = 0
  let erros = 0

  for (const [i, clube] of clubes.entries()) {
    const publicId = publicIdDaUrl(clube.escudoUrl ?? '')
    if (!publicId || !publicId.startsWith('torcida/')) {
      semPublicId += 1
      continue
    }
    const url =
      `https://api.cloudinary.com/v1_1/${cloud}/resources/image/upload/` +
      `${encodeURIComponent(publicId)}?colors=true`

    const resposta = await fetch(url, { headers: { Authorization: auth } })
    const restante = resposta.headers.get('x-featureratelimit-remaining')

    if (resposta.status === 420 || resposta.status === 429) {
      console.warn(`\n⚠ cota da Admin API esgotada em ${i} de ${clubes.length}. Parando.`)
      break
    }
    if (!resposta.ok) {
      erros += 1
      console.warn(`  ✗ ${clube.nome} (${clube.estado ?? '?'}) → HTTP ${resposta.status}`)
      continue
    }

    const payload = await resposta.json()
    const paleta = consolidarCores(payload.colors)
    if (paleta.length === 0) {
      erros += 1
      continue
    }

    itens.push({
      nome: clube.nome,
      uf: clube.estado,
      publicId,
      primary: paleta[0].hex,
      secondary: paleta[1]?.hex ?? null,
      accent: paleta[2]?.hex ?? null,
      participacoes: paleta.map((c) => c.participacao),
    })

    if ((i + 1) % 25 === 0) {
      console.log(`  … ${i + 1}/${clubes.length} (cota restante: ${restante ?? '?'})`)
    }
  }

  const saida = {
    descricao:
      'Cores predominantes do escudo de cada clube, extraídas via Cloudinary Admin API. ' +
      'PROPOSTA revisável: cor de escudo não é necessariamente a cor da marca da torcida.',
    fonte: 'Cloudinary Admin API — /resources/image/upload/{public_id}?colors=true',
    geradoEm: new Date().toISOString(),
    parametros: { participacaoMinima: PARTICIPACAO_MINIMA, maxCores: MAX_CORES, distanciaFusao: DISTANCIA_FUSAO },
    total: itens.length,
    clubes: itens,
  }
  writeFileSync(SAIDA, `${JSON.stringify(saida, null, 1)}\n`)

  console.log(
    `\nCores de escudo — ${itens.length} clubes gravados` +
      ` (${semPublicId} sem public_id Cloudinary, ${erros} sem cor utilizável)`,
  )
  console.log(`Arquivo: ${SAIDA}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
