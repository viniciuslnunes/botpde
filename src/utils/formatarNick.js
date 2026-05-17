// Padrão sócio:    {nome} - Nº: {numero}
// Padrão torcedor: {nome} - TORCEDOR
function formatarNick(nome, numero) {
  const sufixo   = numero ? ` - Nº: ${numero}` : ' - TORCEDOR';
  const maxNome  = 32 - sufixo.length;
  const nomeCortado = nome.slice(0, maxNome);
  return `${nomeCortado}${sufixo}`;
}

module.exports = { formatarNick };
