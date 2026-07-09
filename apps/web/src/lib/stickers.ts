/** Pacote curado de stickers do app (servidos de /public/stickers). */
export const STICKERS: string[] = [
  'bola',
  'gol',
  'trofeu',
  'fogo',
  'coracao',
  'bandeira',
].map((nome) => `/stickers/${nome}.svg`)
