# Diretório nacional — clubes e suas torcidas organizadas

> **Dataset estruturado (fonte da verdade):** este resumo curado convive com o
> catálogo completo em `packages/db/src/data/torcidas-conhecidas.js` (546
> registros com nome, clube, fundação, sede, sub-sedes, lema, site, cidade/UF e
> logo), gerado por `scripts/scrape-organizadas.mjs` a partir do
> `organizadasbrasil.com`, semeado em `TorcidaConhecida` via
> `seed:torcidas-conhecidas` (logos no Cloudinary `torcida/catalogo/logos`) e
> provisionado como **tenants vazios** via `seed:torcidas-tenants` (sem
> presidente — transferência no super-admin). **Escudos de clubes** (`Afiliacao`):
> pipeline Soccer Wiki + Cloudinary — ver `docs/data/escudos-afiliacoes.md` e
> `ARCHITECTURE.md` §5.9 (112/367 com escudo em 2026-07-13). Ver `ARCHITECTURE.md` §5.8.
> `.md` segue como visão editorial (negrito = principal, notas de homônimos/backlog);
> o catálogo + tenants são o dado navegável no onboarding.

> Mapa amplo (não exaustivo) das torcidas organizadas do Brasil por
> região → estado → clube. Uso: reconhecer a torcida de um tenant, sugerir a
> afiliação certa no onboarding, e dar contexto às recomendações de aliança.
>
> **Confiança: média.** Fonte estrutural: portal colaborativo
> `organizadasbrasil.com` (páginas por estado) cruzado com imprensa e
> Wikipédia (consulta 2026-07-10). Como é base colaborativa, **existência
> atual, grafia e datas podem variar** — muitas torcidas listadas estão
> extintas, fundidas, renomeadas ou banidas judicialmente. Sempre confirmar
> com o Presidente antes de tratar como fato no produto. As torcidas-âncora
> (com perfil sólido) estão em [`torcidas-brasil.md`](torcidas-brasil.md);
> relações de aliança/rivalidade em [`aliancas.md`](aliancas.md).
>
> Convenção: **negrito** = principal(is) organizada(s) do clube.

## Sudeste

### São Paulo
- **Corinthians**: **Gaviões da Fiel** (1969), **Camisa 12** (Fiel Torcida
  Jovem), Pavilhão Nove, Estopim da Fiel, Coringão Chopp, Fiel Macabra.
- **Palmeiras**: **Mancha Alviverde/Mancha Verde** (1983), **TUP** (Torcida
  Uniformizada do Palmeiras, 1970), Acadêmicos da Savóia, Pork's Alviverde,
  Rasta Alviverde.
- **São Paulo FC**: **Torcida Tricolor Independente**, **Dragões da Real**,
  Falange Tricolor, Metal Tricolor, Os Implacáveis, Tricolor Chopp.
- **Santos**: **Torcida Jovem do Santos** (1969), Sangue Jovem, Força Jovem
  do Santos.
- Capital (outros): Portuguesa — Leões da Fabulosa; Juventus — JU-Jovem.
- Interior (amostra): Ponte Preta — Torcida Jovem Amor Maior, Uniformizada
  Serponte; Guarani — **Fúria Independente**, Guerreiros da Tribo, Torcida
  Jovem Guarani; Botafogo-SP (Ribeirão) — Fiel Força Tricolor, Kamikaze
  Tricolor; Comercial-SP — Mancha Alvinegra; São Bento (Sorocaba) — Sangue
  Azul, Força Azul; Paulista (Jundiaí) — **Raça Tricolor**, Gamor Força
  Jovem; São Caetano — Comando Azul, Gladiadores; Santo André — Fúria
  Andreense; São José-SP — Mancha Azul, Sangue Joeense.

### Rio de Janeiro
- **Flamengo**: **Torcida Jovem do Flamengo** (1967), **Raça Rubro-Negra**
  (1977), Urubuzada, Fla Manguaça, Paixão Rubro-Negra, Império Rubro-Negro,
  Fla-Roots, Falange Rubro-Negra.
- **Vasco**: **Força Jovem do Vasco** (1970), Ira Jovem, União Vascaína,
  Guerreiros do Almirante, Mancha Negra do Vasco, Super Jovem.
- **Fluminense**: **Young Flu** (1970), **Força Flu** (1970), Falange
  Tricolor, Garra Tricolor, Fiel Tricolor, Flunitor.
- **Botafogo**: **Fúria Jovem do Botafogo**, Torcida Jovem do Botafogo,
  Movimento Mancha Alvinegra, Fogoró, Botachopp.
- Interior/menores: Bangu, Olaria, Volta Redonda, Madureira, Macaé,
  Boavista, Nova Iguaçu, Resende, Americano, Friburguense, Cabofriense,
  Duque de Caxias, São Cristóvão.

