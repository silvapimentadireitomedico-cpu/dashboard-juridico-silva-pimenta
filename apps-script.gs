/**
 * Silva Pimenta — Dashboard Jurídico
 * Apps Script que lê a planilha de iniciais e expõe JSON público.
 *
 * Como instalar:
 *   1. Abrir a planilha no Google Sheets
 *   2. Extensões → Apps Script
 *   3. Apagar conteúdo padrão e colar este arquivo
 *   4. Substituir SHEET_ID e SHEET_ATUAL pelos seus valores (ver constantes abaixo)
 *   5. Implantar → Nova implantação → Tipo: Web App
 *      - Executar como: Eu (william@silvapimenta.com.br)
 *      - Quem tem acesso: Qualquer pessoa
 *   6. Copiar a URL e colar em script.js (constante API_URL)
 */

// ============================================================
// CONFIGURAÇÃO — ajustar se a planilha mudar
// ============================================================

// ID da planilha — Silva Pimenta · Iniciais/Contestações
const SHEET_ID = '1opXyLXtVjen9yVuh0ph_w5bDXvCQA1V9r94EBE4vh58';

// Detecção automática da aba do trimestre atual baseado na data de hoje.
// Tenta primeiro com ano (ex: "ABRIL - JUNHO 2026"), fallback sem ano.
// Padrões esperados:
//   1/4: "JANEIRO - MARÇO" (jan, fev, mar)
//   2/4: "ABRIL - JUNHO"   (abr, mai, jun)
//   3/4: "JULHO - SETEMBRO" (jul, ago, set)
//   4/4: "OUTUBRO - DEZEMBRO" (out, nov, dez)
function detectarAbaTrimestre() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;
  let nome;
  if (mes <= 3) nome = 'JANEIRO - MARÇO';
  else if (mes <= 6) nome = 'ABRIL - JUNHO';
  else if (mes <= 9) nome = 'JULHO - SETEMBRO';
  else nome = 'OUTUBRO - DEZEMBRO';
  return [nome + ' ' + ano, nome]; // tenta com ano primeiro, fallback sem ano
}

// Equipe ativa — nomes exatos como aparecem na linha 4 da planilha
// JULIA saiu (substituída por MAX em 13/05/2026).
const EQUIPE_ATIVA = [
  'MAX', 'HUGO', 'STELLA', 'RAFAEL',
  'NATALY', 'ISABELLA', 'ANA', 'SUELLEN'
];

// Mapeamento cor da célula → produto (RGB hex sem #, MAIÚSCULO)
// Inclui tanto as cores oficiais da legenda quanto variações dos
// presets do Google Sheets que o time usa por engano (mas com mesma intenção).
const COR_PRODUTO = {
  // Cores oficiais da legenda
  'F1C232': 'Seguro',
  'B6D7A8': 'Auxílio',
  'CC0000': 'Eventuais',
  'B4A7D6': 'Consórcio',
  'EA9999': 'Suspensão',
  '00FFFF': 'Livre IR',
  '9FC5E8': 'Abatimento',
  'FF00FF': 'INSS',
  '00FF00': 'Direito Médico',
  // Variações dos presets do Sheets (alguém usou tom errado mas mesma cor)
  'FBBC04': 'Seguro',       // amarelo Sheets — confirmado pelo William
  'FF9900': 'Seguro',       // laranja Sheets — confirmado pelo William (caso da Julia)
  'A4C2F4': 'Abatimento',   // azul claro Sheets ~= 9FC5E8
  'EA4335': 'Eventuais'     // vermelho Sheets ~= CC0000
};

// ============================================================
// ENDPOINT — chamado pelo dashboard
// ============================================================

