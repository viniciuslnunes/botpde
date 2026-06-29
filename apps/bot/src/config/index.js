// ============================================================
//  CONFIGURAÇÃO CENTRAL — preencha os IDs do seu servidor
// ============================================================

module.exports = {
  // ── ID do Servidor ────────────────────────────────────────
  guildId: '1491898659758014595',
  // ── Canais ────────────────────────────────────────────────
  canais: {
    recrutamento:       '1491920874805137559',        // Botão de solicitar recrutamento
    validarSetagem:     '1505410676993294448',         // Canal privado de análise (recrutadores)
    provarAssociacao:   '1505422008605872279',         // Canal provar associação (sócio)
    provarManto:        '1505433421197873254',          // Canal provar manto (torcedor)
    carteirinha:        'ID_CANAL_CARTEIRINHA',       // Botão de solicitar carteirinha
    ticket:             '1493461731358277672',         // Botão de abrir ticket — 📩・atendimento
    logsTicket:         '1505430637941624895',         // Logs e transcritos de tickets — 🛠️・logs-tickets
    logsLoja:           '1505492309595263027',          // Logs e transcritos da loja — 🛠️・logs-loja
    logsItensLoja:      '1505502653306638336',          // Logs de cadastro de itens — 🛠️・logs-itens-loja
    logsVendas:         '1505510194141069462',          // Logs de vendas confirmadas — 🛠️・logs-vendas
    resumoVendas:       '1504246014947627188',          // Embed de resumo/montante de vendas
    advertencia:        'ID_CANAL_ADVERTENCIA',       // Botões de advertência de membros
    advRecrutadores:    'ID_CANAL_ADV_RECRUTADORES',  // Botões de advertência de recrutadores
    historicoAdv:       'ID_CANAL_HISTORICO_ADV',     // Histórico de advertências de membros
    historicoAdvRec:    'ID_CANAL_HISTORICO_ADV_REC', // Histórico de advertências de recrutadores
    naoRecrutar:        'ID_CANAL_NAO_RECRUTAR',      // Canal ❌・nao-recrutar (uso de /bloquearid)
    historicoNaoRec:    'ID_CANAL_HISTORICO_NAO_REC', // Canal de histórico de IDs bloqueados
    mural:              'ID_CANAL_MURAL',             // Mural de associados
    hierarquia:         'ID_CANAL_HIERARQUIA',        // Embed de hierarquia
    elenco:             'ID_CANAL_ELENCO',            // Embed de elenco
    quadroRecrutadores: 'ID_CANAL_QUADRO_RECRUTADORES', // Quadro de recrutadores
    topRecrutadores:    'ID_CANAL_TOP_RECRUTADORES',  // Ranking de recrutadores
    loja:               '1493461657433935902',         // 🛒・loja — botão ver produtos
    gerenciamentoLoja:  '1505465708979421195',         // 🛒・gerenciamento-loja — admin estoque
    redesSociais:       '1491917296774414417',         // Canal de redes sociais
  },

  // ── Cargos ────────────────────────────────────────────────
  cargos: {
    socio:                  '1491901374567420114',
    torcedor:               '1491910592900894730',
    provarAssociacao:       '1505421478995300544',        // Cargo provar associação (sócio)
    provarManto:            '1505431888796450967',         // Cargo provar manto (torcedor)
    reprovadoRecrutamento:  '1505422988453875852',
    visitante:              '1491907007182278819',
    diretor:                'ID_CARGO_DIRETOR',
    responsavelLoja:        '1505491739614642206',
    recrutador:             'ID_CARGO_RECRUTADOR',
    elenco:                 'ID_CARGO_ELENCO',
    // Cargos de advertência de membros [0] = 1ª adv, [1] = 2ª, [2] = 3ª
    adv: [
      'ID_CARGO_ADV_1',
      'ID_CARGO_ADV_2',
      'ID_CARGO_ADV_3',
    ],
    // Cargos de advertência de recrutadores
    advRec: [
      'ID_CARGO_ADV_REC_1',
      'ID_CARGO_ADV_REC_2',
      'ID_CARGO_ADV_REC_3',
    ],
  },

  // ── Hierarquia (exibida no /hierarquia) ──────────────────
  hierarquia: [
    { id: 'ID_CARGO_PRESIDENTE',   label: 'PRESIDENTE' },
    { id: 'ID_CARGO_VICE',         label: 'VICE PRESIDENTE' },
    { id: 'ID_CARGO_DIRETORIA',    label: 'DIRETORIA' },
    { id: 'ID_CARGO_RECRUTADOR',   label: 'EQUIPE RECRUTAMENTO' },
  ],

  // ── Categorias ────────────────────────────────────────────
  categoriaTickets: '1493453432898457671',  // Categoria ATENDIMENTO
  categoriaLoja:    '1493453830615076944',  // Categoria 🛒・LOJA

  // ── Textos da carteirinha ─────────────────────────────────
  carteirinha: {
    titulo:        'SEU SERVIDOR',
    subtitulo:     'NOME DA TORCIDA / GRUPO',
    presidente:    'NOME DO PRESIDENTE',
    fundacao:      'DD/MM/AAAA',
  },
};
