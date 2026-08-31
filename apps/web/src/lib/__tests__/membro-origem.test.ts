import { describe, expect, it } from 'vitest'
import {
  canalDeAuditDetalhes,
  canalDeEntrada,
  resolverOrigemExibicao,
  resumirLogsRecrutamento,
} from '@/lib/membro-origem'

describe('canalDeEntrada', () => {
  it('convite vence Associe-se', () => {
    expect(canalDeEntrada({ viaConvite: true, origemAssocieSe: true })).toBe('convite')
  })

  it('Associe-se quando não houve convite', () => {
    expect(canalDeEntrada({ viaConvite: false, origemAssocieSe: true })).toBe('associe-se')
  })

  it('onboarding é o caminho orgânico', () => {
    expect(canalDeEntrada({ viaConvite: false })).toBe('onboarding')
  })
})

describe('canalDeAuditDetalhes', () => {
  it('lê origem conhecida', () => {
    expect(canalDeAuditDetalhes({ origem: 'convite' })).toBe('convite')
  })

  it('ignora origem inventada', () => {
    expect(canalDeAuditDetalhes({ origem: 'whatsapp' })).toBeNull()
  })

  it('tolera detalhes vazios', () => {
    expect(canalDeAuditDetalhes(null)).toBeNull()
    expect(canalDeAuditDetalhes({ alteracoes: [] })).toBeNull()
  })
})

describe('resolverOrigemExibicao', () => {
  it('espelho mostra a unidade de solicitação', () => {
    const origem = resolverOrigemExibicao({
      espelhado: true,
      aprovadoNaUnidadeNome: 'PDE FIEL BAIXADA',
      origemCanal: 'convite',
    })
    expect(origem.viaUnidade).toBe(true)
    expect(origem.unidadeNome).toBe('PDE FIEL BAIXADA')
    expect(origem.canalLabel).toBe('Link de convite')
  })

  it('cadastro local sem canal não inventa onboarding', () => {
    const origem = resolverOrigemExibicao({ espelhado: false })
    expect(origem.viaUnidade).toBe(false)
    expect(origem.unidadeNome).toBe('Nesta unidade')
    expect(origem.canal).toBeNull()
  })

  it('importação infere o canal pelo importacaoId', () => {
    const origem = resolverOrigemExibicao({ importacaoId: 'imp-1' })
    expect(origem.canal).toBe('importacao')
    expect(origem.canalLabel).toBe('Importação')
  })
})

describe('resumirLogsRecrutamento', () => {
  it('conta tentativas, pega o motivo mais recente e o canal mais antigo', () => {
    const resumo = resumirLogsRecrutamento([
      {
        entidadeId: 'm1',
        acao: 'MEMBRO_REPROVADO',
        detalhes: { motivo: 'documento ilegível' },
      },
      {
        entidadeId: 'm1',
        acao: 'RECADASTRO_SOLICITADO',
        detalhes: { alteracoes: [] },
      },
      {
        entidadeId: 'm1',
        acao: 'CADASTRO_SOLICITADO',
        detalhes: { origem: 'upgrade_torcedor' },
      },
      {
        entidadeId: 'm1',
        acao: 'CADASTRO_SOLICITADO',
        detalhes: { origem: 'convite' },
      },
    ])
    expect(resumo.tentativasPorMembro.get('m1')).toBe(3)
    expect(resumo.motivoReprovacaoPorMembro.get('m1')).toBe('documento ilegível')
    expect(resumo.origemCanalPorMembro.get('m1')).toBe('convite')
  })
})
