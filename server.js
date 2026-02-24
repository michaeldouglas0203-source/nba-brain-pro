// server.js - NBA Brain Pro Bot v8.0 com Aurora + The Odds API (somente Betano, Bet365, Pinnacle)
const express = require('express');
const { Telegraf } = require('telegraf');
const axios = require('axios');
const http = require('http');
const tf = require('@tensorflow/tfjs-node'); // IA server-side

const app = express();
app.use(express.json());

// Configurações
const BOT_TOKEN = '8045598302:AAFD5EN4uelzckSFxp8Wn43na0IdcBolqOo';
const bot = new Telegraf(BOT_TOKEN);
const PORT = process.env.PORT || 3000;
const ODDS_API_KEY = process.env.ODDS_API_KEY || ''; // Coloque no Render Environment
const ALLOWED_USER_IDS = [7707876089];

// Cache simples de odds (5 min)
let oddsCache = {};
let lastCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

// Middleware privacidade
bot.use((ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId || !ALLOWED_USER_IDS.includes(userId)) {
        console.log(`Acesso negado: ${userId}`);
        return;
    }
    return next();
});

// Classe base para Agentes (RL + TF.js)
class BaseAgent {
    constructor(name, inputDim) {
        this.name = name;
        this.qTable = new Map(); // Q(s,a)
        this.learningRate = 0.1;
        this.discountFactor = 0.95;
        this.explorationRate = 0.1;

        this.model = tf.sequential();
        this.model.add(tf.layers.multiHeadAttention({numHeads: 2, keyDim: 32, inputShape: [null, inputDim]}));
        this.model.add(tf.layers.dense({units: 32, activation: 'relu'}));
        this.model.add(tf.layers.dense({units: 1, activation: 'sigmoid'}));
        this.model.compile({optimizer: 'adam', loss: 'meanSquaredError'});
    }

    async predict(data) {
        const input = tf.tensor3d([data.map(d => d.values || [])]);
        const output = this.model.predict(input);
        return output.dataSync()[0];
    }

    getAction(state) {
        const key = JSON.stringify(state);
        if (!this.qTable.has(key)) this.qTable.set(key, [0, 0]); // [bet, skip]
        if (Math.random() < this.explorationRate) return Math.random() > 0.5 ? 'bet' : 'skip';
        const q = this.qTable.get(key);
        return q[0] > q[1] ? 'bet' : 'skip';
    }

    updateQ(state, action, reward, nextState) {
        const key = JSON.stringify(state);
        const nextKey = JSON.stringify(nextState);
        if (!this.qTable.has(nextKey)) this.qTable.set(nextKey, [0, 0]);
        const idx = action === 'bet' ? 0 : 1;
        const oldQ = this.qTable.get(key)[idx];
        const maxNext = Math.max(...this.qTable.get(nextKey));
        const newQ = oldQ + this.learningRate * (reward + this.discountFactor * maxNext - oldQ);
        this.qTable.get(key)[idx] = newQ;
    }
}

// Aurora - Líder
class Aurora {
    constructor() {
        this.agents = [
            new AnomalyGuardian(),
            new ValueHunter(),
            new MomentumAnalyzer(),
            new RiskMitigator(),
            new BiasDetector(),
            new RLPHunter(),
            new MoneylineAgent(),
            new SpreadAgent(),
            new OverUnderAgent(),
            new ParlayAgent(),
            new AssistsSpecialist(),
            new PointsSpecialist(),
            new ReboundsSpecialist()
        ];
    }

    async decide(game) {
        const votes = await Promise.all(this.agents.map(a => a.predict(game)));
        const avgConfidence = votes.reduce((sum, v) => sum + (v || 0), 0) / votes.length;

        if (avgConfidence > 0.7) {
            const stake = this.calculateKelly(votes, game.bankroll);
            return {action: 'bet', stake, votes};
        }
        return {action: 'skip'};
    }

    calculateKelly(votes, bankroll) {
        const avgP = votes.reduce((s, v) => s + (v.prob || 0.5), 0) / votes.length;
        const avgB = votes.reduce((s, v) => s + (v.odds - 1 || 1), 0) / votes.length;
        const kelly = (avgP * avgB - (1 - avgP)) / avgB;
        return Math.max(0, kelly) * bankroll * 0.5; // Half-Kelly
    }
}

const aurora = new Aurora();

// Fetch odds reais (Betano, Bet365, Pinnacle)
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
        console.log(`Odds atualizadas: ${res.data.length} jogos`);
        return res.data;
    } catch (err) {
        console.error('Erro The Odds API:', err.message);
        return generateMockOdds();
    }
}

function generateMockOdds() {
    // Mock simples (para teste)
    return [{
        id: 'mock_game_1',
        home_team: 'Lakers',
        away_team: 'Warriors',
        commence_time: new Date(Date.now() + 3600000).toISOString(),
        bookmakers: [{
            key: 'bet365',
            markets: [{key: 'h2h', outcomes: [{name: 'Lakers', price: -150}, {name: 'Warriors', price: +130}]}]
        }]
    }];
}

// Scan usando odds reais
async function scanForUser(userId) {
    const user = users.get(userId) || {bankroll: 100, autoTrading: false};
    const oddsData = await fetchRealOdds();

    for (const game of oddsData) {
        const decision = await aurora.decide(game);
        if (decision.action === 'bet') {
            executeBet(userId, decision, game);
        }
    }
}

// Outros comandos e lógica original mantidos...

// Início do bot
(async () => {
    await bot.launch();
    console.log('🤖 Bot iniciado com Aurora comandando!');
})();

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

// Keep-alive
setInterval(() => {
    http.get(`http://localhost:${PORT}/`, () => {}).on('error', e => console.log('Ping erro:', e.message));
}, 14 * 60 * 1000);
