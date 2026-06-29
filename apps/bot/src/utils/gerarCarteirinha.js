const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const config = require('../config');

// Registre a fonte se tiver o arquivo; caso contrário o canvas usará a fonte padrão
try {
  GlobalFonts.registerFromPath(path.join(__dirname, '../../fonts/LiberationSans-Regular.ttf'), 'LiberationSans');
  GlobalFonts.registerFromPath(path.join(__dirname, '../../fonts/LiberationSans-Bold.ttf'), 'LiberationSans');
} catch {
  // fonte não encontrada — usando padrão do sistema
}

const W = 760;
const H = 428;

function drawCover(ctx, img, x, y, w, h) {
  const iw = img.width;
  const ih = img.height;
  const scale = Math.max(w / iw, h / ih);
  const sw = iw * scale;
  const sh = ih * scale;
  const sx = x + (w - sw) / 2;
  const sy = y + (h - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh);
}

function desenharPlaceholderFoto(ctx, x, y, w, h) {
  ctx.fillStyle = '#cccccc';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#888888';
  ctx.font = '14px LiberationSans';
  ctx.textAlign = 'center';
  ctx.fillText('SEM FOTO', x + w / 2, y + h / 2);
}

async function gerarCarteirinha({ nome, numeroSocio, validade, avatarUrl }) {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  const S      = 200;
  const imgY   = 108;
  const logoX  = 12;
  const photoX = W - 12 - S;

  // 1. Fundo branco
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // 2. Faixas decorativas
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 308, W, 12);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 320, W, 8);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 328, W, 100);

  // 3. Logo (esquerda)
  try {
    const logo = await loadImage(path.join(__dirname, '../../img/logo.png'));
    ctx.save();
    ctx.rect(logoX, imgY, S, S);
    ctx.clip();
    drawCover(ctx, logo, logoX, imgY, S, S);
    ctx.restore();
  } catch {
    desenharPlaceholderFoto(ctx, logoX, imgY, S, S);
  }

  // 4. Foto do membro (direita)
  try {
    const foto = await loadImage(avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.rect(photoX, imgY, S, S);
    ctx.clip();
    drawCover(ctx, foto, photoX, imgY, S, S);
    ctx.restore();
  } catch {
    desenharPlaceholderFoto(ctx, photoX, imgY, S, S);
  }

  // 5. Cabeçalho
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 26px LiberationSans';
  ctx.textAlign = 'center';
  ctx.fillText(config.carteirinha.titulo, W / 2, 40);

  ctx.font = '18px LiberationSans';
  ctx.fillText(config.carteirinha.subtitulo, W / 2, 65);

  const subW = 400;
  ctx.fillRect((W - subW) / 2, 70, subW, 1.5);

  ctx.font = '14px LiberationSans';
  ctx.textAlign = 'right';
  ctx.fillText(`Fundado em ${config.carteirinha.fundacao}`, photoX - 10, 92);

  // 6. Dados
  const dadosX = logoX + S + 14;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#1a1a1a';

  ctx.font = 'bold 23px LiberationSans';
  ctx.fillText('Sócio nº:', dadosX, 162);
  ctx.font = '23px LiberationSans';
  ctx.fillText(String(numeroSocio).padStart(4, '0'), dadosX + 130, 162);

  ctx.font = 'bold 23px LiberationSans';
  ctx.fillText('Nome:', dadosX, 190);
  ctx.font = '23px LiberationSans';
  ctx.fillText(nome.slice(0, 22), dadosX + 130, 190);

  ctx.font = 'bold 23px LiberationSans';
  ctx.fillText('Validade:', dadosX, 218);
  ctx.font = '23px LiberationSans';
  ctx.fillText(validade, dadosX + 130, 218);

  // 7. Assinatura
  const assX1 = dadosX;
  const assX2 = photoX - 10;
  const assCX = (assX1 + assX2) / 2;

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'italic 22px LiberationSans';
  ctx.fillText(config.carteirinha.presidente, assCX, 385);

  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(assX1, 400);
  ctx.lineTo(assX2, 400);
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '14px LiberationSans';
  ctx.fillText('Presidente', assCX, 418);

  return canvas.encode('png');
}

module.exports = { gerarCarteirinha };