function doGet(e) {
  try {
    const data = montarDados();
    return ContentService
      .createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ erro: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// LEITURA DA PLANILHA
// ============================================================

function montarDados() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const candidatos = detectarAbaTrimestre();
  let sheet = null;
  let nomeAbaUsada = '';
  for (const nome of candidatos) {
    sheet = ss.getSheetByName(nome);
    if (sheet) { nomeAbaUsada = nome; break; }
  }
  if (!sheet) throw new Error(`Nenhuma aba encontrada entre: ${candidatos.join(' | ')}`);

  // Header de pessoas: linha 4, colunas B até I (8 colunas)
  const headerVals = sheet.getRange(4, 2, 1, 8).getValues()[0];
  const colsPorNome = {};
  headerVals.forEach((v, idx) => {
    if (v) {
      const nome = v.toString().trim().toUpperCase();
      if (EQUIPE_ATIVA.indexOf(nome) >= 0) {
        colsPorNome[nome] = idx + 2; // coluna real (B = 2)
      }
    }
  });

  // Iniciar contadores zerados pra TODA equipe ativa (mesmo se ausente da planilha)
  const ranking = {};
  const rankingHoje = {};
  const seguroPorNome = {}; // desempate: qtd de Seguro por pessoa
  EQUIPE_ATIVA.forEach(nome => {
    ranking[nome] = 0;
    rankingHoje[nome] = 0;
    seguroPorNome[nome] = 0;
  });

  const tipos = {};
  let totalGeral = 0;
  const evolucaoMap = {}; // 'YYYY-MM-DD' -> total do dia
  const coresNaoMapeadas = {}; // diagnostico: cor hex -> { qtd, exemplos: [{linha, col, valor}] }

  // Estoque: célula J4 (pendentes do trimestre — fica abaixo do "TOTAL GERAL" na planilha)
  const estoque = Number(sheet.getRange(4, 10).getValue()) || 0;
  // Revisados: célula M4 — quantidade já revisada no trimestre
  const revisados = Number(sheet.getRange(4, 13).getValue()) || 0;

  // Dados começam na linha 5
  const lastRow = sheet.getLastRow();
  if (lastRow < 5) return resumir(ranking, rankingHoje, seguroPorNome, tipos, totalGeral, evolucaoMap, nomeAbaUsada, coresNaoMapeadas, estoque, revisados);

  const range = sheet.getRange(5, 1, lastRow - 4, 9);
  const valores = range.getValues();
  const cores = range.getBackgrounds();

  const hoje = hojeMidnight();

  for (let r = 0; r < valores.length; r++) {
    const data = valores[r][0];
    if (!(data instanceof Date)) continue;

    const ehHoje = sameDay(data, hoje);
    const dataKey = formatDate(data);

    for (const nome in colsPorNome) {
      const col = colsPorNome[nome];
      const valor = valores[r][col - 1];
      if (!valor) continue;
      const txt = valor.toString().trim().toLowerCase();
      if (txt === '') continue;
      if (txt.indexOf('aguard') >= 0) continue;

      ranking[nome]++;
      totalGeral++;
      if (ehHoje) rankingHoje[nome]++;
      evolucaoMap[dataKey] = (evolucaoMap[dataKey] || 0) + 1;

      const bg = cores[r][col - 1];
      if (bg && bg.length === 7 && bg !== '#ffffff' && bg !== '#000000') {
        const hex = bg.replace('#', '').toUpperCase();
        const produto = COR_PRODUTO[hex] || 'Outros';
        tipos[produto] = (tipos[produto] || 0) + 1;
        if (produto === 'Seguro') seguroPorNome[nome]++;
        // Diagnóstico: registra cor não mapeada
        if (produto === 'Outros') {
          if (!coresNaoMapeadas[hex]) {
            coresNaoMapeadas[hex] = { qtd: 0, exemplos: [] };
          }
          coresNaoMapeadas[hex].qtd++;
          if (coresNaoMapeadas[hex].exemplos.length < 3) {
            coresNaoMapeadas[hex].exemplos.push({
              linha: r + 5,
              coluna: col,
              pessoa: nome,
              valor: valor.toString().substring(0, 20)
            });
          }
        }
      }
    }
  }

  return resumir(ranking, rankingHoje, seguroPorNome, tipos, totalGeral, evolucaoMap, nomeAbaUsada, coresNaoMapeadas, estoque, revisados);
}

function resumir(ranking, rankingHoje, seguroPorNome, tipos, totalGeral, evolucaoMap, nomeAbaUsada, coresNaoMapeadas, estoque, revisados) {
  // Ordenação: 1) total do trimestre desc, 2) desempate por qtd de Seguro desc
  const rankingArr = EQUIPE_ATIVA
    .map(nome => ({
      nome: nome,
      qtd: ranking[nome] || 0,
      qtdHoje: rankingHoje[nome] || 0,
      seguro: seguroPorNome[nome] || 0
    }))
    .sort((a, b) => (b.qtd - a.qtd) || (b.seguro - a.seguro));

  const tiposArr = Object.keys(tipos)
    .map(t => ({ tipo: t, qtd: tipos[t] }))
    .sort((a, b) => b.qtd - a.qtd);

  // Evolução: últimos 30 dias (preenche dias sem registro com 0)
  const evolucaoArr = [];
  const hoje = hojeMidnight();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i);
    const k = formatDate(d);
    evolucaoArr.push({ data: k, total: evolucaoMap[k] || 0 });
  }

  return {
    ranking: rankingArr,
    tipos: tiposArr,
    totalGeral: totalGeral,
    estoque: estoque || 0,
    revisados: revisados || 0,
    evolucao: evolucaoArr,
    atualizadoEm: new Date().toISOString(),
    trimestre: nomeAbaUsada,
    diagnosticoCores: coresNaoMapeadas || {}
  };
}

// ============================================================
// HELPERS
// ============================================================

function hojeMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function sameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ============================================================
// TESTE — rodar manualmente no editor pra ver se o JSON tá ok
// ============================================================

function teste() {
  Logger.log(JSON.stringify(montarDados(), null, 2));
}