### Minas Gerais
- **Atlético-MG**: **Galoucura**, Esquadrão Atleticano, Força Jovem
  Atleticana, Dragões F.A.O., Galö Metal, Uniformizada do Atlético.
- **Cruzeiro**: **Máfia Azul**, **Pavilhão Independente**, Mancha Azul,
  Torcida Jovem Cruzeiro, Fanati-Cruz, Sangue Azul, China Azul.
- **América-MG**: Seita Verde, Desorganizada Avacoelhada.
- Outros: Villa Nova — Pele Vermelha, Diaboloco; Tupi (Juiz de Fora) —
  Tribo Carijó, Império Alvinegro; Uberlândia, Ipatinga, URT, Democrata.

### Espírito Santo
- Desportiva Ferroviária — **Grenamor** (1976), Esquadrão Grená; Rio Branco-ES
  — **Comando Alvi-Negro**, Força 12 (1999); Serra — Cobra Coral; Estrela do
  Norte — Torcida Jovem Estrela, Máfia Estrelense; Vitória-ES — Garra
  Alvianil.

## Sul

### Rio Grande do Sul
- **Grêmio**: **Geral do Grêmio** (2001, barra brava de livre adesão),
  **Torcida Jovem do Grêmio** (1977), **Super Raça Gremista** (1981), Garra
  Tricolor, Máfia Tricolor, Imortalchopp.
- **Internacional**: **Camisa 12** (1969), Nação Independente Comando
  Vermelho, Força Independente Colorada.
- **Juventude**: Mancha Verde Juventude (1990). **Caxias**: Falange Grená.
- Outros: Brasil de Pelotas — Máfia Xavante, Torcida Organizada do Brasil;
  Pelotas — Força Jovem Pelotas; Novo Hamburgo — Geral do Nóia, Mancha Anil;
  São José-RS — Os Farrapos.

### Santa Catarina
- **Avaí**: **Mancha Azul** (1995), Raça Azul (1983), Leões do Vale.
- **Figueirense**: **Gaviões Alvinegros** (1991), Barrigueira, Bobgueira.
- **Chapecoense**: Torcida Jovem Chapecoense, Garra Independente, Guerreiros
  do Verdão.
- **Criciúma**: **Guerrilha Jovem** (1991). **Joinville**: União Tricolor.
- **Marcílio Dias**: **Fúria Marcilista** (1999). Brusque, Metropolitano,
  Tubarão, Hercílio Luz.

### Paraná
- **Athletico-PR**: **Os Fanáticos** (1977), Ultras do Atlético (1992).
- **Coritiba**: **Império Alviverde** (1977), Mancha Verde do Coritiba,
  Dragões Alviverde, Coxa Metal.
- **Paraná Clube**: **Fúria Independente Tricolor** (1993). **Londrina**:
  Falange Azul. **Operário-PR**: Trem Fantasma.
- Outros: Maringá — Galo Terror, Fúria Alvinegra; Cascavel — Serpente
  Tricolor; Rio Branco-PR; Iraty.

## Nordeste

### Bahia
- **Bahia**: **Bamor** (1978), Terror Tricolor (2004), Povão (1976), Garra
  Tricolor.
- **Vitória**: **Os Imbatíveis** (1997), Viloucura (1998), Camisa 12 do
  Vitória (2008).
- Fluminense de Feira — Falange Tricolor, Força Jovem; Itabuna, Serrano,
  Alagoinhas (Nação Carcará), Vitória da Conquista.

### Pernambuco
- **Sport**: **Torcida Jovem do Sport**, Gang da Ilha, Leões da Ilha, Bafo
  do Leão, Tropa de Elite.
- **Santa Cruz**: **Inferno Coral**, Raça Coral, Império Coral, Garra Coral.
- **Náutico**: **Jovem Fanáutico**, Super Raça Alvirrubra, Timbucana, Timbu
  Chopp.
- Central (Caruaru) — Comando Alvinegro; Salgueiro — Fúria do Sertão;
  América-PE, Porto, Petrolina.

### Ceará
- **Fortaleza**: **Leões da TUF** (1991), **Jovem Garra Tricolor** (1996),
  Fortaleza Beer.
- **Ceará**: **Cearamor** (1982), Fúria Jovem do Ceará, Força Independente,
  Cangaceiros Alvinegros.
- **Ferroviário**: Falange Coral (1990), Esquadrão Coral, **Ultras
  Resistência Coral** (2005, pioneira antifascista).
- Icasa — Fúria Icasiana; Guarany de Sobral; Crato.

### Rio Grande do Norte
- **ABC**: **Garra Alvinegra** (1991), Camisa 12 (1982). **América-RN**:
  **Máfia Vermelha** (1991), Mecão Chopp.
- Potiguar — Império Vermelho, Mancha Alvirrubra; Baraúnas — Fúria Jovem;
  Santa Cruz-RN — Santamor; Alecrim.

