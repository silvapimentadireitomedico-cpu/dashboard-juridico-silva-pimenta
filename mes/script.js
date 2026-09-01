// =========================================================
// Silva Pimenta — Dashboard Jurídico
// =========================================================

// URL do Apps Script implantado como Web App.
// Endpoint que serve o JSON da planilha do Silva Pimenta.
// APOSENTADO (10/07/2026): Apps Script substituido pelo motor dados-planilha.js
const API_URL = null;

// Equipe na ordem que aparece na planilha
// (Julia saiu 13/05; Hugo e Rafael saíram — removidos 05/08/2026)
const EQUIPE = ['MAX', 'STELLA', 'NATALY', 'ISABELLA', 'ANA', 'SUELLEN'];

// Divisão do William (05/08/2026): ADVOGADOS x ESTAGIÁRIOS.
// Quem NÃO está na lista de advogados conta como estagiário (novos entram sozinhos).
const ADVOGADOS = ['ANA', 'SUELLEN', 'MAX', 'RODRIGO']; // Rodrigo e advogado (William 25/08/2026)
const ehAdvogado = (nome) => ADVOGADOS.includes(String(nome || '').trim().toUpperCase());

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
const POLL_MS = /[?&]tv=1/.test(location.search) ? 300000 : 30000; // na TV (?tv=1) 5 min: parse do xlsx engasga o Fire Stick

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
    img.src = `../fotos/${slug}.${FOTO_EXTS[idx]}?v=${FOTO_VER}`;
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
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const agora = (typeof _hoje === 'function' ? _hoje() : new Date());
  document.getElementById('trimestreValue').textContent = 'Mês';
  document.getElementById('periodValue').textContent = MESES[agora.getMonth()] + ' · ' + agora.getFullYear();
  const totalEl = document.getElementById('totalValue');
  animarNumero(totalEl, dados.totalGeral || 0);
}

function renderPodio(dados) {
  const ranking = dados.ranking || [];
  const adv = ranking.filter(r => ehAdvogado(r.nome));
  const est = ranking.filter(r => !ehAdvogado(r.nome));

  // som quando troca o 1º de qualquer grupo (chave composta)
  const liderAtual = (adv[0] ? adv[0].nome : '-') + '|' + (est[0] ? est[0].nome : '-');
  if (ultimoLider !== null && liderAtual !== ultimoLider) tocarSomNovoLider();
  ultimoLider = liderAtual;

  const slots = [
    { item: adv[0], el: 'podium-adv-1' },
    { item: adv[1], el: 'podium-adv-2' },
    { item: est[0], el: 'podium-est-1' },
    { item: est[1], el: 'podium-est-2' }
  ];
  slots.forEach(({ item, el }) => {
    const nodeEl = document.getElementById(el);
    if (!nodeEl) return;
    const nameEl = nodeEl.querySelector('.podium-name');
    const numEl = nodeEl.querySelector('.podium-count-num');
    const photoEl = nodeEl.querySelector('.podium-photo');
    if (!item) {
      nameEl.textContent = '—';
      numEl.textContent = '0';
      numEl.dataset.count = 0;
      photoEl.style.backgroundImage = '';
      photoEl.classList.remove('with-image');
      photoEl.textContent = '';
      return;
    }
    nameEl.textContent = capitalize(item.nome);
    setFotoOrInicial(photoEl, item.nome);
    animarNumero(numEl, item.qtd);
  });
}

function renderRankingLista(elId, ranking, max) {
  const list = document.getElementById(elId);
  if (!list) return;
  list.innerHTML = '';
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
    setFotoOrInicial(row.querySelector('.ranking-photo'), item.nome);
    requestAnimationFrame(() => {
      row.querySelector('.ranking-bar').style.width = ((item.qtd / max) * 100) + '%';
    });
  });
}

