import { describe, expect, it } from 'vitest'
import {
  derivarMando,
  ehMesmoJogo,
  janelaPadrao,
  mapearStatus,
  paraPartida,
  type PartidaExterna,
} from '@/lib/partidas-sync/contrato'

const CLASSICO: PartidaExterna = {
  fonteExternalId: '1180400',
  timeCasaExternalId: '131', // Corinthians
  timeForaExternalId: '154', // Fortaleza
  adversarioCasa: 'Corinthians',
  adversarioFora: 'Fortaleza EC',
  dataHora: new Date('2024-05-04T21:00:00-03:00'),
  competicao: 'Serie A — Regular Season - 5',
  local: 'Neo Química Arena',
  status: 'ENCERRADA',
  placarCasa: 0,
  placarFora: 0,
}

describe('mapearStatus', () => {
  it('mapeia os códigos do provedor para o enum', () => {
    expect(mapearStatus('NS')).toBe('AGENDADA')
    expect(mapearStatus('1H')).toBe('AO_VIVO')
    expect(mapearStatus('HT')).toBe('AO_VIVO')
    expect(mapearStatus('FT')).toBe('ENCERRADA')
    expect(mapearStatus('PEN')).toBe('ENCERRADA')
    expect(mapearStatus('CANC')).toBe('CANCELADA')
  })

  it('adiado continua AGENDADA — some da Agenda seria pior que data errada', () => {
    expect(mapearStatus('PST')).toBe('AGENDADA')
  })

  it('suspenso/interrompido ainda é AO_VIVO', () => {
    expect(mapearStatus('SUSP')).toBe('AO_VIVO')
    expect(mapearStatus('INT')).toBe('AO_VIVO')
  })

  it('código novo do provedor não derruba o jogo da Agenda', () => {
    expect(mapearStatus('XYZ')).toBe('AGENDADA')
    expect(mapearStatus(null)).toBe('AGENDADA')
    expect(mapearStatus(undefined)).toBe('AGENDADA')
  })
})

describe('derivarMando', () => {
  it('é derivação nossa, não campo da API', () => {
    expect(derivarMando('131', '131')).toBe('CASA')
    expect(derivarMando('154', '131')).toBe('FORA')
  })
})

describe('paraPartida', () => {
  it('o adversário depende de quem é o nosso clube', () => {
    const corinthians = paraPartida(CLASSICO, '131')
    expect(corinthians.mando).toBe('CASA')
    expect(corinthians.adversario).toBe('Fortaleza EC')

    const fortaleza = paraPartida(CLASSICO, '154')
    expect(fortaleza.mando).toBe('FORA')
    expect(fortaleza.adversario).toBe('Corinthians')
  })

  it('placar é do jogo, não do ponto de vista — casa continua casa', () => {
    const jogo: PartidaExterna = { ...CLASSICO, placarCasa: 2, placarFora: 0 }
    expect(paraPartida(jogo, '131').placarCasa).toBe(2)
    expect(paraPartida(jogo, '154').placarCasa).toBe(2)
  })

  it('carrega o id do fixture para idempotência', () => {
    expect(paraPartida(CLASSICO, '131').fonteExternalId).toBe('1180400')
  })
})

describe('ehMesmoJogo (adoção de partida manual)', () => {
  const externa = { dataHora: new Date('2024-05-04T21:00:00-03:00'), adversario: 'Fortaleza EC' }

  it('adota partida manual do mesmo jogo com horário aproximado', () => {
    const manual = {
      dataHora: new Date('2024-05-04T22:30:00-03:00'),
      adversario: 'fortaleza ec',
      fonteExternalId: null,
    }
    expect(ehMesmoJogo(manual, externa)).toBe(true)
  })

  it('ignora acento e pontuação do nome digitado à mão', () => {
    const manual = {
      dataHora: new Date('2024-05-04T21:00:00-03:00'),
      adversario: 'Fortaleza-EC',
      fonteExternalId: null,
    }
    expect(ehMesmoJogo(manual, externa)).toBe(true)
  })

  it('não adota partida que já veio do provedor', () => {
    const jaSincronizada = {
      dataHora: new Date('2024-05-04T21:00:00-03:00'),
      adversario: 'Fortaleza EC',
      fonteExternalId: '999',
    }
    expect(ehMesmoJogo(jaSincronizada, externa)).toBe(false)
  })

  it('não adota jogo de outro dia contra o mesmo adversário', () => {
    const outroJogo = {
      dataHora: new Date('2024-08-10T21:00:00-03:00'),
      adversario: 'Fortaleza EC',
      fonteExternalId: null,
    }
    expect(ehMesmoJogo(outroJogo, externa)).toBe(false)
  })

  it('não adota adversário diferente no mesmo horário', () => {
    const outro = {
      dataHora: new Date('2024-05-04T21:00:00-03:00'),
      adversario: 'Palmeiras',
      fonteExternalId: null,
    }
    expect(ehMesmoJogo(outro, externa)).toBe(false)
  })
})

describe('janelaPadrao', () => {
  it('cobre passado curto (fechar placar) e futuro de planejamento', () => {
    const agora = new Date('2026-08-12T12:00:00Z')
    const { de, ate } = janelaPadrao(agora)
    expect(de.toISOString().slice(0, 10)).toBe('2026-08-05')
    expect(ate.toISOString().slice(0, 10)).toBe('2026-09-11')
  })
})
