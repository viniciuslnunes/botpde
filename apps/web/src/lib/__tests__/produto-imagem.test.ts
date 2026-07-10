import { describe, it, expect } from 'vitest'
import {
  resolveProdutoImagemUrl,
  firstProdutoImagemUrl,
  normalizeProdutoSourceUrl,
  resolveProdutoImagens,
  rotuloImagemProduto,
} from '@/lib/produto-imagem'

describe('produto-imagem', () => {
  it('normaliza wrapper cdn-cgi para URL direta', () => {
    const wrapped =
      'https://gavioes.jetassets.com.br/cdn-cgi/image/width=1200,quality=85,format=webp/https://gavioes.jetassets.com.br/produto/20260603165839_2466997534_D.jpg'
    expect(normalizeProdutoSourceUrl(wrapped)).toBe(
      'https://gavioes.jetassets.com.br/produto/20260603165839_2466997534_D.jpg',
    )
    expect(resolveProdutoImagemUrl(wrapped)).toBe(
      'https://gavioes.jetassets.com.br/produto/20260603165839_2466997534_D.jpg',
    )
  })

  it('mantém cloudinary e caminhos relativos', () => {
    const url = 'https://res.cloudinary.com/demo/image/upload/sample.jpg'
    expect(resolveProdutoImagemUrl(url)).toBe(url)
    expect(resolveProdutoImagemUrl('/uploads/x.jpg')).toBe('/uploads/x.jpg')
  })

  it('retorna primeira URL válida do array', () => {
    const urls = ['', 'https://gavioes.jetassets.com.br/produto/x.jpg']
    expect(firstProdutoImagemUrl(urls)).toBe('https://gavioes.jetassets.com.br/produto/x.jpg')
    expect(resolveProdutoImagens(urls)).toHaveLength(1)
    expect(firstProdutoImagemUrl([])).toBeNull()
  })

  it('rotula frente e verso', () => {
    expect(rotuloImagemProduto(0, 2)).toBe('Frente')
    expect(rotuloImagemProduto(1, 2)).toBe('Verso')
  })

  it('suporta base64 legado do bot', () => {
    const b64 = 'A'.repeat(120)
    expect(resolveProdutoImagemUrl(b64)).toBe(`data:image/jpeg;base64,${b64}`)
  })
})