function renderRanking(dados) {
  const ranking = dados.ranking || [];
  if (ranking.length === 0) return;
  const max = Math.max(...ranking.map(r => r.qtd), 1);  // régua única: barras comparáveis entre grupos
  renderRankingLista('rankingAdv', ranking.filter(r => ehAdvogado(r.nome)), max);
  renderRankingLista('rankingEst', ranking.filter(r => !ehAdvogado(r.nome)), max);
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

// Vencedores do mês anterior (William, 01/09/2026): duas disputas, ADVOGADOS e ESTAGIÁRIOS,
// 3 de cada, no cabeçalho (advogados à esquerda do título, estagiários à direita, como as tabelas).
// Vem pronto do motor (dados.vencedores); some se a aba do mês anterior não existe.
function renderVencedores(dados) {
  const v = dados.vencedores;
  const grupos = [
    { box: 'vencAdv', tit: 'vencAdvTit', lista: 'vencAdvLista', rot: 'Advogados', filtro: r => ehAdvogado(r.nome) },
    { box: 'vencEst', tit: 'vencEstTit', lista: 'vencEstLista', rot: 'Estagiários', filtro: r => !ehAdvogado(r.nome) },
  ];
  grupos.forEach(g => {
    const box = document.getElementById(g.box); if (!box) return;
    const top = v ? (v.ranking || []).filter(g.filtro).filter(r => r.qtd > 0).slice(0, 3) : [];
    if (!top.length) { box.hidden = true; return; }
    box.hidden = false;
    document.getElementById(g.tit).textContent = '🏆 ' + g.rot + ' · ' + v.rotulo;
    const el = document.getElementById(g.lista);
    el.innerHTML = top.map((r, i) => `<div class="venc-item v${i + 1}">
        <div class="venc-photo-wrap"><div class="venc-photo"></div><div class="venc-medal">${i + 1}º</div></div>
        <div class="venc-txt"><div class="venc-name">${capitalize(r.nome)}</div>
        <div class="venc-qtd">${r.qtd}<small>iniciais</small></div></div></div>`).join('');
    top.forEach((r, i) => setFotoOrInicial(el.children[i].querySelector('.venc-photo'), r.nome));
  });
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
  renderVencedores(dados);
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
    if (window.__tvVisivel === false) return; // escondido na TV: fica pausado
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
setInterval(() => { if (window.__tvVisivel !== false) { window.__ultRefresh = Date.now(); refresh(); } }, POLL_MS);


// Som da Inspetora Fernanda: "sonar de lupa" curtinho, no MÁXIMO 1x a cada 3 min
// (Web Audio, mesmo esquema do ding-dong; silencia se autoplay bloquear)
function tocarSomInspetora() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const tom = (freq, inicio, dur, vol) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + inicio;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(vol, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + dur);
    };
    tom(660, 0, 0.25, 0.18);      // "tu"
    tom(990, 0.22, 0.35, 0.16);   // "dum" (subida de quem achou algo)
  } catch (e) { /* autoplay bloqueado: silencia */ }
}
setInterval(() => { if (window.__tvVisivel !== false) tocarSomInspetora(); }, 180000);


// Inspetora Fernanda VIGIA quem está no vermelho (sem produção hoje).
// v2: NÃO entra no DOM da linha (refresh dos dados a destruía) — VOA por coordenadas
// até a pessoa, alternando a cada 4s; sem devedores, volta pro canto do rodapé.
let __vigiaIdx = 0;
function moverInspetora() {
  const insp = document.getElementById('inspetora');
  const cont = document.querySelector('.dashboard-container');
  if (!insp || !cont) return;
  const alvos = document.querySelectorAll('.ranking-item.sem-hoje');
  if (!alvos.length) {
    insp.classList.remove('vigiando');
    insp.style.left = ''; insp.style.top = '';
    return;
  }
  const alvo = alvos[__vigiaIdx % alvos.length];
  __vigiaIdx++;
  const cr = cont.getBoundingClientRect();
  const ar = alvo.getBoundingClientRect();
  const scale = cr.width / 1920;
  const left = (ar.right - cr.left) / scale - 150;  // à direita da linha, antes do número
  const top  = (ar.top - cr.top) / scale - 46;      // avatar "atrás" da barra, espiando
  insp.classList.add('vigiando');
  insp.style.left = left + 'px';
  insp.style.top  = top + 'px';
}
setInterval(() => { if (window.__tvVisivel !== false) moverInspetora(); }, 4000);
setTimeout(moverInspetora, 3000);


