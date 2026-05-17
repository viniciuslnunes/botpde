// ============================================================
//  CONFIGURAÇÃO CENTRAL — preencha os IDs do seu servidor
// ============================================================

module.exports = {
  // ── Canais ────────────────────────────────────────────────
  canais: {
    recrutamento:       '1491920874805137559',        // Botão de solicitar recrutamento
    validarSetagem:     '1505410676993294448',         // Canal privado de análise (recrutadores)
    provarManto:        'ID_CANAL_PROVAR_MANTO',      // Candidato envia foto do manto
    carteirinha:        'ID_CANAL_CARTEIRINHA',       // Botão de solicitar carteirinha
    ticket:             'ID_CANAL_TICKET',            // Botão de abrir ticket
    logsTicket:         'ID_CANAL_LOGS_TICKET',       // Logs e transcritos de tickets
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
  },

  // ── Cargos ────────────────────────────────────────────────
  cargos: {
    socio:                  'ID_CARGO_SOCIO',
    provarManto:            'ID_CARGO_PROVAR_MANTO',
    reprovadoRecrutamento:  'ID_CARGO_REPROVADO_RECRUTAMENTO',
    visitante:              'ID_CARGO_VISITANTE',
    diretor:                'ID_CARGO_DIRETOR',
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

  // ── Categoria de tickets (Discord category ID) ───────────
  categoriaTickets: 'ID_CATEGORIA_TICKETS',

  // ── Textos da carteirinha ─────────────────────────────────
  carteirinha: {
    titulo:        'SEU SERVIDOR',
    subtitulo:     'NOME DA TORCIDA / GRUPO',
    presidente:    'NOME DO PRESIDENTE',
    fundacao:      'DD/MM/AAAA',
  },
};
