const {
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const path = require('path');

const config                  = require('../config');
const db                      = require('../utils/db');
const recrutamentoButtons     = require('../utils/recrutamentoButtons');
const { gerarCarteirinha }    = require('../utils/gerarCarteirinha');
const { atualizarMural }      = require('../utils/muralAssociados');
const { criarCanalTicket, gerarTranscript, CANAL_LOGS, LOGO_PATH, CATEGORIAS } = require('../utils/ticket');
const { atualizarTopRecrutadores } = require('../utils/topRecrutadores');
const { formatarNick }        = require('../utils/formatarNick');

const CARGOS_ADV     = config.cargos.adv;
const CARGOS_ADV_REC = config.cargos.advRec;
const CANAL_HISTORICO     = config.canais.historicoAdv;
const CANAL_HISTORICO_REC = config.canais.historicoAdvRec;

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    const client = interaction.client;

    try {

      // ══════════════════════════════════════════════════════
      //  TICKETS
      // ══════════════════════════════════════════════════════

      if (interaction.isButton() && interaction.customId === 'abrir_ticket') {
        const jaAberto = interaction.guild.channels.cache.find(
          c => c.name === `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)}`,
        );
        if (jaAberto) return interaction.reply({ content: `VOCÊ JÁ TEM UM TICKET ABERTO: ${jaAberto}`, flags: 64 });

        const select = new StringSelectMenuBuilder()
          .setCustomId('select_categoria_ticket')
          .setPlaceholder('SELECIONE A CATEGORIA DO SEU TICKET')
          .addOptions([
            { label: '🤝 PARCERIA',           value: 'parceria',         description: 'Propostas de parceria' },
            { label: '🚨 DENÚNCIA',           value: 'denuncia',         description: 'Denúncias gerais' },
            { label: '🔒 DENUNCIAR DIRETOR',  value: 'denuncia_diretor', description: 'Privado — diretores não visualizam' },
            { label: '📋 RECRUTAMENTO',       value: 'recrutamento',     description: 'Dúvidas sobre recrutamento' },
          ]);

        const row = new ActionRowBuilder().addComponents(select);
        return interaction.reply({ content: '**🎫 ABRIR TICKET** — SELECIONE A CATEGORIA:', components: [row], flags: 64 });
      }

      if (interaction.isStringSelectMenu() && interaction.customId === 'select_categoria_ticket') {
        const categoria = interaction.values[0];
        const info      = CATEGORIAS[categoria];
        await interaction.deferUpdate();

        const canal = await criarCanalTicket(interaction.guild, interaction.user, categoria);
        const avisoPrivado = categoria === 'denuncia_diretor'
          ? '\n> 🔒 ESTE TICKET É **PRIVADO** — MEMBROS COM CARGO DIRETOR NÃO TÊM ACESSO.'
          : '';

        const embed = new EmbedBuilder()
          .setColor(info.cor)
          .setTitle(`${info.emoji} TICKET CRIADO — ${info.label}`)
          .setDescription(`OLÁ ${interaction.user}, ESTE É O SEU TICKET. NOSSA EQUIPE VAI TE ATENDER EM BREVE.${avisoPrivado}`)
          .setFooter({ text: new Date().toLocaleString('pt-BR') });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('fechar_ticket').setLabel('🔒 FECHAR TICKET').setStyle(ButtonStyle.Danger),
        );

        await canal.send({
          content: `${interaction.user}`,
          embeds: [embed],
          components: [row],
          files: [{ attachment: LOGO_PATH, name: 'logo.png' }],
        });

        return interaction.editReply({ content: `🎫 TICKET CRIADO: ${canal}`, components: [] });
      }

      if (interaction.isButton() && interaction.customId === 'fechar_ticket') {
        const canal = interaction.channel;
        if (!canal.name.startsWith('ticket-')) return;

        await interaction.deferReply({ flags: 64 });
        await interaction.editReply({ content: '⏳ GERANDO TRANSCRIPT E FECHANDO TICKET...' });

        try {
          const html   = await gerarTranscript(canal);
          const buffer = Buffer.from(html, 'utf-8');
          const canalLogs = await client.channels.fetch(CANAL_LOGS).catch(() => null);
          if (canalLogs) {
            await canalLogs.send({
              content: `🎫 TICKET FECHADO: **${canal.name}** — FECHADO POR ${interaction.user}`,
              files: [{ attachment: buffer, name: `transcript-${canal.id}.html` }],
            });
          }
        } catch (err) {
          console.error('[ticket] Erro ao gerar transcript:', err);
        }

        await canal.delete().catch(() => {});
        return;
      }

      // ══════════════════════════════════════════════════════
      //  CARTEIRINHA
      // ══════════════════════════════════════════════════════

      if (interaction.isButton() && interaction.customId === 'solicitar_carteirinha') {
        await interaction.deferReply({ flags: 64 });

        const discordId = interaction.user.id;
        const membro    = interaction.member;
        const nome      = membro.nickname || interaction.user.displayName || interaction.user.username;

        let row;
        let isNovo = false;
        const existing = await db.query('SELECT * FROM socios WHERE discord_id = $1', [discordId]);

        if (existing.rows.length > 0) {
          row = existing.rows[0];
        } else {
          const maxResult    = await db.query('SELECT COALESCE(MAX(numero_socio), 0) AS max FROM socios');
          const proximoNumero = maxResult.rows[0].max + 1;
          const validade     = new Date();
          validade.setFullYear(validade.getFullYear() + 1);
          const insert = await db.query(
            'INSERT INTO socios (discord_id, numero_socio, nome, validade) VALUES ($1, $2, $3, $4) RETURNING *',
            [discordId, proximoNumero, nome, validade.toISOString().split('T')[0]],
          );
          row    = insert.rows[0];
          isNovo = true;
        }

        const dataValidade    = new Date(row.validade);
        const validadeFormatada = dataValidade.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
        const avatarUrl       = interaction.user.displayAvatarURL({ extension: 'png', size: 256 });

        let buffer;
        try {
          buffer = await gerarCarteirinha({ nome, numeroSocio: row.numero_socio, validade: validadeFormatada, avatarUrl });
        } catch (err) {
          console.error('[solicitar_carteirinha] Erro ao gerar imagem:', err);
          return interaction.editReply({ content: '❌ ERRO AO GERAR A CARTEIRINHA. TENTE NOVAMENTE.' });
        }

        await interaction.editReply({
          content: `🏆 SUA CARTEIRINHA DE SÓCIO Nº **${String(row.numero_socio).padStart(4, '0')}**!`,
          files: [{ attachment: buffer, name: 'carteirinha.png' }],
        });

        if (isNovo) atualizarMural(client).catch(err => console.error('[solicitar_carteirinha]', err));
        return;
      }

      // ══════════════════════════════════════════════════════
      //  BLOQUEAR ID
      // ══════════════════════════════════════════════════════

      if (interaction.isButton() && interaction.customId === 'abrir_bloquearid') {
        const modal = new ModalBuilder().setCustomId('modal_bloquearid').setTitle('Bloquear novo ID');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('id').setLabel('ID').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(10),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('motivo').setLabel('Motivo do bloqueio').setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(4).setMaxLength(200),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('prova').setLabel('Prova (link ou descrição)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(200),
          ),
        );
        return interaction.showModal(modal);
      }

      if (interaction.isModalSubmit() && interaction.customId === 'modal_bloquearid') {
        const id     = interaction.fields.getTextInputValue('id');
        const motivo = interaction.fields.getTextInputValue('motivo');
        const prova  = interaction.fields.getTextInputValue('prova') || null;

        const canal = interaction.guild.channels.cache.get(config.canais.historicoNaoRec);
        if (canal) {
          await canal.send({
            embeds: [{
              color: 0xFF0000,
              title: '🚫 ID BLOQUEADO',
              fields: [
                { name: 'ID', value: id, inline: true },
                { name: 'MOTIVO', value: motivo, inline: false },
                { name: 'PROVA', value: prova || 'NÃO INFORMADA', inline: false },
                { name: 'REGISTRADO POR', value: `<@${interaction.user.id}>`, inline: false },
                { name: 'DATA', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
              ],
            }],
          });
        }
        return interaction.reply({ content: `🚫 ID **${id}** bloqueado com sucesso.`, flags: 64 });
      }

      // ══════════════════════════════════════════════════════
      //  VALIDAR ID
      // ══════════════════════════════════════════════════════

      if (interaction.isButton() && interaction.customId === 'abrir_validarid') {
        const modal = new ModalBuilder().setCustomId('modal_validarid').setTitle('VALIDAR ID — NÃO RECRUTAR');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('id_fivem').setLabel('ID PARA VALIDAR').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(10),
          ),
        );
        return interaction.showModal(modal);
      }

      if (interaction.isModalSubmit() && interaction.customId === 'modal_validarid') {
        const idBusca = interaction.fields.getTextInputValue('id_fivem').trim();
        const canal   = interaction.guild.channels.cache.get(config.canais.historicoNaoRec);

        if (!canal) return interaction.reply({ content: '❌ Canal de histórico não configurado.', flags: 64 });

        await interaction.deferReply({ flags: 64 });
        const msgs = await canal.messages.fetch({ limit: 100 });
        let bloqueado = null;

        msgs.forEach(msg => {
          if (msg.embeds && msg.embeds.length > 0) {
            const embed = msg.embeds[0];
            const idField = embed.fields?.find(f => f.name === 'ID');
            if (idField && idField.value.trim() === idBusca) {
              bloqueado = embed;
            }
          }
        });

        if (bloqueado) {
          const motivoField = bloqueado.fields?.find(f => f.name === 'MOTIVO');
          return interaction.editReply({
            embeds: [{
              color: 0xFF0000,
              title: '🚫 ID BLOQUEADO — NÃO RECRUTAR',
              fields: bloqueado.fields ?? [],
            }],
          });
        }

        return interaction.editReply({ content: `✅ ID **${idBusca}** não encontrado na lista de bloqueados.` });
      }

      // ══════════════════════════════════════════════════════
      //  ADVERTÊNCIAS DE MEMBROS
      // ══════════════════════════════════════════════════════

      if (interaction.isButton() && interaction.customId === 'abrir_registrar_advertencia') {
        const row = new ActionRowBuilder().addComponents(
          new UserSelectMenuBuilder().setCustomId('select_membro_adv').setPlaceholder('SELECIONE O MEMBRO'),
        );
        return interaction.reply({ content: '**⛔ REGISTRAR ADVERTÊNCIA** — SELECIONE O MEMBRO:', components: [row], flags: 64 });
      }

      if (interaction.isUserSelectMenu() && interaction.customId === 'select_membro_adv') {
        const membroId = interaction.values[0];
        const row      = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`select_prazo_adv:${membroId}`)
            .setPlaceholder('SELECIONE O PRAZO DE PAGAMENTO')
            .addOptions([
              { label: '⚙️ TESTE (1 SEGUNDO)', value: 'test' },
              { label: '1 DIA',  value: '1' },
              { label: '2 DIAS', value: '2' },
              { label: '3 DIAS', value: '3' },
            ]),
        );
        return interaction.reply({ content: '**⛔ REGISTRAR ADVERTÊNCIA** — SELECIONE O PRAZO:', components: [row], flags: 64 });
      }

      if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select_prazo_adv:')) {
        const membroId = interaction.customId.split(':')[1];
        const prazo    = interaction.values[0];
        const modal    = new ModalBuilder()
          .setCustomId(`modal_registrar_advertencia:${membroId}:${prazo}`)
          .setTitle('REGISTRAR ADVERTÊNCIA');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('motivo').setLabel('MOTIVO DA ADVERTÊNCIA').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(300),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('punicao').setLabel('PUNIÇÃO APLICADA').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('prova').setLabel('PROVA (OPCIONAL — LINK OU DESCRIÇÃO)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(200),
          ),
        );
        return interaction.showModal(modal);
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_registrar_advertencia:')) {
        const parts      = interaction.customId.split(':');
        const membroId   = parts[1];
        const prazoRaw   = parts[2];
        const isTeste    = prazoRaw === 'test';
        const prazoNum   = isTeste ? 0 : parseInt(prazoRaw);
        const prazoMs    = isTeste ? 1000 : prazoNum * 24 * 60 * 60 * 1000;
        const prazoLabel = isTeste ? '⚙️ TESTE (1 SEGUNDO)' : prazoNum === 1 ? '1 DIA' : `${prazoNum} DIAS`;
        const motivo     = interaction.fields.getTextInputValue('motivo');
        const punicao    = interaction.fields.getTextInputValue('punicao');
        const prova      = interaction.fields.getTextInputValue('prova') || null;

        let membro;
        try {
          membro = await interaction.guild.members.fetch(membroId);
        } catch {
          return interaction.reply({ content: '❌ Membro não encontrado.', flags: 64 });
        }

        // Determinar próxima advertência disponível
        const proximaAdv = CARGOS_ADV.findIndex(id => !membro.roles.cache.has(id));
        if (proximaAdv === -1) {
          return interaction.reply({ content: `⚠️ ${membro} já possui o máximo de advertências.`, flags: 64 });
        }

        await membro.roles.add(CARGOS_ADV[proximaAdv]);

        const numAdv   = proximaAdv + 1;
        const expiraEm = isTeste ? Math.floor(Date.now() / 1000) + 1 : Math.floor(Date.now() / 1000) + prazoNum * 86400;

        const embed = {
          color: 0xFF0000,
          title: `⛔ ${numAdv}ª ADVERTÊNCIA REGISTRADA`,
          fields: [
            { name: 'MEMBRO',             value: `<@${membro.id}>`,           inline: true },
            { name: 'ADVERTÊNCIA',        value: `${numAdv}ª`,                inline: true },
            { name: 'MOTIVO',             value: motivo,                      inline: false },
            { name: 'PUNIÇÃO',            value: punicao,                     inline: false },
            { name: 'PRAZO DE PAGAMENTO', value: `${prazoLabel} — <t:${expiraEm}:F>`, inline: false },
            { name: 'PROVA',              value: prova || 'NÃO INFORMADA',    inline: false },
            { name: 'REGISTRADO POR',     value: `<@${interaction.user.id}>`, inline: false },
            { name: 'DATA',               value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
          ],
          footer: { text: '⚠️ O NÃO PAGAMENTO DENTRO DO PRAZO RESULTARÁ NA PERDA AUTOMÁTICA DO CARGO DE SÓCIO.' },
        };

        const canalHistorico = interaction.guild.channels.cache.get(CANAL_HISTORICO);
        if (canalHistorico) await canalHistorico.send({ embeds: [embed] });

        await interaction.reply({
          content: `⛔ **${numAdv}ª ADVERTÊNCIA** REGISTRADA PARA ${membro}. PRAZO: **${prazoLabel}** (<t:${expiraEm}:F>).`,
          flags: 64,
        });

        // Remoção automática de cargo ao vencer prazo
        const guild = interaction.guild;
        setTimeout(async () => {
          try {
            const membroAtual = await guild.members.fetch(membroId).catch(() => null);
            if (!membroAtual) return;
            if (membroAtual.roles.cache.has(CARGOS_ADV[proximaAdv])) {
              await membroAtual.roles.remove(CARGOS_ADV[proximaAdv]);
              // Remove cargo de sócio se for a 1ª adv não paga
              if (config.cargos.socio) await membroAtual.roles.remove(config.cargos.socio).catch(() => {});
              const canalHist = guild.channels.cache.get(CANAL_HISTORICO);
              if (canalHist) {
                await canalHist.send({ embeds: [{
                  color: 0xFF0000,
                  title: `⏰ ${numAdv}ª ADVERTÊNCIA VENCIDA — CARGO REMOVIDO`,
                  fields: [
                    { name: 'MEMBRO', value: `<@${membroId}>`, inline: true },
                    { name: 'PRAZO', value: `${prazoLabel} (VENCIDO)`, inline: false },
                    { name: 'AÇÃO', value: 'CARGO DE SÓCIO REMOVIDO AUTOMATICAMENTE', inline: false },
                  ],
                }] });
              }
            }
          } catch (err) {
            console.error('[adv] Erro ao processar vencimento:', err);
          }
        }, prazoMs);

        return;
      }

      if (interaction.isButton() && interaction.customId === 'abrir_remover_advertencia') {
        const row = new ActionRowBuilder().addComponents(
          new UserSelectMenuBuilder().setCustomId('select_membro_remover_adv').setPlaceholder('SELECIONE O MEMBRO'),
        );
        return interaction.reply({ content: '**🦅 REMOVER ADVERTÊNCIA** — SELECIONE O MEMBRO:', components: [row], flags: 64 });
      }

      if (interaction.isUserSelectMenu() && interaction.customId === 'select_membro_remover_adv') {
        const membroId = interaction.values[0];
        const modal    = new ModalBuilder()
          .setCustomId(`modal_remover_advertencia:${membroId}`)
          .setTitle('REMOVER ADVERTÊNCIA');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('motivo').setLabel('MOTIVO DA REMOÇÃO').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(300),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('prova').setLabel('PROVA (OPCIONAL)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(200),
          ),
        );
        return interaction.showModal(modal);
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_remover_advertencia:')) {
        const membroId = interaction.customId.split(':')[1];
        const motivo   = interaction.fields.getTextInputValue('motivo');
        const prova    = interaction.fields.getTextInputValue('prova') || null;

        let membro;
        try {
          membro = await interaction.guild.members.fetch(membroId);
        } catch {
          return interaction.reply({ content: '❌ Membro não encontrado.', flags: 64 });
        }

        // Encontra a advertência mais alta
        let advAtual = -1;
        for (let i = CARGOS_ADV.length - 1; i >= 0; i--) {
          if (membro.roles.cache.has(CARGOS_ADV[i])) { advAtual = i; break; }
        }

        if (advAtual === -1) {
          return interaction.reply({ content: `⚠️ ${membro} NÃO POSSUI NENHUMA ADVERTÊNCIA REGISTRADA.`, flags: 64 });
        }

        await membro.roles.remove(CARGOS_ADV[advAtual]);
        if (advAtual > 0) await membro.roles.add(CARGOS_ADV[advAtual - 1]);

        const numAdv = advAtual + 1;
        const embed  = {
          color: 0x00FF00,
          title: `✅ ${numAdv}ª ADVERTÊNCIA REMOVIDA`,
          fields: [
            { name: 'MEMBRO',       value: `<@${membro.id}>`,           inline: true },
            { name: 'ADVERTÊNCIA',  value: `${numAdv}ª`,                inline: true },
            { name: 'MOTIVO',       value: motivo,                      inline: false },
            { name: 'PROVA',        value: prova || 'NÃO INFORMADA',    inline: false },
            { name: 'REMOVIDO POR', value: `<@${interaction.user.id}>`, inline: false },
            { name: 'DATA',         value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
          ],
        };

        const canalHistorico = interaction.guild.channels.cache.get(CANAL_HISTORICO);
        if (canalHistorico) await canalHistorico.send({ embeds: [embed] });

        return interaction.reply({ content: `✅ **${numAdv}ª ADVERTÊNCIA** REMOVIDA DE ${membro}.`, flags: 64 });
      }

      // ══════════════════════════════════════════════════════
      //  ADVERTÊNCIAS DE RECRUTADORES
      // ══════════════════════════════════════════════════════

      if (interaction.isButton() && interaction.customId === 'abrir_registrar_adv_rec') {
        const row = new ActionRowBuilder().addComponents(
          new UserSelectMenuBuilder().setCustomId('select_membro_adv_rec_registrar').setPlaceholder('SELECIONE O RECRUTADOR'),
        );
        return interaction.reply({ content: '**⛔ REGISTRAR ADV. RECRUTADOR** — SELECIONE O MEMBRO:', components: [row], flags: 64 });
      }

      if (interaction.isUserSelectMenu() && interaction.customId === 'select_membro_adv_rec_registrar') {
        const membroId = interaction.values[0];
        const row      = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`select_prazo_adv_rec:${membroId}`)
            .setPlaceholder('SELECIONE O PRAZO DE PAGAMENTO')
            .addOptions([
              { label: '⚙️ TESTE (1 SEGUNDO)', value: 'test' },
              { label: '1 DIA',  value: '1' },
              { label: '2 DIAS', value: '2' },
              { label: '3 DIAS', value: '3' },
            ]),
        );
        return interaction.reply({ content: '**⛔ REGISTRAR ADV. RECRUTADOR** — SELECIONE O PRAZO:', components: [row], flags: 64 });
      }

      if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select_prazo_adv_rec:')) {
        const membroId = interaction.customId.split(':')[1];
        const prazo    = interaction.values[0];
        const modal    = new ModalBuilder()
          .setCustomId(`modal_registrar_adv_rec:${membroId}:${prazo}`)
          .setTitle('REGISTRAR ADV. RECRUTADOR');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('motivo').setLabel('MOTIVO').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(300),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('punicao').setLabel('PUNIÇÃO APLICADA').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('prova').setLabel('PROVA (OPCIONAL)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(200),
          ),
        );
        return interaction.showModal(modal);
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_registrar_adv_rec:')) {
        const parts      = interaction.customId.split(':');
        const membroId   = parts[1];
        const prazoRaw   = parts[2];
        const isTeste    = prazoRaw === 'test';
        const prazoNum   = isTeste ? 0 : parseInt(prazoRaw);
        const prazoMs    = isTeste ? 1000 : prazoNum * 24 * 60 * 60 * 1000;
        const prazoLabel = isTeste ? '⚙️ TESTE (1 SEGUNDO)' : prazoNum === 1 ? '1 DIA' : `${prazoNum} DIAS`;
        const motivo     = interaction.fields.getTextInputValue('motivo');
        const punicao    = interaction.fields.getTextInputValue('punicao');
        const prova      = interaction.fields.getTextInputValue('prova') || null;

        let membro;
        try {
          membro = await interaction.guild.members.fetch(membroId);
        } catch {
          return interaction.reply({ content: '❌ Membro não encontrado.', flags: 64 });
        }

        const proximaAdv = CARGOS_ADV_REC.findIndex(id => !membro.roles.cache.has(id));
        if (proximaAdv === -1) {
          return interaction.reply({ content: `⚠️ ${membro} já possui o máximo de advertências de recrutador.`, flags: 64 });
        }

        await membro.roles.add(CARGOS_ADV_REC[proximaAdv]);

        const numAdv   = proximaAdv + 1;
        const expiraEm = isTeste ? Math.floor(Date.now() / 1000) + 1 : Math.floor(Date.now() / 1000) + prazoNum * 86400;

        const embed = {
          color: 0xFF0000,
          title: `❌ ADV. RECRUTAMENTO ${numAdv}ª REGISTRADA`,
          fields: [
            { name: 'RECRUTADOR',         value: `<@${membro.id}>`,           inline: true },
            { name: 'ADVERTÊNCIA',        value: `${numAdv}ª`,                inline: true },
            { name: 'MOTIVO',             value: motivo,                      inline: false },
            { name: 'PUNIÇÃO',            value: punicao,                     inline: false },
            { name: 'PRAZO DE PAGAMENTO', value: `${prazoLabel} — <t:${expiraEm}:F>`, inline: false },
            { name: 'PROVA',              value: prova || 'NÃO INFORMADA',    inline: false },
            { name: 'REGISTRADO POR',     value: `<@${interaction.user.id}>`, inline: false },
            { name: 'DATA',               value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
          ],
          footer: { text: '⚠️ O NÃO PAGAMENTO DENTRO DO PRAZO RESULTARÁ NA PERDA DO CARGO DE RECRUTADOR.' },
        };

        const canalHistRec = interaction.guild.channels.cache.get(CANAL_HISTORICO_REC);
        if (canalHistRec) await canalHistRec.send({ embeds: [embed] });

        await interaction.reply({
          content: `⛔ **${numAdv}ª ADVERTÊNCIA DE RECRUTAMENTO** REGISTRADA PARA ${membro}. PRAZO: **${prazoLabel}** (<t:${expiraEm}:F>).`,
          flags: 64,
        });

        const guild = interaction.guild;
        setTimeout(async () => {
          try {
            const membroAtual = await guild.members.fetch(membroId).catch(() => null);
            if (!membroAtual) return;
            if (membroAtual.roles.cache.has(CARGOS_ADV_REC[proximaAdv])) {
              await membroAtual.roles.remove(CARGOS_ADV_REC[proximaAdv]);
              if (config.cargos.recrutador) await membroAtual.roles.remove(config.cargos.recrutador).catch(() => {});
              const canalH = guild.channels.cache.get(CANAL_HISTORICO_REC);
              if (canalH) {
                await canalH.send({ embeds: [{
                  color: 0xFF0000,
                  title: `⏰ ${numAdv}ª ADV. RECRUTAMENTO VENCIDA`,
                  fields: [
                    { name: 'RECRUTADOR', value: `<@${membroId}>`, inline: true },
                    { name: 'PRAZO', value: `${prazoLabel} (VENCIDO)`, inline: false },
                    { name: 'AÇÃO', value: 'CARGO DE RECRUTADOR REMOVIDO AUTOMATICAMENTE', inline: false },
                  ],
                }] });
              }
            }
          } catch (err) {
            console.error('[adv_rec] Erro ao processar vencimento:', err);
          }
        }, prazoMs);

        return;
      }

      if (interaction.isButton() && interaction.customId === 'abrir_remover_adv_rec') {
        const row = new ActionRowBuilder().addComponents(
          new UserSelectMenuBuilder().setCustomId('select_membro_adv_rec_remover').setPlaceholder('SELECIONE O RECRUTADOR'),
        );
        return interaction.reply({ content: '**🦅 REMOVER ADV. RECRUTADOR** — SELECIONE O MEMBRO:', components: [row], flags: 64 });
      }

      if (interaction.isUserSelectMenu() && interaction.customId === 'select_membro_adv_rec_remover') {
        const membroId = interaction.values[0];
        const modal    = new ModalBuilder()
          .setCustomId(`modal_remover_adv_rec:${membroId}`)
          .setTitle('REMOVER ADV. RECRUTADOR');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('motivo').setLabel('MOTIVO DA REMOÇÃO').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(300),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('prova').setLabel('PROVA (OPCIONAL)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(200),
          ),
        );
        return interaction.showModal(modal);
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_remover_adv_rec:')) {
        const membroId = interaction.customId.split(':')[1];
        const motivo   = interaction.fields.getTextInputValue('motivo');
        const prova    = interaction.fields.getTextInputValue('prova') || null;

        let membro;
        try {
          membro = await interaction.guild.members.fetch(membroId);
        } catch {
          return interaction.reply({ content: '❌ Membro não encontrado.', flags: 64 });
        }

        let advAtual = -1;
        for (let i = CARGOS_ADV_REC.length - 1; i >= 0; i--) {
          if (membro.roles.cache.has(CARGOS_ADV_REC[i])) { advAtual = i; break; }
        }

        if (advAtual === -1) {
          return interaction.reply({ content: `⚠️ ${membro} NÃO POSSUI NENHUMA ADVERTÊNCIA REGISTRADA.`, flags: 64 });
        }

        await membro.roles.remove(CARGOS_ADV_REC[advAtual]);
        if (advAtual > 0) await membro.roles.add(CARGOS_ADV_REC[advAtual - 1]);

        const numAdv = advAtual + 1;
        const embed  = {
          color: 0x00FF00,
          title: `🦅 ADV. RECRUTAMENTO ${numAdv}ª REMOVIDA`,
          fields: [
            { name: 'RECRUTADOR',       value: `<@${membro.id}>`,           inline: true },
            { name: 'ADVERTÊNCIA',      value: `${numAdv}ª`,                inline: true },
            { name: 'MOTIVO',           value: motivo,                      inline: false },
            { name: 'PROVA',            value: prova || 'NÃO INFORMADA',    inline: false },
            { name: 'REMOVIDO POR',     value: `<@${interaction.user.id}>`, inline: false },
            { name: 'DATA',             value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
          ],
        };

        const canalHistRec = interaction.guild.channels.cache.get(CANAL_HISTORICO_REC);
        if (canalHistRec) await canalHistRec.send({ embeds: [embed] });

        return interaction.reply({ content: `🦅 **${numAdv}ª ADVERTÊNCIA DE RECRUTAMENTO** REMOVIDA DE ${membro}.`, flags: 64 });
      }

      // ══════════════════════════════════════════════════════
      //  RECRUTAMENTO
      // ══════════════════════════════════════════════════════

      if (interaction.isButton() && interaction.customId === 'abrir_recrutamento') {
        const modal = new ModalBuilder().setCustomId('modal_recrutamento').setTitle('Formulário de Recrutamento');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('nome').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(2).setMaxLength(16),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('idade').setLabel('Idade (apenas números)').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(2),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('id_fivem').setLabel('ID (apenas números)').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(6),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('telefone').setLabel('Telefone (apenas números, ex: 11912345678)').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(10).setMaxLength(11),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('recrutador').setLabel('Recrutador').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(2).setMaxLength(32),
          ),
        );
        return interaction.showModal(modal);
      }

      if (interaction.isModalSubmit() && interaction.customId === 'modal_recrutamento') {
        const nome      = interaction.fields.getTextInputValue('nome');
        const idade     = interaction.fields.getTextInputValue('idade');
        const id_fivem  = interaction.fields.getTextInputValue('id_fivem');
        const telefone  = interaction.fields.getTextInputValue('telefone');
        const recrutador = interaction.fields.getTextInputValue('recrutador');
        const user      = interaction.user;

        if (!/^[0-9]+$/.test(id_fivem)) {
          return interaction.reply({ embeds: [{ color: 0x000000, description: '⚠️ **ERRO:** O CAMPO **ID** DEVE CONTER APENAS NÚMEROS.' }], flags: 64 });
        }
        if (!/^[0-9]{1,2}$/.test(idade)) {
          return interaction.reply({ embeds: [{ color: 0x000000, description: '⚠️ **ERRO:** O CAMPO **IDADE** DEVE CONTER APENAS NÚMEROS (máx. 2 dígitos).' }], flags: 64 });
        }
        if (!/^[0-9]{10,11}$/.test(telefone)) {
          return interaction.reply({ embeds: [{ color: 0x000000, description: '⚠️ **ERRO:** O CAMPO **TELEFONE** DEVE CONTER APENAS NÚMEROS, COM 10 OU 11 DÍGITOS.' }], flags: 64 });
        }

        const embed = {
          color: 0x000000,
          title: '📋 NOVA SOLICITAÇÃO DE RECRUTAMENTO',
          fields: [
            { name: 'NOME',      value: nome,      inline: false },
            { name: 'IDADE',     value: idade,      inline: false },
            { name: 'ID',        value: id_fivem,   inline: false },
            { name: 'TELEFONE',  value: telefone,   inline: false },
            { name: 'RECRUTADOR', value: recrutador, inline: false },
            { name: 'ID | DISCORD', value: `${user.id} | <@${user.id}>`, inline: false },
          ],
        };

        await interaction.reply({ content: 'SUA SOLICITAÇÃO FOI ENVIADA PARA ANÁLISE! AGUARDE AS PRÓXIMAS INSTRUÇÕES.', flags: 64 });

        const canalValidar = interaction.guild.channels.cache.get(config.canais.validarSetagem);
        if (canalValidar) {
          await canalValidar.send({ embeds: [embed], components: recrutamentoButtons });
        }

        // Atribuir cargo provar-manto
        try {
          const guildMember = await interaction.guild.members.fetch(user.id);
          await guildMember.roles.add(config.cargos.provarManto);

          const canalProvarManto = interaction.guild.channels.cache.get(config.canais.provarManto);
          if (canalProvarManto) {
            const avisoMsg = await canalProvarManto.send({
              content: `<@${user.id}>, você tem 10 minutos para enviar o manto (imagem) aqui neste canal! Após esse prazo, o cargo será removido automaticamente.`,
            });
            setTimeout(() => { avisoMsg.delete().catch(() => {}); }, 5 * 60 * 1000);
          }

          setTimeout(async () => {
            try {
              await guildMember.roles.remove(config.cargos.provarManto);
            } catch (err) {
              console.error('[recrutamento] Erro ao remover cargo provarManto:', err);
            }
          }, 10 * 60 * 1000);
        } catch (err) {
          console.error('[recrutamento] Erro ao atribuir cargo provarManto:', err);
        }

        return;
      }

      if (interaction.isButton() && interaction.customId === 'aprovar_recrutamento') {
        const embed    = interaction.message.embeds[0];
        const idField  = embed.fields.find(f => f.name.startsWith('ID | DISCORD'));
        const candidatoId = idField ? idField.value.split(' ')[0] : null;
        const nomeField   = embed.fields.find(f => f.name === 'NOME');
        const idFiveMField = embed.fields.find(f => f.name === 'ID');
        const nome    = nomeField    ? nomeField.value    : '';
        const id_fivem = idFiveMField ? idFiveMField.value : '';

        // Verificar se ID está bloqueado
        const canalHistorico = interaction.guild.channels.cache.get(config.canais.historicoNaoRec);
        let bloqueado = null;
        if (canalHistorico && canalHistorico.isTextBased()) {
          try {
            const msgs = await canalHistorico.messages.fetch({ limit: 100 });
            msgs.forEach(msg => {
              if (msg.embeds && msg.embeds.length > 0) {
                const e = msg.embeds[0];
                const idF = e.fields?.find(f => f.name === 'ID');
                if (idF && idF.value.trim() === id_fivem.trim()) bloqueado = e;
              }
            });
          } catch {}
        }

        if (bloqueado) {
          return interaction.update({
            content: null,
            embeds: [{
              color: 0xFF0000,
              title: '🚫 CANDIDATO BLOQUEADO — NÃO RECRUTAR',
              description: `O ID **${id_fivem}** está na lista de não recrutar. Aprovação cancelada.`,
              fields: bloqueado.fields ?? [],
            }],
            components: [],
          });
        }

        const embedAprovado = {
          color: 0x00FF00,
          title: '✅ RECRUTAMENTO APROVADO',
          fields: embed.fields,
          footer: { text: `Aprovado por ${interaction.user.tag}` },
        };

        try {
          if (candidatoId) {
            const guildMember = await interaction.guild.members.fetch(candidatoId);
            await guildMember.roles.add(config.cargos.socio);
            if (config.cargos.provarManto) await guildMember.roles.remove(config.cargos.provarManto).catch(() => {});
            if (config.cargos.visitante)   await guildMember.roles.remove(config.cargos.visitante).catch(() => {});
            const novoNick = formatarNick(nome, id_fivem);
            await guildMember.setNickname(novoNick).catch(() => {});
            await db.query('INSERT INTO aprovacoes_recrutamento (aprovador_id) VALUES ($1)', [interaction.user.id]);
            atualizarTopRecrutadores(client).catch(err => console.error('[aprovar]', err));
          }
        } catch (err) {
          console.error('[aprovar] Erro:', err);
        }

        return interaction.update({ content: null, embeds: [embedAprovado], components: [] });
      }

      if (interaction.isButton() && interaction.customId === 'reprovar_recrutamento') {
        const embed       = interaction.message.embeds[0];
        const idField     = embed.fields.find(f => f.name.startsWith('ID | DISCORD'));
        const candidatoId = idField ? idField.value.split(' ')[0] : null;

        try {
          if (candidatoId) {
            const guildMember = await interaction.guild.members.fetch(candidatoId).catch(() => null);
            if (guildMember) {
              if (config.cargos.reprovadoRecrutamento) await guildMember.roles.add(config.cargos.reprovadoRecrutamento).catch(() => {});
              if (config.cargos.provarManto)           await guildMember.roles.remove(config.cargos.provarManto).catch(() => {});
            }
          }
        } catch {}

        const embedReprovado = {
          color: 0xFF0000,
          title: '❌ RECRUTAMENTO REPROVADO',
          fields: embed.fields,
          footer: { text: `Reprovado por ${interaction.user.tag}` },
        };

        return interaction.update({ content: null, embeds: [embedReprovado], components: [] });
      }

      // ══════════════════════════════════════════════════════
      //  EVENTO
      // ══════════════════════════════════════════════════════

      if (interaction.isModalSubmit() && interaction.customId === 'modal_evento') {
        const titulo  = interaction.fields.getTextInputValue('titulo');
        const horario = interaction.fields.getTextInputValue('horario');

        const instrucoes = `✅ para **confirmar** presença   ❌ para **recusar**`;

        const embed = new EmbedBuilder()
          .setColor(0x000000)
          .setTitle(`📅 ${titulo}`)
          .setDescription(instrucoes)
          .addFields(
            { name: 'Horário', value: horario, inline: true },
            { name: '✅ Confirmados (0)', value: '*nenhum*', inline: true },
            { name: '❌ Recusados (0)',  value: '*nenhum*', inline: true },
          )
          .setFooter({ text: 'evento' })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        const msg = await interaction.fetchReply();
        await msg.react('✅');
        await msg.react('❌');
        return;
      }

      // ══════════════════════════════════════════════════════
      //  SLASH COMMANDS
      // ══════════════════════════════════════════════════════

      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try {
          await command.execute(interaction);
        } catch (err) {
          if (err.code === 10062 || err.code === 40060) return;
          console.error(`[slash] Erro no comando "${interaction.commandName}":`, err);
          const msg = { content: 'ERRO AO EXECUTAR COMANDO.', flags: 64 };
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(msg).catch(() => {});
          } else {
            await interaction.reply(msg).catch(() => {});
          }
        }
      }

    } catch (err) {
      console.error('[interactionCreate] Erro inesperado:', err);
    }
  },
};

