// =========================================================
// Silva Pimenta — Dashboard Jurídico
// =========================================================

// URL do Apps Script implantado como Web App.
// Endpoint que serve o JSON da planilha do Silva Pimenta.
const API_URL = 'https://script.google.com/macros/s/AKfycbwt_Mm2GpDQB5OfbhIb04r7ZJydXCwFadfrzn4IA5stu29hGxMDeR_5uXJlIMfhZhBWXA/exec';

// Equipe na ordem que aparece na planilha
const EQUIPE = ['JULIA', 'HUGO', 'STELLA', 'RAFAEL', 'NATALY', 'ISABELLA', 'ANA', 'SUELLEN'];

// Cores das pílulas dos tipos de processo
const COR_TIPO = {
  'Auxílio': '#B6D7A8',
  'Consórcio': '#B4A7D6',
  'Abatimento': '#9FC5E8',
  'Suspensão': '#EA9999',
  'Seguro': '#F1C232',
  'INSS': '#FF66FF',
  'Eventuais': '#CC0000',
  'Livre IR': '#66E0E0',
  'Direito Médico': '#66E066',
  'Outros': '#888888'
};

// Polling — busca novos dados a cada 30s
const POLL_MS = 30000;

// =========================================================
// BUSCA DE DADOS
// =========================================================

async function fetchDados() {
  const url = API_URL || 'data-mock.json';
  try {
    const r = await fetch(url + (API_URL ? '?_=' + Date.now() : ''));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (err) {
    console.error('Erro buscando dados:', err);
    return null;
  }
}

// =========================================================
// RENDERIZAÇÃO
// =========================================================

function fotoUrl(nome) {
  return `fotos/${nome.toLowerCase().trim()}.jpg`;
}

function setFotoOrInicial(el, nome) {
  const img = new Image();
  img.onload = () => {
    el.style.backgroundImage = `url('${img.src}')`;
    el.classList.add('with-image');
    el.textContent = '';
  };
  img.onerror = () => {
    el.style.backgroundImage = '';
    el.classList.remove('with-image');
    el.textContent = nome.charAt(0);
  };
  img.src = fotoUrl(nome);
}

function animarNumero(el, alvo, duracao = 1200) {
  const inicio = parseInt(el.dataset.count || '0', 10);
  const t0 = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - t0) / duracao);
    const ease = 1 - Math.pow(1 - t, 3);
    const valor = Math.round(inicio + (alvo - inicio) * ease);
    el.textContent = valor;
    if (t < 1) requestAnimationFrame(tick);
    else el.dataset.count = alvo;
  }
  requestAnimationFrame(tick);
}

function renderHeader(dados) {
  const trimestres = [
    { nome: '1º Trimestre', meses: 'Janeiro · Fevereiro · Março' },
    { nome: '2º Trimestre', meses: 'Abril · Maio · Junho' },
    { nome: '3º Trimestre', meses: 'Julho · Agosto · Setembro' },
    { nome: '4º Trimestre', meses: 'Outubro · Novembro · Dezembro' }
  ];
  const agora = new Date();
  const trimIdx = Math.floor(agora.getMonth() / 3);
  const t = trimestres[trimIdx];

  document.getElementById('trimestreValue').textContent = t.nome;
  document.getElementById('periodValue').textContent = `${t.meses} · ${agora.getFullYear()}`;

  const totalEl = document.getElementById('totalValue');
  animarNumero(totalEl, dados.totalGeral || 0);
}

function renderPodio(dados) {
  const top3 = (dados.ranking || []).slice(0, 3);
  // ordem na tela: 2º (esq), 1º (centro), 3º (dir)
  const ordem = [
    { idx: 1, el: 'podium2' },
    { idx: 0, el: 'podium1' },
    { idx: 2, el: 'podium3' }
  ];
  ordem.forEach(({ idx, el }) => {
    const nodeEl = document.getElementById(el);
    const item = top3[idx];
    const nameEl = nodeEl.querySelector('.podium-name');
    const numEl = nodeEl.querySelector('.podium-count-num');
    const photoEl = nodeEl.querySelector('.podium-photo');
    if (!item) {
      nameEl.textContent = '—';
      numEl.textContent = '0';
      numEl.dataset.count = 0;
      photoEl.style.backgroundImage = '';
      return;
    }
    nameEl.textContent = capitalize(item.nome);
    setFotoOrInicial(photoEl, item.nome);
    animarNumero(numEl, item.qtd);
  });
}

function renderRanking(dados) {
  const list = document.getElementById('rankingList');
  list.innerHTML = '';
  const ranking = dados.ranking || [];
  if (ranking.length === 0) return;
  const max = Math.max(...ranking.map(r => r.qtd), 1);

  ranking.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'ranking-item';
    row.innerHTML = `
      <div class="ranking-pos">${i + 1}º</div>
      <div class="ranking-photo"></div>
      <div class="ranking-bar-wrap">
        <div class="ranking-bar" style="width: 0%"></div>
        <div class="ranking-name">${capitalize(item.nome)}</div>
      </div>
      <div class="ranking-qtd">${item.qtd}</div>
    `;
    list.appendChild(row);
    const photoEl = row.querySelector('.ranking-photo');
    setFotoOrInicial(photoEl, item.nome);
    requestAnimationFrame(() => {
      row.querySelector('.ranking-bar').style.width = ((item.qtd / max) * 100) + '%';
    });
  });
}