### Paraíba
- **Botafogo-PB**: **Torcida Jovem do Botafogo** (1997), Fúria Independente,
  Império Alvinegro, Fogomania.
- **Campinense**: **Facção Jovem** (2003), Torcida Organizada da Raposa
  (1976), Fúria Rubro-Negra.
- **Treze**: **Torcida Jovem do Galo** (2001). Auto Esporte — Gaviões
  Rubros; Sousa — Força Alviverde; Nacional de Patos.

### Alagoas
- **CSA**: **Mancha Azul** (1992), Sangue Azul, CSAMOR. **CRB**: **Comando
  Alvi-Rubro** (1993), Garra, Galo Chopp.
- **ASA** (Arapiraca): **Mancha Negra** (2000), Torcida Jovem do ASA,
  Império Alvinegro.

### Sergipe
- **Confiança**: **Trovão Azul** (1986), Torcida Jovem do Confiança.
- **Sergipe**: **Esquadrão Colorado** (1993), Sangue Jovem, Rubro Chopp.
- Itabaiana — Torcida Jovem Tricolor.

### Maranhão
- **Sampaio Corrêa**: **Tubarões da Fiel** (2000), Paixão Tricolor, Sampaio
  Roots.
- **Moto Club**: **Moto Folia** (1996), Os Dragões da Fiel (1982),
  Motochopp.
- Imperatriz — Fúria Colorada; Maranhão AC — Partido do Bode; Bacabal.

### Piauí
- **River-PI**: **Esporão do Galo** (2001), Império Tricolor. Flamengo-PI —
  Império Rubro-Negro, Flamor; 4 de Julho — Gaviões Colorados; Parnahyba —
  Tubarões da Cohab.

## Norte

### Pará
- **Remo**: **Remoçada / Camisa 33** (Remista), **Pavilhão 6**, Piratas
  Azulinos, Trovão Azul, Leões da Real, Império Azul, Remo Chopp, Remowar.
- **Paysandu**: **Tradição Uniformizada Bicolor (TUB)**, **Força Jovem
  Paysandu**, Fúria Bicolor, Raça Bicolor, Facção Jovem do Paysandu, Metal
  Bicolor.
- Tuna Luso — Movimento Cruzmaltino; Castanhal; São Raimundo-PA; Cametá.

### Amazonas
- **Nacional-AM**: **Narraça** (1991), Apaixonaça. **São Raimundo-AM**:
  Furacão Azul (1998), Força Azul. **Fast Clube**: Esquadrão Tricolor.
- Rio Negro — Mancha Negra, Império Alvinegro; América-AM — Torcida Jovem.
- (Demais estados do Norte — AP, RR, RO, AC, TO — têm organizadas menores,
  ainda não catalogadas aqui.)

## Centro-Oeste

### Goiás
- **Goiás**: **Força Jovem Goiás** (1997). **Vila Nova**: **Esquadrão
  Vilanovense** (1994), Velha Guarda Vilanovense, Vila Metal. **Atlético-GO**:
  **Dragões Atleticanos** (2009).
- Anapolina — Torcida Organizada Rubra (1979); Anápolis FC; Itumbiara.

### Distrito Federal
- **Gama**: **Ira Jovem do Gama** (2003). Brasiliense — Facção Brasiliense;
  Ceilândia EC — Gato Cruel; Sobradinho — Raça Alvinegra; Ceilandense —
  Raça Ceilandense.

### Mato Grosso
- **Cuiabá**: **Raça Cuiabana** (2011). Mixto — Boca Suja (1992), Comando
  Alvi-Negro; Operário-VG — Força Jovem Operário; União (Rondonópolis) —
  Torcida Jovem União.
- (Mato Grosso do Sul — Operário-MS, Comercial-MS etc. — a catalogar.)

## Notas de uso para os agentes

1. **Reconhecimento de tenant**: ao ver o nome de uma torcida, este diretório
   ajuda a inferir a `Afiliacao` (clube) correta — mas confirme, há nomes
   repetidos entre estados (Camisa 12 existe em Corinthians, Inter, ABC e
   Vitória; "Mancha Azul" em Avaí, CSA, Colo-Colo-BA e Cruzeiro).
2. **Homônimos são armadilha** para recomendação de aliança: "Trovão Azul" é
   do Confiança/SE **e** do Remo/PA em fontes diferentes — sempre desambiguar
   por clube+estado.
3. **Não é ranking**: a marcação em negrito indica proeminência/antiguidade,
   não tamanho exato nem juízo de valor.
4. **Backlog**: catalogar AP/RR/RO/AC/TO e MS; validar quais torcidas seguem
   ativas (várias foram dissolvidas ou banidas judicialmente pós-Lei Geral do
   Esporte).
5. **Escudos dos clubes**: cobertura parcial — plano em
   `docs/data/escudos-afiliacoes.md` (Soccer Wiki, matching conservador por UF).
