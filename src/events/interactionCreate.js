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
const { listarProdutos, buscarProduto, adicionarProduto, atualizarProduto, removerProduto, registrarPedido, decrementarEstoque, formatarEstoque, tamanhoDisponiveis } = require('../utils/loja');
const pendingProdutos = require('../utils/pendingProdutos');

// ── Monta array de embeds em carrossel (até 4 imagens) ────────────────────────
// Retorna { embeds, files } — files contém Buffers quando dados são base64
function carrosselEmbeds(embedBase, imagem_url) {
  if (!imagem_url) return { embeds: [embedBase], files: [] };
  const items = imagem_url.split(',').map(s => s.trim()).filter(Boolean).slice(0, 4);
  if (!items.length) return { embeds: [embedBase], files: [] };

  const isUrl = items[0].startsWith('http');
  if (isUrl) {
    // Compatibilidade com registros antigos que tinham URL (podem estar expirados)
    if (items.length === 1) return { embeds: [{ ...embedBase, image: { url: items[0] } }], files: [] };
    const ANCHOR = 'https://discord.com/channels/@me';
    const embeds = [{ ...embedBase, url: ANCHOR, image: { url: items[0] } }];
    for (let i = 1; i < items.length; i++) embeds.push({ color: embedBase.color ?? 0, url: ANCHOR, image: { url: items[i] } });
    return { embeds, files: [] };
  }

  // Dados em base64 — cria Buffers e envia como attachment para nunca expirarem
  const files = items.map((b64, i) => ({ attachment: Buffer.from(b64, 'base64'), name: `imagem${i + 1}.png` }));
  if (items.length === 1) return { embeds: [{ ...embedBase, image: { url: 'attachment://imagem1.png' } }], files };
  const ANCHOR = 'https://discord.com/channels/@me';
  const embeds = [{ ...embedBase, url: ANCHOR, image: { url: 'attachment://imagem1.png' } }];
  for (let i = 1; i < items.length; i++) embeds.push({ color: embedBase.color ?? 0, url: ANCHOR, image: { url: `attachment://imagem${i + 1}.png` } });
  return { embeds, files };
}

