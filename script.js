// =========================================================
// Silva Pimenta — Dashboard Jurídico
// =========================================================

// URL do Apps Script implantado como Web App.
// Endpoint que serve o JSON da planilha do Silva Pimenta.
// APOSENTADO (10/07/2026): Apps Script substituido pelo motor dados-planilha.js
const API_URL = null;

// Equipe na ordem que aparece na planilha
// (Julia saiu, substituída por MAX em 13/05/2026)
const EQUIPE = ['MAX', 'HUGO', 'STELLA', 'RAFAEL', 'NATALY', 'ISABELLA', 'ANA', 'SUELLEN'];

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

// Estado pra detectar troca de 1º lugar entre refreshes
let ultimoLider = null;

// =========================================================
// BUSCA DE DADOS
// =========================================================

async function fetchDados() {
  try {
    return await montarDadosDaPlanilha();
  } catch (err) {
    console.error('Erro lendo a planilha:', err);
    return null;
  }
}

// =========================================================
// RENDERIZAÇÃO
// =========================================================

// Cache buster: muda a cada carga da página (auto-reload de 30min recarrega as fotos).
// Garante que troca de foto aparece sem precisar limpar cache do navegador.
const FOTO_VER = Date.now();
// Tenta extensões nesta ordem — .png primeiro (padrão atual), .jpg como fallback
const FOTO_EXTS = ['png', 'jpg'];

function setFotoOrInicial(el, nome) {
  const slug = nome.toLowerCase().trim();
  const tentar = (idx) => {
    if (idx >= FOTO_EXTS.length) {
      // Nenhuma extensão funcionou — mostra inicial
      el.style.backgroundImage = '';
      el.classList.remove('with-image');
      el.textContent = nome.charAt(0);
      return;
    }
    const img = new Image();
    img.onload = () => {
      el.style.backgroundImage = `url('${img.src}')`;
      el.classList.add('with-image');
      el.textContent = '';
    };
    img.onerror = () => tentar(idx + 1);
    img.src = `fotos/${slug}.${FOTO_EXTS[idx]}?v=${FOTO_VER}`;
  };
  tentar(0);
}

// Toca "ding-dong" curto via Web Audio API quando o 1º lugar troca.
// Sem arquivo externo — funciona offline no Silk Browser do Fire Stick.
function tocarSomNovoLider() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const tom = (freq, inicio, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + inicio;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.35, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur);
    };
    tom(880, 0, 0.4);       // A5
    tom(1318.51, 0.25, 0.6); // E6
  } catch (e) {
    // Autoplay pode ser bloqueado antes da 1ª interação no Silk; silencia
  }
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

  // Detecta troca de 1º lugar e toca som (não toca na 1ª carga)
  const liderAtual = top3[0] ? top3[0].nome : null;
  if (ultimoLider !== null && liderAtual && liderAtual !== ultimoLider) {
    tocarSomNovoLider();
  }
  if (liderAtual) ultimoLider = liderAtual;

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
    const semHoje = (item.qtdHoje || 0) === 0;
    row.className = 'ranking-item' + (semHoje ? ' sem-hoje' : '');
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
        <div class="tipo-qtd">${t.qtd}</div>
        <div class="tipo-nome">${t.tipo}</div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function renderEstoque(dados) {
  const el = document.getElementById('estoqueValue');
  if (!el) return;
  animarNumero(el, Number(dados.estoque) || 0);
}

function renderRevisados(dados) {
  const el = document.getElementById('revisadosValue');
  if (!el) return;
  animarNumero(el, Number(dados.revisados) || 0);
}

function renderResumoMensal(dados) {
  const abrilEl = document.getElementById('entradasAbrilValue');
  const totalEl = document.getElementById('totalEntradasValue');
  const encEl   = document.getElementById('totalEncerramentosValue');
  if (abrilEl) animarNumero(abrilEl, Number(dados.entradasAbril) || 0);
  if (totalEl) animarNumero(totalEl, Number(dados.totalEntradas) || 0);
  if (encEl)   animarNumero(encEl,   Number(dados.totalEncerramentos) || 0);
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
  renderTipos(dados);
  renderRevisados(dados);
  renderEstoque(dados);
  renderResumoMensal(dados);
  renderFooter(dados);
}

// =========================================================
// SCALE AUTOMÁTICO — dashboard fixo 1920x1080 escala pra caber
// em qualquer tela (TV, monitor, laptop) mantendo proporção
// =========================================================
function scaleDashboard() {
  const container = document.querySelector('.dashboard-container');
  if (!container) return;
  const baseW = 1920, baseH = 1080;
  const scale = Math.min(window.innerWidth / baseW, window.innerHeight / baseH);
  container.style.transform = 'scale(' + scale + ')';
}
window.addEventListener('resize', scaleDashboard);
scaleDashboard();

// =========================================================
// KEEPALIVE — 3 camadas pra impedir TV/Fire Stick de dormir
//   1. Wake Lock API (moderno — pede ao SO pra manter tela acesa)
//   2. Video com movimento real tocando em loop
//   3. Auto-reload da pagina a cada 30 min (rede de seguranca)
// =========================================================

// Camada 1 — Wake Lock API
(async function pedirWakeLock() {
  if (!('wakeLock' in navigator)) return;
  let lock = null;
  const requisitar = async () => {
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => {
        // Se o sistema liberar (ex: tela bloqueou), tenta de novo quando visivel
      });
    } catch (e) {
      // Permissao negada ou nao suportado — silencia
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requisitar();
  });
  requisitar();
})();

// Camada 2 — manter o video rodando
(function manterKeepalive() {
  const v = document.querySelector('.keepalive');
  if (!v) return;
  const tentarPlay = () => {
    const p = v.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  };
  v.addEventListener('pause', tentarPlay);
  v.addEventListener('ended', tentarPlay);
  tentarPlay();
  setInterval(() => { if (v.paused) tentarPlay(); }, 30000);
})();

// Camada 3 — recarregar a pagina periodicamente
// 30 min: longo o suficiente pra nao incomodar, curto pra resetar qualquer
// estado bugado do Silk Browser (vazamentos de memoria, sockets travados).
setTimeout(() => {
  location.reload();
}, 30 * 60 * 1000);

refresh();
setInterval(refresh, POLL_MS);