// ============ COBRANÇA DAS 17:00 (William 05/08) ============
// Todo dia às 17:00, se houver alguém SEM produção no dia (.sem-hoje),
// a TV toca alerta + mostra banner gigante da Fernanda + FALA a cobrança.
// Trava por localStorage: 1x por dia (compartilhada entre os painéis, mesma origem).
function falarCobranca(texto) {
  try {
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'pt-BR'; u.rate = 0.95; u.pitch = 1.05; u.volume = 1;
    const vozes = speechSynthesis.getVoices();
    const pt = vozes.find(v => /pt[-_]BR/i.test(v.lang)) || vozes.find(v => /^pt/i.test(v.lang));
    if (pt) u.voice = pt;
    speechSynthesis.speak(u);
  } catch (e) { /* sem voz: banner + som seguram */ }
}
function somCobranca() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    [[523,0,.18],[659,.2,.18],[784,.4,.35]].forEach(([f,i,d]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = f;
      const t0 = ctx.currentTime + i;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(.22, t0 + .02);
      g.gain.exponentialRampToValueAtTime(.001, t0 + d);
      o.connect(g); g.connect(ctx.destination); o.start(t0); o.stop(t0 + d);
    });
  } catch (e) {}
}
function mostrarCobranca() {
  if (document.getElementById('cobranca-overlay')) return;
  const ov = document.createElement('div');
  ov.id = 'cobranca-overlay';
  ov.innerHTML = '<img src="' + (document.querySelector('.inspetora-img') ? document.querySelector('.inspetora-img').src : '') + '" alt="">' +
    '<div class="cobranca-txt">TEM GENTE QUE AINDA<br>NÃO FEZ HOJE, HEIN! 👀</div>';
  (document.querySelector('.dashboard-container') || document.body).appendChild(ov);
  somCobranca();
  setTimeout(() => falarCobranca('Atenção! Tem gente que ainda não fez hoje, hein!'), 700);
  setTimeout(() => ov.remove(), 22000);
}
// TV (25/08): o rotador avisa por postMessage se este painel está NA TELA; fora da TV é sempre visível.
window.__tvVisivel = true;
window.addEventListener('message', function (e) {
  if (!(e && e.data && e.data.tv)) return;
  window.__tvVisivel = (e.data.tv === 'visible');
  const kv = document.querySelector('.keepalive');
  if (window.__tvVisivel) {
    if (kv && kv.paused) { const pp = kv.play(); if (pp && pp.catch) pp.catch(function () {}); }
    if (typeof refresh === 'function' && Date.now() - (window.__ultRefresh || 0) > Math.min(POLL_MS, 300000)) { window.__ultRefresh = Date.now(); refresh(); }
  } else if (kv && !kv.paused) { kv.pause(); }
});
function checarCobranca1700() {
  const agora = new Date();
  if (agora.getHours() !== 17 || agora.getMinutes() >= 2) return;
  if (window.__tvVisivel === false) return; // só o painel visível cobra (checa a cada 5s, pega a janela de 10s do rotador)
  const key = 'fernanda-cobranca-' + agora.getFullYear() + '-' + (agora.getMonth()+1) + '-' + agora.getDate();
  try { if (localStorage.getItem(key)) return; } catch (e) {}
  if (!document.querySelectorAll('.ranking-item.sem-hoje').length) return;
  try { localStorage.setItem(key, '1'); } catch (e) {}
  mostrarCobranca();
}
setInterval(checarCobranca1700, 5000);
if (location.search.indexOf('cobranca=teste') >= 0) setTimeout(mostrarCobranca, 5000);