const CARGOS_ADV     = config.cargos.adv;
const CARGOS_ADV_REC = config.cargos.advRec;
const CANAL_HISTORICO     = config.canais.historicoAdv;
const CANAL_HISTORICO_REC = config.canais.historicoAdvRec;

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    const client = interaction.client;

    // Ignora interações já expiradas (pode ocorrer com múltiplas instâncias rodando)
    if (!interaction.isRepliable?.()) return;

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

        const fs = require('node:fs');
        const payloadTicket = { content: `${interaction.user}`, embeds: [embed], components: [row] };
        if (fs.existsSync(LOGO_PATH)) payloadTicket.files = [{ attachment: LOGO_PATH, name: 'logo.png' }];
        await canal.send(payloadTicket);

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
      //  LOJA
      // ══════════════════════════════════════════════════════

      if (interaction.isButton() && interaction.customId === 'abrir_loja') {
        const produtos = await listarProdutos(true).catch(() => []);
        if (!produtos.length) {
          return interaction.reply({ content: '🛒 Nenhum produto disponível no momento.', flags: 64 });
        }
        const select = new StringSelectMenuBuilder()
          .setCustomId('select_produto_loja')
          .setPlaceholder('SELECIONE O PRODUTO')
          .addOptions(produtos.slice(0, 25).map(p => ({
            label: p.nome,
            description: `R$ ${Number(p.preco).toFixed(2)}`,
            value: String(p.id),
          })));
        return interaction.reply({
          embeds: [{ color: 0x000000, title: '🛒 LOJA — PRODUTOS DISPONÍVEIS', description: 'Selecione o produto desejado abaixo:' }],
          components: [new ActionRowBuilder().addComponents(select)],
          flags: 64,
        });
      }

      if (interaction.isStringSelectMenu() && interaction.customId === 'select_produto_loja') {
        const produtoId = interaction.values[0];
        const produto   = await buscarProduto(produtoId).catch(() => null);
        if (!produto) return interaction.update({ content: '❌ PRODUTO NÃO ENCONTRADO.', components: [], embeds: [] });

        const disponiveis = tamanhoDisponiveis(produto.estoque);
        if (!disponiveis.length) return interaction.update({ content: '❌ PRODUTO SEM ESTOQUE NO MOMENTO.', components: [], embeds: [] });

        // Produto sem tamanho — pula select e abre modal de pedido direto
        if (disponiveis.length === 1 && disponiveis[0] === 'UN') {
          const modal = new ModalBuilder()
            .setCustomId(`modal_pedido_loja:${produtoId}:UN`)
            .setTitle('FINALIZAR PEDIDO');
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('quantidade').setLabel('QUANTIDADE').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('1').setMaxLength(3),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('obs').setLabel('OBSERVAÇÕES (opcional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300),
            ),
          );
          return interaction.showModal(modal);
        }

        const select   = new StringSelectMenuBuilder()
          .setCustomId(`select_tamanho_loja:${produtoId}`)
          .setPlaceholder('SELECIONE O TAMANHO')
          .addOptions(disponiveis.map(t => ({ label: `${t.toUpperCase()} (${produto.estoque[t]} un.)`, value: t })));

        const embedProduto = {
          color: 0x000000,
          title: produto.nome.toUpperCase(),
          fields: [
            { name: 'PREÇO',   value: `R$ ${Number(produto.preco).toFixed(2)}`, inline: true },
            { name: 'ESTOQUE', value: formatarEstoque(produto.estoque),          inline: false },
          ],
          description: 'SELECIONE O TAMANHO ABAIXO:',
        };

        return interaction.update({
          ...carrosselEmbeds(embedProduto, produto.imagem_url),
          components: [new ActionRowBuilder().addComponents(select)],
        });
      }

      if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select_tamanho_loja:')) {
        const produtoId = interaction.customId.split(':')[1];
        const tamanho   = interaction.values[0];
        const produto   = await buscarProduto(produtoId).catch(() => null);
        if (!produto) return interaction.update({ content: '❌ Produto não encontrado.', components: [], embeds: [] });

        const modal = new ModalBuilder()
          .setCustomId(`modal_pedido_loja:${produtoId}:${tamanho}`)
          .setTitle('FINALIZAR PEDIDO');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('quantidade').setLabel('QUANTIDADE').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('1').setMaxLength(3),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('obs').setLabel('OBSERVAÇÕES (opcional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300),
          ),
        );
        return interaction.showModal(modal);
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_pedido_loja:')) {
        const [, produtoId, tamanho] = interaction.customId.split(':');
        const qtdStr   = interaction.fields.getTextInputValue('quantidade');
        const obs      = interaction.fields.getTextInputValue('obs') || null;
        const qtd      = parseInt(qtdStr);
        if (isNaN(qtd) || qtd < 1 || qtd > 100) {
          return interaction.reply({ content: '❌ Quantidade inválida (mín. 1, máx. 100).', flags: 64 });
        }

        const produto = await buscarProduto(produtoId).catch(() => null);
        if (!produto) return interaction.reply({ content: '❌ Produto não encontrado.', flags: 64 });

        await interaction.deferReply({ flags: 64 });

        const total     = (Number(produto.preco) * qtd).toFixed(2);
        const user      = interaction.user;
        const nomeCanal = `loja-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 18)}`;

        // Cria canal ticket na categoria da loja
        const { PermissionFlagsBits } = require('discord.js');
        const canal = await interaction.guild.channels.create({
          name: nomeCanal,
          parent: config.categoriaLoja,
          permissionOverwrites: [
            { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] },
          ],
          topic: `Pedido de ${user.tag} — ${produto.nome}`,
        });

        // Persiste pedido no banco (estoque só é decrementado quando admin confirmar a compra)
        registrarPedido({
          discord_id:      user.id,
          discord_tag:     user.tag,
          produto_id:      produto.id,
          produto_nome:    produto.nome,
          tamanho,
          quantidade:      qtd,
          preco_unit:      produto.preco,
          canal_ticket_id: canal.id,
        }).catch(err => console.error('[loja] Erro ao registrar pedido:', err));

        const rowFechar = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('fechar_ticket_loja').setLabel('🔒 FECHAR TICKET').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`confirmar_compra_loja:${produto.id}:${tamanho}:${qtd}`).setLabel('🤝 CONFIRMAR COMPRA').setStyle(ButtonStyle.Primary),
        );

        const PIX_KEY = '11.222.333/0001-44'; // chave simbólica

        const embedPedido = {
          color: 0xFFFFFF,
          title: 'NOVO PEDIDO',
          fields: [
            { name: 'PRODUTO',     value: produto.nome.toUpperCase(),               inline: true  },
            { name: 'TAMANHO',     value: tamanho.toUpperCase(),                    inline: true  },
            { name: 'QUANTIDADE',  value: String(qtd),                              inline: true  },
            { name: 'PREÇO UNIT.', value: `R$ ${Number(produto.preco).toFixed(2)}`, inline: true  },
            { name: 'TOTAL',       value: `R$ ${total}`,                            inline: true  },
            ...(obs ? [{ name: 'OBSERVAÇÕES', value: obs, inline: false }] : []),
            { name: 'SOLICITANTE', value: `<@${user.id}>`,                          inline: false },
          ],
          footer: { text: new Date().toLocaleString('pt-BR') },
        };

        await canal.send({
          content: `${user}`,
          ...carrosselEmbeds(embedPedido, produto.imagem_url),
          components: [rowFechar],
        });

        await canal.send({
          embeds: [{
            color: 0x000000,
            title: '💳 PAGAMENTO VIA PIX',
            description: `Para finalizar seu pedido, envie o comprovante de pagamento neste canal.\n\n**Chave PIX:** \`${PIX_KEY}\`\n**Valor:** \`R$ ${total}\`\n\nApós o envio do comprovante, nossa equipe irá confirmar e separar seu pedido. ✅`,
          }],
        });

        return interaction.editReply({ content: `🛒 Pedido aberto: ${canal}`, components: [] });
      }

      if (interaction.isButton() && (interaction.customId === 'fechar_ticket_loja' || interaction.customId.startsWith('confirmar_compra_loja:'))) {
        const { PermissionFlagsBits: PFB } = require('discord.js');
        const temPermissao = interaction.member.permissions.has(PFB.Administrator)
          || interaction.member.permissions.has(PFB.ManageChannels)
          || interaction.member.roles.cache.has(config.cargos.responsavelLoja);
        if (!temPermissao) {
          return interaction.reply({ content: '❌ APENAS ADMINISTRADORES OU RESPONSÁVEIS PELA LOJA PODEM USAR ESTE BOTÃO.', flags: 64 });
        }

        const canal = interaction.channel;
        const confirmar = interaction.customId.startsWith('confirmar_compra_loja:');

        await interaction.deferReply({ flags: 64 });
        await interaction.editReply({ content: '⏳ Processando...' });

        if (confirmar) {
          const [, produtoId, tamanho, qtdStr] = interaction.customId.split(':');
          const qtd = parseInt(qtdStr) || 1;
          await decrementarEstoque(produtoId, tamanho, qtd).catch(err => console.error('[loja] Erro ao decrementar estoque:', err));
          await db.query(`UPDATE pedidos SET status = 'confirmado' WHERE canal_ticket_id = $1`, [canal.id]).catch(() => {});
        }

        try {
          const html      = await gerarTranscript(canal);
          const buffer    = Buffer.from(html, 'utf-8');
          const canalLogs = await interaction.client.channels.fetch(config.canais.logsLoja).catch(() => null);
          if (canalLogs) {
            await canalLogs.send({
              content: confirmar
                ? `✅ COMPRA CONFIRMADA: **${canal.name}** — por ${interaction.user}`
                : `🔒 TICKET FECHADO SEM CONFIRMAR: **${canal.name}** — por ${interaction.user}`,
              files: [{ attachment: buffer, name: `transcript-${canal.id}.html` }],
            });
          }
        } catch {}
        await canal.delete().catch(() => {});
        return;
      }

      // ── Gerenciamento de loja — botões de ação ────────────────────────────

      if (interaction.isButton() && interaction.customId === 'btn_produto_adicionar') {
        const modal = new ModalBuilder().setCustomId('modal_prod_add_1').setTitle('ADICIONAR PRODUTO — 1/2');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('nome').setLabel('NOME DO PRODUTO').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('preco').setLabel('PREÇO (ex: 89.90)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10),
          ),
        );
        return interaction.showModal(modal);
      }

      if (interaction.isButton() && interaction.customId === 'btn_produto_remover') {
        const produtos = await listarProdutos(false).catch(() => []);
        const ativos   = produtos.filter(p => p.ativo);
        if (!ativos.length) return interaction.reply({ content: '❌ Nenhum produto ativo no estoque.', flags: 64 });
        const select = new StringSelectMenuBuilder()
          .setCustomId('select_remover_produto')
          .setPlaceholder('Selecione o produto para remover')
          .addOptions(ativos.slice(0, 25).map(p => ({ label: `${p.nome} — R$ ${Number(p.preco).toFixed(2)}`, value: String(p.id) })));
        return interaction.reply({ content: '🗑️ Selecione o produto a remover:', components: [new ActionRowBuilder().addComponents(select)], flags: 64 });
      }

      if (interaction.isButton() && interaction.customId === 'btn_produto_listar') {
        const todos = await listarProdutos(false).catch(() => []);
        if (!todos.length) return interaction.reply({ content: 'NENHUM PRODUTO CADASTRADO.', flags: 64 });
        const linhas = todos.map(p => {
          const est  = formatarEstoque(p.estoque);
          const foto = p.imagem_url ? ' | 📷 COM FOTO' : '';
          return `**[${p.id}]** ${p.nome.toUpperCase()} | R$ ${Number(p.preco).toFixed(2)} | ${p.ativo ? '✅' : '❌'}${foto}\n└ ${est}`;
        });
        return interaction.reply({
          embeds: [{ color: 0x000000, title: '📦 PRODUTOS CADASTRADOS', description: linhas.join('\n\n') }],
          flags: 64,
        });
      }

      if (interaction.isButton() && interaction.customId === 'btn_produto_editar') {
        const produtos = await listarProdutos(false).catch(() => []);
        const ativos   = produtos.filter(p => p.ativo);
        if (!ativos.length) return interaction.reply({ content: '❌ NENHUM PRODUTO ATIVO NO ESTOQUE.', flags: 64 });
        const select = new StringSelectMenuBuilder()
          .setCustomId('select_editar_produto')
          .setPlaceholder('SELECIONE O PRODUTO PARA EDITAR')
          .addOptions(ativos.slice(0, 25).map(p => ({ label: `${p.nome.toUpperCase()} — R$ ${Number(p.preco).toFixed(2)}`, value: String(p.id) })));
        return interaction.reply({ content: '✏️ SELECIONE O PRODUTO:', components: [new ActionRowBuilder().addComponents(select)], flags: 64 });
      }

      if (interaction.isStringSelectMenu() && interaction.customId === 'select_editar_produto') {
        const id      = interaction.values[0];
        const produto = await buscarProduto(id).catch(() => null);
        if (!produto) return interaction.update({ content: '❌ PRODUTO NÃO ENCONTRADO.', components: [], embeds: [] });
        // Guarda estoque atual no pending para pré-preencher modal 2
        pendingProdutos.set(interaction.user.id, { type: 'edit', id, channelId: interaction.channelId, estoqueAtual: produto.estoque || {} });
        const modal = new ModalBuilder().setCustomId(`modal_edit_1:${id}`).setTitle('EDITAR PRODUTO — 1/2');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('nome').setLabel('NOME').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(produto.nome),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('preco').setLabel('PREÇO (ex: 89.90)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setValue(String(produto.preco)),
          ),
        );
        return interaction.showModal(modal);
      }

      // Modal 1 de EDITAR: salva nome/preco e mostra modal 2 com estoque pré-preenchido
      if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_edit_1:')) {
        const id       = interaction.customId.split(':')[1];
        const nome     = interaction.fields.getTextInputValue('nome').toUpperCase().trim();
        const precoStr = interaction.fields.getTextInputValue('preco').replace(',', '.');
        const preco    = parseFloat(precoStr);
        if (isNaN(preco) || preco <= 0) return interaction.reply({ content: '❌ PREÇO INVÁLIDO.', flags: 64 });
        const dadosAnt = pendingProdutos.get(interaction.user.id) || {};
        pendingProdutos.set(interaction.user.id, { type: 'edit', id, nome, preco, channelId: interaction.channelId, estoqueAtual: dadosAnt.estoqueAtual || {} });
        return interaction.reply({
          embeds: [{ color: 0x000000, title: 'EDITAR PRODUTO — 2/2', description: `**${nome}** — R$ ${preco.toFixed(2)}\n\nComo é o estoque deste produto?` }],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('prod_step2_btn').setLabel('▶ COM TAMANHOS (P/M/G/GG/EXG)').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('prod_step2_semtamanho_btn').setLabel('▶ SEM TAMANHO (quantidade única)').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('prod_cancelar').setLabel('CANCELAR').setStyle(ButtonStyle.Danger),
          )],
          flags: 64,
        });
      }

      // ── Modal 1 de ADICIONAR + Modal 2 comum (add e edit) ───────────────

      if (interaction.isModalSubmit() && interaction.customId === 'modal_prod_add_1') {
        const nome     = interaction.fields.getTextInputValue('nome').toUpperCase().trim();
        const precoStr = interaction.fields.getTextInputValue('preco').replace(',', '.');
        const preco    = parseFloat(precoStr);
        if (isNaN(preco) || preco <= 0) return interaction.reply({ content: '❌ PREÇO INVÁLIDO.', flags: 64 });
        pendingProdutos.set(interaction.user.id, { type: 'add', nome, preco, channelId: interaction.channelId });
        return interaction.reply({
          embeds: [{ color: 0x000000, title: 'ADICIONAR PRODUTO — 2/2', description: `**${nome}** — R$ ${preco.toFixed(2)}\n\nComo é o estoque deste produto?` }],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('prod_step2_btn').setLabel('▶ COM TAMANHOS (P/M/G/GG/EXG)').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('prod_step2_semtamanho_btn').setLabel('▶ SEM TAMANHO (quantidade única)').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('prod_cancelar').setLabel('CANCELAR').setStyle(ButtonStyle.Danger),
          )],
          flags: 64,
        });
      }

      if (interaction.isButton() && interaction.customId === 'prod_step2_btn') {
        const dados = pendingProdutos.get(interaction.user.id);
        if (!dados) return interaction.reply({ content: '❌ SESSÃO EXPIRADA. COMECE NOVAMENTE.', flags: 64 });
        const est = dados.estoqueAtual || {};
        const m2  = new ModalBuilder().setCustomId('modal_prod_step2').setTitle('ESTOQUE POR TAMANHO — 2/2');
        m2.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('qtd_p').setLabel('QUANTIDADE — P').setPlaceholder('ex: 10').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(5).setValue(est.P != null ? String(est.P) : '')),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('qtd_m').setLabel('QUANTIDADE — M').setPlaceholder('ex: 8').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(5).setValue(est.M != null ? String(est.M) : '')),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('qtd_g').setLabel('QUANTIDADE — G').setPlaceholder('ex: 5').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(5).setValue(est.G != null ? String(est.G) : '')),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('qtd_gg').setLabel('QUANTIDADE — GG').setPlaceholder('ex: 3').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(5).setValue(est.GG != null ? String(est.GG) : '')),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('qtd_exg').setLabel('QUANTIDADE — EXG').setPlaceholder('ex: 2').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(5).setValue(est.EXG != null ? String(est.EXG) : '')),
        );
        return interaction.showModal(m2);
      }

      if (interaction.isButton() && interaction.customId === 'prod_step2_semtamanho_btn') {
        const dados = pendingProdutos.get(interaction.user.id);
        if (!dados) return interaction.reply({ content: '❌ SESSÃO EXPIRADA. COMECE NOVAMENTE.', flags: 64 });
        const qtdAtual = dados.estoqueAtual?.UN != null ? String(dados.estoqueAtual.UN) : '';
        const mQtd = new ModalBuilder().setCustomId('modal_prod_qtd_unica').setTitle('QUANTIDADE DO PRODUTO');
        mQtd.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('qtd_un').setLabel('QUANTIDADE TOTAL').setPlaceholder('ex: 50').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(6).setValue(qtdAtual),
          ),
        );
        return interaction.showModal(mQtd);
      }

      if (interaction.isModalSubmit() && interaction.customId === 'modal_prod_qtd_unica') {
        const dados = pendingProdutos.get(interaction.user.id);
        if (!dados) return interaction.reply({ content: '❌ SESSÃO EXPIRADA. COMECE NOVAMENTE.', flags: 64 });
        const qtd = Math.max(0, parseInt(interaction.fields.getTextInputValue('qtd_un')) || 0);
        if (qtd <= 0) return interaction.reply({ content: '❌ QUANTIDADE DEVE SER MAIOR QUE 0.', flags: 64 });
        const estoque  = { UN: qtd };
        const tamanhos = 'UN';
        pendingProdutos.set(interaction.user.id, { ...dados, estoque, tamanhos });
        const isEdit   = dados.type === 'edit';
        const rowFotos = new ActionRowBuilder().addComponents(
          ...(isEdit ? [new ButtonBuilder().setCustomId('prod_manter_fotos').setLabel('MANTER FOTOS ATUAIS').setStyle(ButtonStyle.Secondary)] : []),
          new ButtonBuilder().setCustomId('prod_sem_foto').setLabel(isEdit ? 'REMOVER FOTOS' : 'SALVAR SEM FOTO').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('prod_cancelar').setLabel('CANCELAR').setStyle(ButtonStyle.Danger),
        );
        return interaction.reply({
          embeds: [{ color: 0x000000, title: '📷 FOTOS DO PRODUTO', description:
            `**PRODUTO:** ${dados.nome}\n**PREÇO:** R$ ${Number(dados.preco).toFixed(2)}\n**ESTOQUE:** ${qtd} un. (sem tamanho)\n\n`
            + '---\n\n'
            + '📎 **Envie as fotos agora** diretamente neste canal (até 4 imagens)\n'
            + `${isEdit ? 'Clique **MANTER FOTOS ATUAIS** para não alterar.\n' : ''}Clique **${isEdit ? 'REMOVER FOTOS' : 'SALVAR SEM FOTO'}** para salvar sem imagem.\n`
            + 'Clique **CANCELAR** para descartar.\n\n'
            + '*Aguardando por 2 minutos...*' }],
          components: [rowFotos],
          flags: 64,
        });
      }

      if (interaction.isModalSubmit() && interaction.customId === 'modal_prod_step2') {
        const dados = pendingProdutos.get(interaction.user.id);
        if (!dados) return interaction.reply({ content: '❌ SESSÃO EXPIRADA. COMECE NOVAMENTE.', flags: 64 });
        const parse  = id => Math.max(0, parseInt(interaction.fields.getTextInputValue(id)) || 0);
        const estoque  = { P: parse('qtd_p'), M: parse('qtd_m'), G: parse('qtd_g'), GG: parse('qtd_gg'), EXG: parse('qtd_exg') };
        const tamanhos = Object.keys(estoque).filter(t => estoque[t] > 0).join(',') || 'P,M,G,GG,EXG';
        pendingProdutos.set(interaction.user.id, { ...dados, estoque, tamanhos });
        const isEdit   = dados.type === 'edit';
        const rowFotos = new ActionRowBuilder().addComponents(
          ...(isEdit ? [new ButtonBuilder().setCustomId('prod_manter_fotos').setLabel('MANTER FOTOS ATUAIS').setStyle(ButtonStyle.Secondary)] : []),
          new ButtonBuilder().setCustomId('prod_sem_foto').setLabel(isEdit ? 'REMOVER FOTOS' : 'SALVAR SEM FOTO').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('prod_cancelar').setLabel('CANCELAR').setStyle(ButtonStyle.Danger),
        );
        return interaction.reply({
          embeds: [{ color: 0x000000, title: '📷 FOTOS DO PRODUTO', description:
            `**PRODUTO:** ${dados.nome}\n**PREÇO:** R$ ${Number(dados.preco).toFixed(2)}\n**ESTOQUE:** ${formatarEstoque(estoque)}\n\n`
            + '---\n\n'
            + '📎 **Envie as fotos agora** diretamente neste canal (até 4 imagens)\n'
            + `${isEdit ? 'Clique **MANTER FOTOS ATUAIS** para não alterar.\n' : ''}Clique **${isEdit ? 'REMOVER FOTOS' : 'SALVAR SEM FOTO'}** para salvar sem imagem.\n`
            + 'Clique **CANCELAR** para descartar.\n\n'
            + '*Aguardando por 2 minutos...*' }],
          components: [rowFotos],
          flags: 64,
        });
      }

      // ── Botões de resposta do upload de fotos ────────────────────────────

      if (interaction.isButton() && interaction.customId === 'prod_sem_foto') {
        const dados = pendingProdutos.get(interaction.user.id);
        if (!dados) return interaction.reply({ content: '❌ NENHUMA OPERAÇÃO PENDENTE.', flags: 64 });
        pendingProdutos.delete(interaction.user.id);
        let p;
        if (dados.type === 'add') {
          p = await adicionarProduto(dados.nome, dados.tamanhos, dados.preco, null, dados.estoque || {}).catch(() => null);
        } else {
          p = await atualizarProduto(dados.id, { nome: dados.nome, tamanhos: dados.tamanhos, preco: dados.preco, estoque: dados.estoque || {}, imagem_url: null }).catch(() => null);
        }
        if (!p) return interaction.update({ content: '❌ ERRO AO SALVAR PRODUTO.', components: [], embeds: [] });
        return interaction.update({
          embeds: [{ color: 0x000000, title: dados.type === 'add' ? '✅ PRODUTO ADICIONADO' : '✅ PRODUTO ATUALIZADO', fields: [
            { name: 'NOME',    value: p.nome,                              inline: true },
            { name: 'PREÇO',   value: `R$ ${Number(p.preco).toFixed(2)}`,  inline: true },
            { name: 'ESTOQUE', value: formatarEstoque(p.estoque),          inline: false },
            { name: 'FOTOS',   value: 'NENHUMA',                           inline: false },
          ]}],
          components: [],
        });
      }

      if (interaction.isButton() && interaction.customId === 'prod_manter_fotos') {
        const dados = pendingProdutos.get(interaction.user.id);
        if (!dados) return interaction.reply({ content: '❌ NENHUMA OPERAÇÃO PENDENTE.', flags: 64 });
        pendingProdutos.delete(interaction.user.id);
        const prodAtual = await buscarProduto(dados.id).catch(() => null);
        const p = await atualizarProduto(dados.id, { nome: dados.nome, tamanhos: dados.tamanhos, preco: dados.preco, estoque: dados.estoque || {}, imagem_url: prodAtual?.imagem_url || null }).catch(() => null);
        if (!p) return interaction.update({ content: '❌ ERRO AO SALVAR PRODUTO.', components: [], embeds: [] });
        const qtdImgs = p.imagem_url ? p.imagem_url.split(',').filter(Boolean).length : 0;
        const embedBase = { color: 0x000000, title: '✅ PRODUTO ATUALIZADO', fields: [
          { name: 'NOME',    value: p.nome,                              inline: true },
          { name: 'PREÇO',   value: `R$ ${Number(p.preco).toFixed(2)}`,  inline: true },
          { name: 'ESTOQUE', value: formatarEstoque(p.estoque),          inline: false },
          { name: 'FOTOS',   value: qtdImgs ? `${qtdImgs} foto(s) mantida(s)` : 'NENHUMA', inline: false },
        ]};
        return interaction.update({ ...carrosselEmbeds(embedBase, p.imagem_url), components: [] });
      }

      if (interaction.isButton() && interaction.customId === 'prod_cancelar') {
        pendingProdutos.delete(interaction.user.id);
        return interaction.update({ content: '❌ OPERAÇÃO CANCELADA.', components: [], embeds: [] });
      }

      if (interaction.isStringSelectMenu() && interaction.customId === 'select_remover_produto') {
        const id = interaction.values[0];
        await removerProduto(id).catch(() => {});
        return interaction.update({ content: '✅ Produto removido do estoque.', components: [], embeds: [] });
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
          color: 0x000000,
          title: `${numAdv}ª ADVERTÊNCIA REMOVIDA`,
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
          color: 0x000000,
          title: `ADV. RECRUTAMENTO ${numAdv}ª REMOVIDA`,
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
        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select_tipo_recrutamento')
            .setPlaceholder('SELECIONE O TIPO DE RECRUTAMENTO')
            .addOptions([
              { label: '🦅 SÓCIO',    value: 'socio',    description: 'Serei sócio — precisarei provar minha associação' },
              { label: '🦅 TORCEDOR', value: 'torcedor', description: 'Serei torcedor — precisarei provar foto do manto' },
            ]),
        );
        return interaction.reply({ content: '**📋 RECRUTAMENTO** — SELECIONE O TIPO:', components: [row], flags: 64 });
      }

      if (interaction.isStringSelectMenu() && interaction.customId === 'select_tipo_recrutamento') {
        const tipo = interaction.values[0];
        const modal = new ModalBuilder()
          .setCustomId(`modal_recrutamento:${tipo}`)
          .setTitle(tipo === 'socio' ? 'FORMULÁRIO — SÓCIO' : 'FORMULÁRIO — TORCEDOR');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('nome').setLabel('NOME').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(2).setMaxLength(16),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('idade').setLabel('IDADE (apenas números)').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(2),
          ),
          ...(tipo === 'socio' ? [new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('registro')
              .setLabel('Nº DE REGISTRO DE ASSOCIADO')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMinLength(1)
              .setMaxLength(10),
          )] : []),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('telefone').setLabel('TELEFONE (ex: 11912345678)').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(10).setMaxLength(11),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('recrutador').setLabel('CIDADE').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(2).setMaxLength(32),
          ),
        );
        return interaction.showModal(modal);
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_recrutamento:')) {
        const tipo       = interaction.customId.split(':')[1];
        const nome       = interaction.fields.getTextInputValue('nome');
        const idade      = interaction.fields.getTextInputValue('idade');
        const registro   = tipo === 'socio' ? interaction.fields.getTextInputValue('registro') : null;
        const telefone   = interaction.fields.getTextInputValue('telefone');
        const recrutador = interaction.fields.getTextInputValue('recrutador');
        const user       = interaction.user;

        if (!/^[0-9]{1,2}$/.test(idade)) {
          return interaction.reply({ embeds: [{ color: 0x000000, description: '⚠️ **ERRO:** O CAMPO **IDADE** DEVE CONTER APENAS NÚMEROS (máx. 2 dígitos).' }], flags: 64 });
        }
        if (!/^[0-9]{10,11}$/.test(telefone)) {
          return interaction.reply({ embeds: [{ color: 0x000000, description: '⚠️ **ERRO:** O CAMPO **TELEFONE** DEVE CONTER APENAS NÚMEROS, COM 10 OU 11 DÍGITOS.' }], flags: 64 });
        }

        const fields = [
          { name: 'TIPO',         value: tipo === 'socio' ? '🦅 SÓCIO' : '🦅 TORCEDOR', inline: true },
          { name: 'NOME',         value: nome,       inline: false },
          { name: 'IDADE',        value: idade,      inline: false },
          ...(registro ? [{ name: 'Nº ASSOCIADO', value: registro, inline: false }] : []),
          { name: 'TELEFONE',     value: telefone,   inline: false },
          { name: 'CIDADE',       value: recrutador, inline: false },
          { name: 'ID | DISCORD', value: `${user.id} | <@${user.id}>`, inline: false },
        ];

        const embed = {
          color: 0xFFFFFF,
          title: `SOLICITAÇÃO — ${tipo === 'socio' ? 'SÓCIO' : 'TORCEDOR'}`,
          fields,
        };

        await interaction.reply({ content: 'SUA SOLICITAÇÃO FOI ENVIADA PARA ANÁLISE! AGUARDE AS PRÓXIMAS INSTRUÇÕES.', flags: 64 });

        const canalValidar = interaction.guild.channels.cache.get(config.canais.validarSetagem);
        if (canalValidar) {
          await canalValidar.send({ embeds: [embed], components: recrutamentoButtons });
        }

        // Atribuir cargo de verificação e enviar aviso no canal (diferente por tipo)
        try {
          const guildMember   = await interaction.guild.members.fetch(user.id);
          const cargoProvar   = tipo === 'socio' ? config.cargos.provarAssociacao : config.cargos.provarManto;
          const canalProvarId = tipo === 'socio' ? config.canais.provarAssociacao : config.canais.provarManto;
          const instrucao     = tipo === 'socio'
            ? `<@${user.id}>, você tem 10 minutos para enviar sua **carteirinha de associado** aqui! Após esse prazo, o cargo será removido automaticamente.`
            : `<@${user.id}>, você tem 10 minutos para enviar uma **foto do seu manto** aqui! Após esse prazo, o cargo será removido automaticamente.`;

          await guildMember.roles.add(cargoProvar);

          const canalProvar = interaction.guild.channels.cache.get(canalProvarId);
          if (canalProvar) {
            const avisoMsg = await canalProvar.send({ content: instrucao });
            setTimeout(() => { avisoMsg.delete().catch(() => {}); }, 5 * 60 * 1000);
          }

          setTimeout(async () => {
            try {
              await guildMember.roles.remove(cargoProvar);
            } catch (err) {
              console.error('[recrutamento] Erro ao remover cargo provar:', err);
            }
          }, 10 * 60 * 1000);
        } catch (err) {
          console.error('[recrutamento] Erro ao atribuir cargo provar:', err);
        }

        return;
      }

      if (interaction.isButton() && interaction.customId === 'aprovar_recrutamento') {
        const embed       = interaction.message.embeds[0];
        const idField     = embed.fields.find(f => f.name.startsWith('ID | DISCORD'));
        const candidatoId = idField ? idField.value.split(' ')[0] : null;
        const nomeField   = embed.fields.find(f => f.name === 'NOME');
        const regField    = embed.fields.find(f => f.name === 'Nº ASSOCIADO' || f.name === 'ID');
        const tipoField   = embed.fields.find(f => f.name === 'TIPO');
        const nome        = nomeField ? nomeField.value : '';
        const registro    = regField  ? regField.value  : '';
        const isSocio     = tipoField ? tipoField.value.includes('SÓCIO') : false;
        const tipo        = isSocio ? 'socio' : 'torcedor';

        // Verificar lista de não recrutar (apenas torcedor, que usa ID FiveM)
        const canalHistoricoNaoRec = interaction.guild.channels.cache.get(config.canais.historicoNaoRec);
        let bloqueado = null;
        if (!isSocio && canalHistoricoNaoRec && canalHistoricoNaoRec.isTextBased()) {
          try {
            const msgs = await canalHistoricoNaoRec.messages.fetch({ limit: 100 });
            msgs.forEach(msg => {
              if (msg.embeds?.length > 0) {
                const e = msg.embeds[0];
                const idF = e.fields?.find(f => f.name === 'ID');
                if (idF && idF.value.trim() === registro.trim()) bloqueado = e;
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
              description: `O ID **${registro}** está na lista de não recrutar. Aprovação cancelada.`,
              fields: bloqueado.fields ?? [],
            }],
            components: [],
          });
        }

        const embedAprovado = {
          color: 0x000000,
          title: 'RECRUTAMENTO APROVADO',
          fields: embed.fields,
          footer: { text: `Aprovado por ${interaction.user.tag}` },
        };

        try {
          if (candidatoId) {
            const guildMember   = await interaction.guild.members.fetch(candidatoId);
            const aprovador     = interaction.user;
            const aprovadorNome = interaction.member?.nickname || aprovador.displayName || aprovador.username;
            const cargoAtribuir = isSocio ? config.cargos.socio : config.cargos.torcedor;

            await guildMember.roles.add(cargoAtribuir);
            await guildMember.roles.remove(isSocio ? config.cargos.provarAssociacao : config.cargos.provarManto).catch(() => {});
            await guildMember.roles.remove(config.cargos.visitante).catch(() => {});

            const novoNick = formatarNick(nome, registro || null);
            await guildMember.setNickname(novoNick).catch(() => {});

            // Buscar imagem de prova enviada pelo candidato no canal correspondente
            let imagemProva = null;
            try {
              const canalProvaId = isSocio ? config.canais.provarAssociacao : config.canais.provarManto;
              const canalProva   = interaction.guild.channels.cache.get(canalProvaId);
              if (canalProva?.isTextBased()) {
                const msgs = await canalProva.messages.fetch({ limit: 100 });
                const msgImagem = msgs.find(m =>
                  m.author.id === candidatoId && m.attachments.size > 0,
                );
                if (msgImagem) imagemProva = msgImagem.attachments.first().url;
              }
            } catch {}

            const cidade   = (() => { const f = embed.fields.find(f => f.name === 'CIDADE');   return f ? f.value : null; })();
            const telefone = (() => { const f = embed.fields.find(f => f.name === 'TELEFONE'); return f ? f.value : null; })();
            const idade    = (() => { const f = embed.fields.find(f => f.name === 'IDADE');    return f ? parseInt(f.value) || null : null; })();

            // Persistir membro aprovado
            console.log('[aprovar] Iniciando persistência:', { candidatoId, nome, tipo, registro, cidade, telefone, idade, aprovadorNome });
            await db.query(
              `INSERT INTO membros
                (discord_id, nome, tipo, numero_associado, cidade, telefone, idade, aprovado_por_id, aprovado_por_nome, imagem_prova)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
               ON CONFLICT (discord_id) DO UPDATE SET
                 nome = EXCLUDED.nome,
                 tipo = EXCLUDED.tipo,
                 numero_associado = EXCLUDED.numero_associado,
                 cidade = EXCLUDED.cidade,
                 telefone = EXCLUDED.telefone,
                 idade = EXCLUDED.idade,
                 aprovado_por_id = EXCLUDED.aprovado_por_id,
                 aprovado_por_nome = EXCLUDED.aprovado_por_nome,
                 imagem_prova = EXCLUDED.imagem_prova,
                 criado_em = NOW()`,
              [candidatoId, nome, tipo, registro || null, cidade, telefone, idade, aprovador.id, aprovadorNome, imagemProva],
            );
            console.log('[aprovar] Membro salvo com sucesso');

            // Registrar aprovação no ranking
            await db.query(
              `INSERT INTO aprovacoes_recrutamento (aprovador_id, aprovador_nome, candidato_id, candidato_nome, tipo)
               VALUES ($1, $2, $3, $4, $5)`,
              [aprovador.id, aprovadorNome, candidatoId, nome, tipo],
            );
            console.log('[aprovar] Aprovação registrada com sucesso');

            atualizarTopRecrutadores(client).catch(() => {});
          }
        } catch (err) {
          console.error('[aprovar] Erro DETALHADO:', err.message, err.stack);
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
              await guildMember.roles.remove(config.cargos.provarAssociacao).catch(() => {});
              await guildMember.roles.remove(config.cargos.provarManto).catch(() => {});
              await guildMember.roles.remove(config.cargos.visitante).catch(() => {});
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

