const { PermissionFlagsBits } = require('discord.js');
const path = require('path');
const config = require('../config');

const CANAL_LOGS  = config.canais.logsTicket;
const LOGO_PATH   = path.join(__dirname, '../../img/logo.png');
const CARGO_DIRETOR = config.cargos.diretor;

const CATEGORIAS = {
  parceria:         { label: '🤝 PARCERIA',           emoji: '🤝', cor: 0x000000 },
  denuncia:         { label: '🚨 DENUNCIAR MEMBRO',   emoji: '🚨', cor: 0x000000 },
  denuncia_diretor: { label: '🔒 DENUNCIAR DIRETOR',  emoji: '🔒', cor: 0x000000 },
  recrutamento:     { label: '📋 RECRUTAMENTO',       emoji: '📋', cor: 0x000000 },
};

function nomeCanalTicket(user) {
  return `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)}`;
}

async function criarCanalTicket(guild, user, categoria = 'geral') {
  const info       = CATEGORIAS[categoria] ?? { label: categoria, cor: 0x000000 };
  const nomeCanal  = nomeCanalTicket(user);
  const categoria_id = config.categoriaTickets;

  const permissoes = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];

  // Diretores não veem tickets de denúncia a diretores
  if (categoria === 'denuncia_diretor' && CARGO_DIRETOR !== 'ID_CARGO_DIRETOR') {
    permissoes.push({ id: CARGO_DIRETOR, deny: [PermissionFlagsBits.ViewChannel] });
  }

  const canal = await guild.channels.create({
    name: nomeCanal,
    parent: categoria_id !== 'ID_CATEGORIA_TICKETS' ? categoria_id : undefined,
    permissionOverwrites: permissoes,
    topic: `Ticket de ${user.tag} — ${info.label}`,
  });

  return canal;
}

async function gerarTranscript(canal) {
  const msgs = await canal.messages.fetch({ limit: 100 });
  const sorted = [...msgs.values()].reverse();

  const linhas = sorted.map(m => {
    const hora  = new Date(m.createdTimestamp).toLocaleString('pt-BR');
    const autor = m.author.tag;
    const texto = m.content || '';
    const anexos = m.attachments.map(a => `<a href="${a.url}">[Anexo: ${a.name}]</a>`).join(' ');
    return `<p><b>[${hora}] ${autor}:</b> ${texto} ${anexos}</p>`;
  });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Transcript — ${canal.name}</title>
<style>body{font-family:sans-serif;padding:16px;background:#36393f;color:#dcddde}p{margin:4px 0}b{color:#fff}a{color:#00b0f4}</style></head>
<body><h2>Transcript — ${canal.name}</h2>${linhas.join('\n')}</body></html>`;
}

module.exports = { criarCanalTicket, gerarTranscript, CANAL_LOGS, LOGO_PATH, CATEGORIAS };
