const MOTOR_CFG = {
  url: 'https://sp-tag-lead-filter-x7k2.pages.dev/sheet-xlsx?qual=iniciais',
  linhaCabecalho: 4,
  linhaDados: 5,
  abas: function () {
    const hoje = new Date(); const ano = hoje.getFullYear(); const mes = hoje.getMonth() + 1;
    let nome;
    if (mes <= 3) nome = 'JANEIRO - MARÇO';
    else if (mes <= 6) nome = 'ABRIL - JUNHO';
    else if (mes <= 9) nome = 'JULHO - SETEMBRO';
    else nome = 'OUTUBRO - DEZEMBRO';
    return [nome + ' ' + ano, nome];
  },
  extras: function (cel) { // estoque J4 · revisados M4 · entradas P1..P4 · encerramentos Q2
    const num = (r, c) => { const cc = cel(r, c); return (cc && typeof cc.v === 'number') ? cc.v : 0; };
    return {
      estoque: num(4, 10), revisados: num(4, 13),
      entradasMarco: num(1, 16), entradasAbril: num(2, 16), entradasMaio: num(3, 16),
      totalEntradas: num(4, 16), totalEncerramentos: num(2, 17)
    };
  },
  posProcesso: null
};

// =========================================================
// MOTOR DA PLANILHA — le o xlsx do Google direto (via proxy no worker)
// e monta o MESMO JSON que o Apps Script montava. Sem Apps Script.
// EQUIPE DINAMICA: quem estiver na linha de cabecalho da planilha aparece;
// trocou o nome na planilha, trocou no dashboard (sem mexer em codigo).
// =========================================================

const COR_PRODUTO_MAPA = {
  'F1C232': 'Seguro', 'B6D7A8': 'Auxílio', 'CC0000': 'Eventuais', 'B4A7D6': 'Consórcio',
  'EA9999': 'Suspensão', '00FFFF': 'Livre IR', '9FC5E8': 'Abatimento', 'FF00FF': 'INSS',
  '00FF00': 'Direito Médico',
  // presets do Sheets usados por engano (mesma intencao)
  'FBBC04': 'Seguro', 'FF9900': 'Seguro', 'A4C2F4': 'Abatimento', 'EA4335': 'Eventuais',
  '8E7CC3': 'Consórcio', '93C47D': 'Auxílio'
};

function _norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}
function _escolherAba(nomes, candidatos) {
  for (const cand of candidatos) {
    const alvo = _norm(cand);
    for (const nm of nomes) if (_norm(nm) === alvo) return nm;
  }
  // fallback: contem
  for (const cand of candidatos) {
    const alvo = _norm(cand);
    for (const nm of nomes) if (_norm(nm).indexOf(alvo) >= 0) return nm;
  }
  return null;
}
function _serialParaData(v) { // serial do Sheets -> {y,m,d} (sem fuso)
  const ms = Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000;
  const d = new Date(ms);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}
function _corDaCelula(cell) {
  if (!cell || !cell.s) return null;
  const f = cell.s.fgColor || cell.s.bgColor;
  if (!f || !f.rgb) return null;
  const hex = String(f.rgb).slice(-6).toUpperCase();
  if (hex === 'FFFFFF' || hex === '000000') return null;
  return hex;
}
function _fmtKey(y, m, d) {
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

async function montarDadosDaPlanilha() {
  const resp = await fetch(MOTOR_CFG.url + '&_=' + Date.now());
  if (!resp.ok) throw new Error('planilha HTTP ' + resp.status);
  const wb = XLSX.read(await resp.arrayBuffer(), { cellStyles: true });
  const nomeAba = _escolherAba(wb.SheetNames, MOTOR_CFG.abas());
  if (!nomeAba) throw new Error('aba nao encontrada: ' + MOTOR_CFG.abas().join(' | '));
  const ws = wb.Sheets[nomeAba];
  const fim = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1').e.r + 1; // ultima linha (1-based)
  const cel = (r, c) => ws[XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })];

  // EQUIPE dinamica: linha de cabecalho, colunas B..I
  const equipe = [];
  for (let c = 2; c <= 9; c++) {
    const cc = cel(MOTOR_CFG.linhaCabecalho, c);
    const v = cc && cc.v;
    if (v && String(v).trim()) equipe.push({ nome: String(v).trim().toUpperCase(), col: c });
  }

  const ranking = {}, rankingHoje = {}, seguroPor = {};
  equipe.forEach(p => { ranking[p.nome] = 0; rankingHoje[p.nome] = 0; seguroPor[p.nome] = 0; });
  const tipos = {}; let totalGeral = 0; const evolucaoMap = {};
  const agora = new Date();
  const hj = { y: agora.getFullYear(), m: agora.getMonth() + 1, d: agora.getDate() };

  for (let r = MOTOR_CFG.linhaDados; r <= fim; r++) {
    const dc = cel(r, 1);
    if (!dc) continue;
    let dt = null;
    if (dc.t === 'n' && dc.v > 20000 && dc.v < 80000) dt = _serialParaData(dc.v);
    else if (dc.t === 'd' && dc.v instanceof Date) dt = { y: dc.v.getFullYear(), m: dc.v.getMonth() + 1, d: dc.v.getDate() };
    if (!dt) continue;
    const ehHoje = dt.y === hj.y && dt.m === hj.m && dt.d === hj.d;
    const dataKey = _fmtKey(dt.y, dt.m, dt.d);
    for (const p of equipe) {
      const cc = cel(r, p.col);
      const v = cc && cc.v;
      if (v == null || String(v).trim() === '') continue;
      const txt = String(v).trim().toLowerCase();
      if (txt.indexOf('aguard') >= 0) continue;
      ranking[p.nome]++; totalGeral++;
      if (ehHoje) rankingHoje[p.nome]++;
      evolucaoMap[dataKey] = (evolucaoMap[dataKey] || 0) + 1;
      const hex = _corDaCelula(cc);
      if (hex) {
        const produto = COR_PRODUTO_MAPA[hex] || 'Outros';
        tipos[produto] = (tipos[produto] || 0) + 1;
        if (produto === 'Seguro') seguroPor[p.nome]++;
      }
    }
  }

  const rankingArr = equipe.map(p => ({
    nome: p.nome, qtd: ranking[p.nome] || 0, qtdHoje: rankingHoje[p.nome] || 0, seguro: seguroPor[p.nome] || 0
  })).sort((a, b) => (b.qtd - a.qtd) || (b.seguro - a.seguro));
  const tiposArr = Object.keys(tipos).map(t => ({ tipo: t, qtd: tipos[t] })).sort((a, b) => b.qtd - a.qtd);

  const evolucaoArr = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - i);
    const k = _fmtKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
    evolucaoArr.push({ data: k, total: evolucaoMap[k] || 0 });
  }

  const out = {
    ranking: rankingArr, tipos: tiposArr, totalGeral: totalGeral,
    evolucao: evolucaoArr, atualizadoEm: new Date().toISOString(), trimestre: nomeAba
  };
  if (MOTOR_CFG.extras) Object.assign(out, MOTOR_CFG.extras(cel));
  if (MOTOR_CFG.posProcesso) MOTOR_CFG.posProcesso(out, nomeAba);
  return out;
}
