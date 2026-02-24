// server.js - NBA Brain Pro Bot v8.1 - Corrigido para Render Free (tfjs puro JS)
const express = require('express');
const { Telegraf } = require('telegraf');
const axios = require('axios');
const http = require('http');
let tf;
try {
  tf = require('@tensorflow/tfjs');
  console.log('TensorFlow.js carregado com sucesso (versão pura JS)');
} catch (err) {
  console.warn('TensorFlow.js não carregado. Usando fallback simples.', err.message);
  tf = {
    tensor: () => ({ dataSync: () => [0.5] }),
    sequential: () => ({ predict: () => ({ dataSync: () => [0.5] }) })
  }; // Fallback mínimo
}

const app = express();
app.use(express.json());

// Configurações
const BOT_TOKEN = '8045598302:AAFD5EN4uelzckSFxp8Wn43na0IdcBolqOo';
const bot = new Telegraf(BOT_TOKEN);
const PORT = process.env.PORT || 3000;
const ODDS_API_KEY = process.env.ODDS_API_KEY || '';
const ALLOWED_USER_IDS = [7707876089];

// Cache de odds
let oddsCache = {};
let lastCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000;

// Middleware privacidade
bot.use((ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId || !ALLOWED_USER_IDS.includes(userId)) {
    console.log(`Acesso negado: ${userId}`);
    return;
  }
  return next();
});

// Classe base para Agentes (simplificada para evitar crash)
class BaseAgent {
  constructor(name) {
    this.name = name;
  }

  async predict(data) {
    // Fallback simples: confiança 0.5–0.9 aleatória
    return Math.random() * 0.4 + 0.5;
  }

  getAction(state) {
    return Math.random() > 0.3 ? 'bet' : 'skip';
  }

  updateQ(state, action, reward, nextState) {
    // Simulação simples de evolução (sem Q-table pesada)
    console.log(`${this.name} atualizado com recompensa ${reward}`);
  }
}

// Aurora - Líder (simplificada)
class Aurora {
  constructor() {
    this.agents = [
      new BaseAgent('Anomaly Guardian'),
      new BaseAgent('Value Hunter'),
      new BaseAgent('Momentum Analyzer'),
      new BaseAgent('Risk Mitigator'),
      new BaseAgent('Bias Detector'),
      new BaseAgent('RLP Hunter'),
      new BaseAgent('Moneyline Agent'),
      new BaseAgent('Spread Agent'),
      new BaseAgent('OverUnder Agent'),
      new BaseAgent('Parlay Agent'),
      new BaseAgent('Assists Specialist'),
      new BaseAgent('Points Specialist'),
      new BaseAgent('Rebounds Specialist')
    ];
  }

  async decide(game) {
    const votes = await Promise.all(this.agents.map(a => a.predict(game)));
    const avg = votes.reduce((s, v) => s + v, 0) / votes.length;
    if (avg > 0.7) {
      return {action: 'bet', stake: 1.5};
    }
    return {action: 'skip'};
  }
}

const aurora = new Aurora();

// Fetch odds reais
async function fetchRealOdds() {
  if (Date.now() - lastCacheTime < CACHE_DURATION && Object.keys(oddsCache).length > 0) {
    return oddsCache;
  }

  if (!ODDS_API_KEY) {
    console.warn('ODDS_API_KEY não configurada. Usando mock.');
    return generateMockOdds();
  }

  try {
    const url = `https://api.the-odds-api.com/v4/sports/basketball_nba/odds?regions=us,eu&markets=h2h,spreads,totals,player_points,player_assists,player_rebounds&bookmakers=bet365,betano,pinnacle&apiKey=${ODDS_API_KEY}`;
    const res = await axios.get(url);
    oddsCache = res.data;
    lastCacheTime = Date.now();
    console.log(`Odds reais atualizadas: ${res.data.length} jogos`);
    return res.data;
  } catch (err) {
    console.error('Erro The Odds API:', err.message);
    return generateMockOdds();
  }
}

function generateMockOdds() {
  return [{
    id: 'mock1',
    home_team: 'Lakers',
    away_team: 'Warriors',
    bookmakers: [{key: 'bet365', markets: [{key: 'h2h', outcomes: [{name: 'Lakers', price: -150}]}]}]
  }];
}

// Scan
async function scanForUser(userId) {
  const oddsData = await fetchRealOdds();
  for (const game of oddsData.slice(0, 3)) {
    const decision = await aurora.decide(game);
    console.log(`Aurora decidiu para ${game.home_team} vs ${game.away_team}: ${decision.action}`);
  }
}

// Comandos básicos
bot.start((ctx) => ctx.reply('Bem-vindo ao NBA Brain Pro! Teste OK. Envie /scan para testar.'));
bot.command('scan', async (ctx) => {
  ctx.reply('Analisando jogos...');
  await scanForUser(ctx.from.id);
  ctx.reply('Scan concluído! Veja logs para detalhes.');
});

// Servidor
app.get('/', (req, res) => res.send('NBA Brain Pro Online!'));

app.listen(PORT, () => console.log(`Servidor na porta ${PORT}`));

bot.launch().catch(err => console.error('Erro ao iniciar bot:', err));
console.log('Bot iniciado!');

// Keep-alive
setInterval(() => {
  http.get(`http://localhost:${PORT}/`, () => {}).on('error', e => console.log('Ping erro:', e.message));
}, 14 * 60 * 1000);