function renderTipos(dados) {
  const grid = document.getElementById('tiposGrid');
  grid.innerHTML = '';
  const tipos = dados.tipos || [];
  tipos.forEach(t => {
    const cor = COR_TIPO[t.tipo] || COR_TIPO['Outros'];
    const card = document.createElement('div');
    card.className = 'tipo-card';
    card.innerHTML = `
      <div class="tipo-dot" style="background:${cor}"></div>
      <div class="tipo-info">
        <div class="tipo-nome">${t.tipo}</div>
        <div class="tipo-qtd">${t.qtd}</div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function renderFooter(dados) {
  const tot = (dados.ranking || []).reduce((s, r) => s + (r.qtdHoje || 0), 0);
  const top = [...(dados.ranking || [])]
    .filter(r => (r.qtdHoje || 0) > 0)
    .sort((a, b) => b.qtdHoje - a.qtdHoje)[0];
  const todayEl = document.getElementById('footerToday');
  if (tot === 0) {
    todayEl.textContent = 'Aguardando primeiros registros do dia';
  } else if (top) {
    todayEl.textContent = `Hoje: ${tot} iniciais · destaque ${capitalize(top.nome)} (${top.qtdHoje})`;
  } else {
    todayEl.textContent = `Hoje: ${tot} iniciais`;
  }
  document.getElementById('footerTime').textContent =
    new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function capitalize(nome) {
  return nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase();
}

// =========================================================
// LOOP
// =========================================================

function renderChart(dados) {
  const svg = document.getElementById('chart');
  if (!svg) return;
  svg.innerHTML = '';
  const evol = dados.evolucao || [];
  if (evol.length === 0) return;

  const W = 800, H = 220;
  const padL = 30, padR = 16, padT = 16, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const max = Math.max(...evol.map(d => d.total), 5);
  const stepX = innerW / (evol.length - 1);

  // Defs gradient
  const defs = `<defs><linearGradient id="gradGold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#C5A57A" stop-opacity="0.5"/>
    <stop offset="100%" stop-color="#C5A57A" stop-opacity="0"/>
  </linearGradient></defs>`;

  // Linhas de grid (3 horizontais)
  let grid = '';
  for (let i = 1; i <= 3; i++) {
    const y = padT + (innerH / 4) * i;
    grid += `<line class="chart-axis" x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"/>`;
  }

  // Pontos
  const pontos = evol.map((d, i) => ({
    x: padL + i * stepX,
    y: padT + innerH - (d.total / max) * innerH,
    total: d.total,
    data: d.data
  }));

  const linePath = pontos.map((p, i) => (i === 0 ? 'M' : 'L') + p.x + ',' + p.y).join(' ');
  const areaPath = linePath + ` L${pontos[pontos.length - 1].x},${padT + innerH} L${pontos[0].x},${padT + innerH} Z`;

  // Labels eixo X (datas a cada ~5)
  let xLabels = '';
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  pontos.forEach((p, i) => {
    if (i % 5 !== 0 && i !== pontos.length - 1) return;
    const dt = new Date(evol[i].data + 'T00:00:00');
    const txt = dt.getDate() + ' ' + meses[dt.getMonth()];
    xLabels += `<text class="chart-label" x="${p.x}" y="${H - 8}" text-anchor="middle">${txt}</text>`;
  });

  // Valor pico (último ponto que tem valor)
  const lastNonZero = [...pontos].reverse().find(p => p.total > 0);

  // Pontos visuais
  let dots = '';
  pontos.forEach((p, i) => {
    const eHoje = i === pontos.length - 1;
    if (eHoje) {
      dots += `<circle class="chart-dot-today" cx="${p.x}" cy="${p.y}" r="6"/>`;
      if (p.total > 0) {
        dots += `<text class="chart-value" x="${p.x}" y="${p.y - 12}">${p.total}</text>`;
      }
    } else if (p.total > 0 && i % 3 === 0) {
      dots += `<circle class="chart-dot" cx="${p.x}" cy="${p.y}" r="3"/>`;
    }
  });

  svg.innerHTML = defs + grid +
    `<path class="chart-area" d="${areaPath}"/>` +
    `<path class="chart-line" d="${linePath}"/>` +
    dots + xLabels;
}

async function refresh() {
  const dados = await fetchDados();
  if (!dados || dados.erro) return;
  renderHeader(dados);
  renderPodio(dados);
  renderRanking(dados);
  renderChart(dados);
  renderTipos(dados);
  renderFooter(dados);
}

refresh();
setInterval(refresh, POLL_MS);
