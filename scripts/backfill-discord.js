/**
 * Backfill — posta todos os commits anteriores no canal Discord
 * Uso: DISCORD_WEBHOOK=https://... node scripts/backfill-discord.js
 */

const { execSync } = require('child_process');
const https = require('https');
const url   = require('url');

const WEBHOOK = process.env.DISCORD_WEBHOOK;
if (!WEBHOOK) {
  console.error('❌ Defina a variável DISCORD_WEBHOOK antes de rodar.');
  console.error('   Exemplo: DISCORD_WEBHOOK=https://discord.com/api/webhooks/... node scripts/backfill-discord.js');
  process.exit(1);
}

function git(cmd) {
  return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function post(payload) {
  return new Promise((resolve, reject) => {
    const parsed  = url.parse(WEBHOOK);
    const body    = JSON.stringify(payload);
    const options = {
      hostname: parsed.hostname,
      path:     parsed.path,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        if (res.statusCode === 429) return reject({ retry: true, data: JSON.parse(data) });
        resolve(res.statusCode);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function buildEmbed(hash, index, total) {
  const short    = hash.slice(0, 7);
  const message  = git(`log -1 --pretty=%s ${hash}`);
  const body     = git(`log -1 --pretty=%b ${hash}`);
  const author   = git(`log -1 --pretty=%an ${hash}`);
  const dateIso  = git(`log -1 --pretty=%cI ${hash}`);
  const repo     = git('remote get-url origin').replace('https://github.com/', '').replace('.git', '');

  let files = [];
  try {
    const raw = git(`diff --name-only ${hash}~1 ${hash}`);
    files = raw ? raw.split('\n').filter(Boolean) : [];
  } catch {
    files = ['*(commit inicial)*'];
  }

  const shown     = files.slice(0, 10);
  const extra     = files.length - shown.length;
  let filesText   = shown.map(f => `\`${f}\``).join('\n');
  if (extra > 0) filesText += `\n*... e mais ${extra} arquivo(s)*`;
  if (!filesText)  filesText = '*(sem arquivos)*';

  let addsText = '';
  try {
    addsText = git(`diff --shortstat ${hash}~1 ${hash}`).trim();
  } catch {}

  // Tempo de desenvolvimento até este commit
  const firstIso = git('log --reverse --pretty=%cI').split('\n')[0];
  const t1   = new Date(firstIso);
  const t2   = new Date(dateIso);
  const ms   = t2 - t1;
  const days  = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins  = Math.floor((ms % 3600000) / 60000);
  const devTime = `${days}d ${hours}h ${mins}m`;

  const commitUrl = `https://github.com/${repo}/commit/${hash}`;

  const desc_parts = [`>>> **${message}**`];
  if (body.trim()) desc_parts.push(body.trim());

  const fields = [
    { name: '👤  AUTOR',                    value: `\`${author}\``,          inline: true  },
    { name: '🔢  COMMIT',                   value: `[\`${short}\`](${commitUrl})`, inline: true },
    { name: `📁  ARQUIVOS — ${files.length}`, value: filesText,              inline: false },
    { name: '⏱️  TEMPO DE DEV ATÉ AQUI',    value: `\`${devTime}\``,         inline: true  },
    { name: '🔢  SEQUÊNCIA',                value: `\`${index} de ${total}\``, inline: true },
  ];

  if (addsText) {
    fields.push({ name: '±  LINHAS', value: `\`${addsText}\``, inline: false });
  }

  return {
    embeds: [{
      color:       0x000000,
      title:       `🛠️  ATUALIZAÇÃO #${index} — BOT PDE`,
      description: desc_parts.join('\n'),
      fields,
      footer:      { text: 'BOT PDE • Histórico de desenvolvimento' },
      timestamp:   dateIso,
    }],
  };
}

async function main() {
  const hashes = git('log --reverse --pretty=%H').split('\n').filter(Boolean);
  const total  = hashes.length;
  console.log(`📋 ${total} commits encontrados. Iniciando backfill...`);

  for (let i = 0; i < hashes.length; i++) {
    const hash  = hashes[i];
    const index = i + 1;

    const payload = await buildEmbed(hash, index, total);

    let posted = false;
    while (!posted) {
      try {
        const status = await post(payload);
        if (status === 204 || status === 200) {
          console.log(`✅ [${index}/${total}] ${hash.slice(0, 7)} — OK`);
          posted = true;
        } else {
          console.warn(`⚠️  [${index}/${total}] Status inesperado: ${status}`);
          posted = true;
        }
      } catch (err) {
        if (err?.retry) {
          const wait = (err.data?.retry_after || 1) * 1000 + 500;
          console.log(`⏳ Rate limit — aguardando ${wait}ms...`);
          await sleep(wait);
        } else {
          console.error(`❌ Erro ao postar commit ${hash.slice(0, 7)}:`, err);
          posted = true;
        }
      }
    }

    // Respeita rate limit do Discord (5 req/2s por padrão)
    await sleep(800);
  }

  console.log(`\n🎉 Backfill concluído! ${total} commits postados no canal.`);
}

main().catch(console.error);
