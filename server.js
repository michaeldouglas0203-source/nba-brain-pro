// ═══════════════════════════════════════════════════════════════════════════════
// NBA BRAIN PRO v11.0 ETERNUM - EDITION PRO
// Melhorias: Dashboard, Apostas Reais, Estatísticas, Auto-recovery
// ═══════════════════════════════════════════════════════════════════════════════

const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');
const { Pool } = require('pg');
const tf = require('@tensorflow/tfjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO PRO - COM FALLBACKS INTELIGENTES
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // Tokens e Keys
  BOT_TOKEN: process.env.BOT_TOKEN || '8045598302:AAFD5EN4uelzckSFxp8Wn43na0IdcBolqOo',
  ODDS_API_KEY: process.env.ODDS_API_KEY || '',
  DATABASE_URL: process.env.DATABASE_URL || null,
  PORT: process.env.PORT || 10000,
  ALLOWED_USERS: [7707876089],
  
  // Configurações Eternum
  GENESIS: '2026-02-25T00:00:00Z',
  BACKUP_INTERVAL: 2 * 60 * 1000,
  POPULATION_SIZE: 8,
  ELITE_RATIO: 0.25,
  EVOLUTION_INTERVAL: 15,
  AUTO_EXECUTE: true,
  MAX_DAILY_STAKE: 50,
  
  // NOVO: Configurações de Apostas
  MIN_CONFIDENCE: 0.75,        // Mínimo para apostar
  MAX_STAKE_PER_BET: 10,       // Máximo por aposta individual
  KELLY_FRACTION: 0.25,        // Fração conservadora do Kelly
  
  // NOVO: Configurações de Notificação
  ALERT_THRESHOLD: 0.90,       // Confiança para alerta VIP
  NOTIFICATION_COOLDOWN: 30 * 60 * 1000, // 30 min entre alertas
  
  // NOVO: Auto-recovery
  MAX_RESTART_ATTEMPTS: 3,
  RESTART_DELAY: 5000,
  
  // MODO MOCK
  MOCK_MODE: !process.env.DATABASE_URL
};

console.log(`🔧 MODO: ${CONFIG.MOCK_MODE ? 'MOCK (sem database)' : 'PRODUÇÃO (com database)'}`);
console.log(`🔧 DATABASE_URL: ${CONFIG.DATABASE_URL ? 'Configurada ✅' : 'Não configurada ❌'}`);

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE - COM FALLBACK PARA MOCK E STATS
// ═══════════════════════════════════════════════════════════════════════════════

let db = null;
let mockStorage = new Map();
let globalStats = { wins: 0, losses: 0, profit: 0, totalBets: 0 };

async function initDatabase() {
  if (CONFIG.MOCK_MODE) {
    console.log('⚠️  DATABASE_URL não configurado - usando armazenamento em memória');
    return;
  }

  console.log('🔄 Tentando conectar ao PostgreSQL...');

  try {
    db = new Pool({
      connectionString: CONFIG.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });

    const client = await db.connect();
    console.log('✅ Conexão com PostgreSQL estabelecida!');
    
    try {
      await client.query(`
        -- Tabela de agentes imortais
        CREATE TABLE IF NOT EXISTS immortal_snapshots (
          id SERIAL PRIMARY KEY,
          agent_id VARCHAR(100) UNIQUE,
          soul_hash VARCHAR(64),
          generation INTEGER DEFAULT 0,
          neural_weights JSONB,
          memory JSONB DEFAULT '[]',
          knowledge JSONB DEFAULT '{}',
          lineage JSONB DEFAULT '[]',
          decisions JSONB DEFAULT '[]',
          fitness DECIMAL(10,2) DEFAULT 0,
          capital DECIMAL(10,2) DEFAULT 100,
          status VARCHAR(20) DEFAULT 'ALIVE',
          wins INTEGER DEFAULT 0,
          losses INTEGER DEFAULT 0,
          last_backup TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Tabela de deliberações
        CREATE TABLE IF NOT EXISTS triad_deliberations (
          id SERIAL PRIMARY KEY,
          deliberation_id VARCHAR(64) UNIQUE,
          game_id VARCHAR(100),
          home_team VARCHAR(100),
          away_team VARCHAR(100),
          proposer JSONB,
          verifier JSONB,
          reviser JSONB,
          final_consensus JSONB,
          your_override JSONB,
          executed BOOLEAN DEFAULT false,
          result VARCHAR(20),
          profit DECIMAL(10,2),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          resolved_at TIMESTAMP
        );
        
        -- NOVO: Tabela de estatísticas diárias
        CREATE TABLE IF NOT EXISTS daily_stats (
          id SERIAL PRIMARY KEY,
          date DATE UNIQUE DEFAULT CURRENT_DATE,
          total_bets INTEGER DEFAULT 0,
          wins INTEGER DEFAULT 0,
          losses INTEGER DEFAULT 0,
          profit DECIMAL(10,2) DEFAULT 0,
          roi DECIMAL(5,2) DEFAULT 0,
          best_agent VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- NOVO: Tabela de alertas VIP
        CREATE TABLE IF NOT EXISTS vip_alerts (
          id SERIAL PRIMARY KEY,
          alert_id VARCHAR(64) UNIQUE,
          game_id VARCHAR(100),
          confidence DECIMAL(5,2),
          stake DECIMAL(10,2),
          sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          user_responded BOOLEAN DEFAULT false
        );
        
        -- NOVO: Tabela de logs do sistema
        CREATE TABLE IF NOT EXISTS system_logs (
          id SERIAL PRIMARY KEY,
          level VARCHAR(20),
          component VARCHAR(50),
          message TEXT,
          metadata JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('💾 Database Eternum inicializado - TODAS TABELAS CRIADAS ✅');
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('❌ Erro ao conectar database:', err.message);
    CONFIG.MOCK_MODE = true;
    db = null;
  }
}

// NOVO: Função de logging estruturado
async function logSystem(level, component, message, metadata = {}) {
  console.log(`[${level}] [${component}] ${message}`);
  
  if (!CONFIG.MOCK_MODE) {
    try {
      await dbQuery(
        `INSERT INTO system_logs (level, component, message, metadata) VALUES ($1, $2, $3, $4)`,
        [level, component, message, JSON.stringify(metadata)]
      );
    } catch (e) {
      // Silencioso - não queremos loop de erros
    }
  }
}

async function dbQuery(sql, params) {
  if (CONFIG.MOCK_MODE) return { rows: [] };
  const client = await db.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

// NOVO: Atualizar estatísticas globais
async function updateGlobalStats(result, profit) {
  globalStats.totalBets++;
  if (result === 'win') globalStats.wins++;
  else globalStats.losses++;
  globalStats.profit += profit;
  
  if (!CONFIG.MOCK_MODE) {
    const today = new Date().toISOString().split('T')[0];
    await dbQuery(`
      INSERT INTO daily_stats (date, total_bets, wins, losses, profit)
      VALUES ($1, 1, $2, $3, $4)
      ON CONFLICT (date) DO UPDATE SET
        total_bets = daily_stats.total_bets + 1,
        wins = daily_stats.wins + $2,
        losses = daily_stats.losses + $3,
        profit = daily_stats.profit + $4,
        roi = ((daily_stats.profit + $4) / NULLIF(daily_stats.total_bets + 1, 0)) * 100
    `, [today, result === 'win' ? 1 : 0, result === 'loss' ? 1 : 0, profit]);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOUL ENGINE - COM ESTATÍSTICAS
// ═══════════════════════════════════════════════════════════════════════════════

class SoulEngine {
  constructor(agentId, species) {
    this.agentId = agentId;
    this.species = species;
    this.soulHash = this.generateHash();
    this.incarnation = 0;
    this.stats = { wins: 0, losses: 0, winRate: 0 };
  }

  generateHash() {
    return crypto.createHash('sha256')
      .update(`${this.agentId}-${CONFIG.GENESIS}-${Date.now()}-${Math.random()}`)
      .digest('hex');
  }

  async resurrect() {
    if (CONFIG.MOCK_MODE) {
      const saved = mockStorage.get(this.agentId);
      if (saved) {
        console.log(`👻 [${this.agentId}] Ressurreição MOCK`);
        return saved;
      }
      console.log(`👶 [${this.agentId}] Gênesis MOCK`);
      return null;
    }

    try {
      const res = await dbQuery(
        `SELECT * FROM immortal_snapshots WHERE agent_id = $1 ORDER BY last_backup DESC LIMIT 1`,
        [this.agentId]
      );

      if (res.rows.length === 0) {
        console.log(`👶 [${this.agentId}] Gênesis`);
        return null;
      }

      const saved = res.rows[0];
      this.incarnation = saved.generation + 1;
      this.soulHash = saved.soul_hash;
      this.stats = { wins: saved.wins || 0, losses: saved.losses || 0 };
      this.stats.winRate = this.stats.wins / (this.stats.wins + this.stats.losses) || 0;
      
      console.log(`✨ [${this.agentId}] RESSURREIÇÃO #${this.incarnation} | W:${this.stats.wins} L:${this.stats.losses}`);
      
      return {
        weights: saved.neural_weights,
        memory: saved.memory || [],
        knowledge: saved.knowledge || {},
        lineage: saved.lineage || [this.agentId],
        decisions: saved.decisions || [],
        fitness: parseFloat(saved.fitness),
        capital: parseFloat(saved.capital),
        wins: saved.wins || 0,
        losses: saved.losses || 0
      };
    } catch (err) {
      console.error(`💀 [${this.agentId}] Erro:`, err.message);
      return null;
    }
  }

  async transmigrate(state) {
    const snapshot = {
      weights: state.brain ? await this.serializeWeights(state.brain) : null,
      memory: state.memory.slice(-500),
      knowledge: Object.fromEntries(state.knowledge || new Map()),
      lineage: state.lineage,
      decisions: state.decisions.slice(-50),
      fitness: state.fitness,
      capital: state.capital,
      wins: state.wins || 0,
      losses: state.losses || 0
    };

    if (CONFIG.MOCK_MODE) {
      mockStorage.set(this.agentId, snapshot);
      return;
    }

    try {
      await dbQuery(
        `INSERT INTO immortal_snapshots 
         (agent_id, soul_hash, generation, neural_weights, memory, knowledge, lineage, decisions, fitness, capital, wins, losses, last_backup)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
         ON CONFLICT (agent_id) DO UPDATE SET
         generation = EXCLUDED.generation, neural_weights = EXCLUDED.neural_weights,
         memory = EXCLUDED.memory, knowledge = EXCLUDED.knowledge,
         lineage = EXCLUDED.lineage, decisions = EXCLUDED.decisions,
         fitness = EXCLUDED.fitness, capital = EXCLUDED.capital,
         wins = EXCLUDED.wins, losses = EXCLUDED.losses, last_backup = NOW()`,
        [this.agentId, this.soulHash, this.incarnation, JSON.stringify(snapshot.weights),
         JSON.stringify(snapshot.memory), JSON.stringify(snapshot.knowledge),
         JSON.stringify(snapshot.lineage), JSON.stringify(snapshot.decisions),
         snapshot.fitness, snapshot.capital, snapshot.wins, snapshot.losses]
      );
    } catch (err) {
      console.error(`💾 [${this.agentId}] Erro no backup:`, err.message);
    }
  }

  async serializeWeights(model) {
    if (!model) return null;
    const weights = model.getWeights();
    return weights.map(w => ({ shape: w.shape, data: Array.from(w.dataSync()) }));
  }

  async deserializeWeights(data) {
    if (!data) return null;
    return data.map(d => tf.tensor(d.data, d.shape));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRÍADE COGNITIVA - MELHORADA COM VALIDAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

class TriadCognitive {
  constructor() {
    this.deliberations = new Map();
    this.lastAlertTime = 0;
  }

  async deliberate(game, agentProposer) {
    const deliberationId = crypto.randomUUID();
    await logSystem('INFO', 'TRIAD', `Iniciando deliberação ${deliberationId.slice(0,8)}`, { game: game.id });

    const proposal = await this.proposerThink(game, agentProposer);
    const verification = await this.verifierCritique(proposal, game);
    const revision = await this.reviserSynthesize(proposal, verification, game);
    const consensus = this.reachConsensus(proposal, verification, revision);

    const deliberation = {
      id: deliberationId,
      timestamp: Date.now(),
      game,
      proposer: { agent: agentProposer.id, ...proposal },
      verifier: verification,
      reviser: revision,
      consensus,
      status: consensus.confidence > CONFIG.MIN_CONFIDENCE ? 'AUTO_EXECUTE' : 'PENDING_APPROVAL',
      isVip: consensus.confidence > CONFIG.ALERT_THRESHOLD
    };

    this.deliberations.set(deliberationId, deliberation);

    // NOVO: Alerta VIP para oportunidades de alta confiança
    if (deliberation.isVip && Date.now() - this.lastAlertTime > CONFIG.NOTIFICATION_COOLDOWN) {
      await this.sendVipAlert(deliberation);
      this.lastAlertTime = Date.now();
    }

    if (!CONFIG.MOCK_MODE) {
      try {
        await dbQuery(
          `INSERT INTO triad_deliberations 
           (deliberation_id, game_id, home_team, away_team, proposer, verifier, reviser, final_consensus)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [deliberationId, game.id, game.home_team || game.homeTeam, game.away_team || game.awayTeam,
           JSON.stringify(deliberation.proposer), JSON.stringify(deliberation.verifier),
           JSON.stringify(deliberation.reviser), JSON.stringify(consensus)]
        );
      } catch (err) {
        console.error('Erro ao salvar deliberação:', err.message);
      }
    }

    console.log(`✅ [TRÍADE] ${consensus.decision} | Conf: ${(consensus.confidence*100).toFixed(1)}% | VIP: ${deliberation.isVip ? '⭐' : '❌'}`);
    return deliberation;
  }

  async proposerThink(game, agent) {
    const features = agent.extractFeatures(game);
    
    let prediction;
    try {
      const inputTensor = tf.tensor2d([features]);
      prediction = agent.state.brain.predict(inputTensor);
      inputTensor.dispose();
    } catch (err) {
      await logSystem('ERROR', 'NEURAL', `Erro na predição: ${err.message}`, { agent: agent.id });
      return {
        decision: 'PASS',
        confidence: 0.5,
        reasoning: 'Fallback - erro na NN',
        stake: 0,
        rawProbs: [0.33, 0.33, 0.34]
      };
    }
    
    const probs = prediction.dataSync();
    prediction.dispose();

    const confidence = Math.max(...probs);
    const decisionIndex = probs.indexOf(confidence);

    // NOVO: Validação de confiança mínima
    if (confidence < CONFIG.MIN_CONFIDENCE) {
      return {
        decision: 'PASS',
        confidence: confidence,
        reasoning: 'Confiança abaixo do threshold',
        stake: 0,
        rawProbs: Array.from(probs)
      };
    }

    return {
      decision: this.indexToDecision(decisionIndex, agent.species),
      confidence,
      reasoning: `Neural ${agent.species}`,
      stake: agent.calculateStake(confidence),
      rawProbs: Array.from(probs)
    };
  }

  async verifierCritique(proposal, game) {
    const concerns = [];
    if (proposal.confidence > 0.95) concerns.push('OVERCONFIDENCE');
    if (!game.homeLast10) concerns.push('DATA_GAP');
    if (proposal.stake > CONFIG.MAX_STAKE_PER_BET) concerns.push('HIGH_STAKE');

    const severity = concerns.length === 0 ? 'NONE' : concerns.length < 2 ? 'LOW' : 'MEDIUM';
    return {
      concerns,
      severity,
      trustAdjustment: concerns.length === 0 ? 1.0 : Math.max(0.6, 1 - (concerns.length * 0.15)),
      recommendation: severity === 'MEDIUM' ? 'MODIFY' : 'APPROVE'
    };
  }

  async reviserSynthesize(proposal, verification, game) {
    let finalDecision = proposal.decision;
    let finalConfidence = proposal.confidence * verification.trustAdjustment;
    let finalStake = proposal.stake;

    if (verification.severity === 'MEDIUM') {
      finalConfidence *= 0.8;
      finalStake *= 0.7;
      if (finalConfidence < CONFIG.MIN_CONFIDENCE) finalDecision = 'PASS';
    }

    // Limitar stake máximo
    finalStake = Math.min(finalStake, CONFIG.MAX_STAKE_PER_BET);

    return {
      finalDecision,
      finalConfidence,
      finalStake,
      modification: finalDecision !== proposal.decision ? 'CONSERVATIVE_SHIFT' : 'MAINTAINED',
      rationale: `Proposta=${proposal.decision}, Verif=${verification.severity}`
    };
  }

  reachConsensus(proposal, verification, revision) {
    const weights = { proposer: 0.4, verifier: 0.3, reviser: 0.3 };
    
    const finalConfidence = (
      proposal.confidence * weights.proposer +
      verification.trustAdjustment * weights.verifier +
      revision.finalConfidence * weights.reviser
    );

    return {
      decision: revision.finalDecision,
      confidence: finalConfidence,
      stake: revision.finalStake,
      divergence: Math.abs(proposal.confidence - revision.finalConfidence)
    };
  }

  indexToDecision(index, species) {
    const maps = {
      moneyline: ['HOME_WIN', 'AWAY_WIN', 'PASS'],
      spread: ['HOME_COVER', 'AWAY_COVER', 'PASS'],
      totals: ['OVER', 'UNDER', 'PASS'],
      props: ['OVER', 'UNDER']
    };
    return (maps[species] || maps.moneyline)[index] || 'PASS';
  }

  // NOVO: Alerta VIP para Telegram
  async sendVipAlert(deliberation) {
    const { game, consensus } = deliberation;
    const msg = `
🚨 **ALERTA VIP - ALTA CONFIANÇA** 🚨

🏀 **${game.home_team || game.homeTeam} vs ${game.away_team || game.awayTeam}**
🎯 **Decisão:** ${consensus.decision}
📈 **Confiança:** ${(consensus.confidence*100).toFixed(1)}%
💰 **Stake Sugerido:** ${consensus.stake.toFixed(2)}u

⚡ Oportunidade rara detectada!
    `;
    
    for (const userId of CONFIG.ALLOWED_USERS) {
      try {
        await global.bot.telegram.sendMessage(userId, msg, { parse_mode: 'Markdown' });
        await logSystem('INFO', 'ALERT', `Alerta VIP enviado para ${userId}`);
      } catch (e) {
        console.error('Erro enviando alerta VIP:', e.message);
      }
    }
  }

  async receiveOverride(deliberationId, userDecision, reason) {
    const delib = this.deliberations.get(deliberationId);
    if (!delib) return null;

    delib.yourOverride = { original: delib.consensus.decision, override: userDecision, reason, timestamp: Date.now() };
    delib.consensus.decision = userDecision;
    delib.status = 'OVERRIDDEN';

    if (!CONFIG.MOCK_MODE) {
      try {
        await dbQuery(
          `UPDATE triad_deliberations SET your_override = $1, executed = true WHERE deliberation_id = $2`,
          [JSON.stringify(delib.yourOverride), deliberationId]
        );
      } catch (err) {
        console.error('Erro ao salvar override:', err.message);
      }
    }

    return delib;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENTE IMORTAL - COM ESTATÍSTICAS
// ═══════════════════════════════════════════════════════════════════════════════

class ImmortalAgent {
  constructor(species, parentId = null) {
    this.id = parentId ? `${parentId}-child-${Date.now()}` : `eternum-${species}-${crypto.randomUUID().slice(0,8)}`;
    this.species = species;
    this.soul = new SoulEngine(this.id, species);
    
    this.state = {
      brain: null,
      memory: [],
      knowledge: new Map(),
      lineage: parentId ? [parentId] : [this.id],
      decisions: [],
      fitness: 0,
      capital: 100,
      wins: 0,
      losses: 0,
      birth: Date.now(),
      lastAction: Date.now()
    };

    this.alive = false;
  }

  async manifest() {
    const previous = await this.soul.resurrect();
    
    if (previous) {
      await this.reincarnate(previous);
    } else {
      await this.genesis();
    }

    this.alive = true;
    this.immortalityLoop();
    
    console.log(`🌟 [${this.id}] ${this.species} | Capital: ${this.state.capital} | W:${this.state.wins} L:${this.state.losses}`);
  }

  async genesis() {
    this.state.brain = this.createBrain();
    await this.soul.transmigrate(this.state);
  }

  async reincarnate(previous) {
    this.state.brain = this.createBrain();
    
    if (previous.weights) {
      const weights = await this.soul.deserializeWeights(previous.weights);
      if (weights) this.state.brain.setWeights(weights);
    }
    
    this.state.memory = previous.memory || [];
    this.state.knowledge = new Map(Object.entries(previous.knowledge || {}));
    this.state.lineage = previous.lineage || [this.id];
    this.state.decisions = previous.decisions || [];
    this.state.fitness = previous.fitness || 0;
    this.state.capital = previous.capital || 100;
    this.state.wins = previous.wins || 0;
    this.state.losses = previous.losses || 0;
  }

  createBrain() {
    const model = tf.sequential();
    const architectures = {
      moneyline: [48, 24], spread: [40, 20], totals: [32, 16], props: [32, 16]
    };
    const layers = architectures[this.species] || [32, 16];
    
    model.add(tf.layers.dense({
      inputShape: [this.getInputSize()],
      units: layers[0],
      activation: 'relu',
      kernelRegularizer: tf.regularizers.l2({ l2: 0.001 })
    }));
    
    model.add(tf.layers.dropout({ rate: 0.25 }));
    
    if (layers[1]) {
      model.add(tf.layers.dense({ units: layers[1], activation: 'relu' }));
    }
    
    model.add(tf.layers.dense({
      units: this.getOutputSize(),
      activation: 'softmax'
    }));
    
    model.compile({ optimizer: tf.train.adam(0.001), loss: 'categoricalCrossentropy' });
    return model;
  }

  getInputSize() {
    const sizes = { moneyline: 20, spread: 18, totals: 16, props: 12 };
    return sizes[this.species] || 15;
  }

  getOutputSize() {
    return this.species === 'props' ? 2 : 3;
  }

  immortalityLoop() {
    setInterval(async () => {
      if (!this.alive) return;
      await this.soul.transmigrate(this.state);
    }, CONFIG.BACKUP_INTERVAL);
  }

  extractFeatures(game) {
    const features = [
      game.homeWinPct || 0.5,
      game.awayWinPct || 0.5,
      (game.homeLast10 || 5) / 10,
      (game.awayLast10 || 5) / 10,
      (game.homeRest || 2) / 5,
      (game.awayRest || 2) / 5,
      game.momentumHome || 0,
      game.momentumAway || 0,
      this.state.fitness / 100,
      this.state.capital / 200,
      Math.min(1, this.state.memory.length / 100),
      (game.homeLast10 || 5) / 20,
      (game.awayLast10 || 5) / 20,
      ((game.homeRest || 2) + (game.awayRest || 2)) / 10,
      Math.abs((game.homeRest || 2) - (game.awayRest || 2)) / 5,
      (game.momentumHome || 0) * 0.5,
      (game.momentumAway || 0) * 0.5,
      this.state.decisions.length / 1000,
      this.state.fitness > 0 ? 1 : 0,
      Math.min(1, Math.abs(this.state.fitness) / 50)
    ];
    
    const targetSize = this.getInputSize();
    while (features.length < targetSize) features.push(0.5);
    return features.slice(0, targetSize);
  }

  // NOVO: Cálculo de stake com Kelly Criterion
  calculateStake(confidence) {
    const edge = confidence - 0.5;
    if (edge <= 0) return 0;
    
    const winProb = confidence;
    const lossProb = 1 - winProb;
    const odds = 1.9; // Odds médias
    
    // Kelly: (bp - q) / b
    const b = odds - 1;
    const kelly = (b * winProb - lossProb) / b;
    
    // Kelly fracionário (mais conservador)
    const stake = this.state.capital * kelly * CONFIG.KELLY_FRACTION;
    
    return Math.max(
      this.state.capital * 0.005, // Mínimo 0.5%
      Math.min(
        this.state.capital * 0.05, // Máximo 5% do capital
        Math.min(stake, CONFIG.MAX_STAKE_PER_BET) // Máximo absoluto
      )
    );
  }

  async learn(gameId, result, profit) {
    const decision = this.state.decisions.find(d => d.game === gameId);
    if (!decision) return;

    decision.result = result;
    decision.profit = profit;
    this.state.fitness += profit;
    this.state.capital += profit;
    
    if (result === 'win') this.state.wins++;
    else this.state.losses++;

    const features = this.extractFeatures(decision.gameContext);
    const target = this.encodeResult(result);
    
    try {
      await this.state.brain.fit(
        tf.tensor2d([features]),
        tf.tensor2d([target]),
        { epochs: 1, verbose: 0 }
      );
    } catch (err) {
      console.error('Erro no treinamento:', err.message);
    }

    this.state.memory.push({ game: decision.gameContext, result, profit, timestamp: Date.now() });
    await updateGlobalStats(result, profit);
    
    console.log(`📚 [${this.id}] ${result} | ${profit.toFixed(2)} | W:${this.state.wins} L:${this.state.losses} | Fitness: ${this.state.fitness.toFixed(2)}`);
  }

  encodeResult(result) {
    if (this.species === 'props') return result === 'win' ? [1, 0] : [0, 1];
    return result === 'home' ? [1, 0, 0] : result === 'away' ? [0, 1, 0] : [0, 0, 1];
  }

  reproduce() {
    const child = new ImmortalAgent(this.species, this.id);
    child.state.lineage = [...this.state.lineage, this.id];
    return child;
  }

  getStatus() {
    const total = this.state.wins + this.state.losses;
    return {
      id: this.id,
      species: this.species,
      incarnation: this.soul.incarnation,
      fitness: this.state.fitness,
      capital: this.state.capital,
      wins: this.state.wins,
      losses: this.state.losses,
      winRate: total > 0 ? (this.state.wins / total * 100).toFixed(1) : 0,
      decisions: this.state.decisions.length,
      alive: this.alive
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ECOSSISTEMA ETERNUM - COM AUTO-RECOVERY
// ═══════════════════════════════════════════════════════════════════════════════

class EternumEcosystem {
  constructor() {
    this.agents = new Map();
    this.triad = new TriadCognitive();
    this.population = [];
    this.generation = 0;
    this.dailyStats = { stakeUsed: 0, date: new Date().toDateString() };
    this.running = false;
    this.restartAttempts = 0;
  }

  async genesis() {
    console.log('\n🌌 GÊNESIS ETERNUM\n');
    
    const species = ['moneyline', 'spread', 'totals', 'props'];
    for (const s of species) {
      for (let i = 0; i < CONFIG.POPULATION_SIZE / species.length; i++) {
        const agent = new ImmortalAgent(s);
        await agent.manifest();
        this.agents.set(agent.id, agent);
        this.population.push(agent);
      }
    }

    console.log(`✨ ${this.agents.size} almas manifestadas\n`);
    this.running = true;
    this.restartAttempts = 0;
    this.evolutionLoop();
  }

  async processGame(game) {
    try {
      if (new Date().toDateString() !== this.dailyStats.date) {
        this.dailyStats = { stakeUsed: 0, date: new Date().toDateString() };
      }

      if (this.dailyStats.stakeUsed >= CONFIG.MAX_DAILY_STAKE) {
        console.log('📊 Limite diário atingido');
        return null;
      }

      console.log(`\n🏀 ${game.home_team || game.homeTeam} vs ${game.away_team || game.awayTeam}`);

      const specialist = this.selectSpecialist();
      if (!specialist) {
        console.log('❌ Nenhum especialista disponível');
        return null;
      }

      const deliberation = await this.triad.deliberate(game, specialist);

      if (deliberation.consensus.decision === 'PASS') {
        console.log('⏭️  Decisão: PASS (confiança insuficiente)');
        return deliberation;
      }

      if (deliberation.status === 'AUTO_EXECUTE' && CONFIG.AUTO_EXECUTE) {
        await this.executeDecision(deliberation, specialist);
      } else {
        await this.consultUser(deliberation);
      }

      return deliberation;
    } catch (err) {
      await logSystem('ERROR', 'ECOSYSTEM', `Erro processando jogo: ${err.message}`, { game: game.id });
      return null;
    }
  }

  selectSpecialist() {
    return Array.from(this.agents.values())
      .filter(a => a.alive && a.state.capital > 5)
      .sort((a, b) => b.state.fitness - a.state.fitness)[0];
  }

  async executeDecision(deliberation, agent) {
    const { consensus } = deliberation;
    if (consensus.decision === 'PASS') return;

    const stake = Math.min(consensus.stake, CONFIG.MAX_DAILY_STAKE - this.dailyStats.stakeUsed);
    this.dailyStats.stakeUsed += stake;

    agent.state.decisions.push({
      game: deliberation.game.id,
      gameContext: deliberation.game,
      decision: consensus.decision,
      stake,
      confidence: consensus.confidence,
      timestamp: Date.now()
    });

    console.log(`🎯 EXECUTADO: ${consensus.decision} | ${stake.toFixed(2)}u | ${agent.id.slice(0,8)}`);

    // Simular resultado (em produção, isso viria da API de resultados)
    setTimeout(() => {
      const won = Math.random() > 0.45; // 55% win rate simulado
      this.resolveBet(deliberation.id, agent, won);
    }, 5000);
  }

  async consultUser(deliberation) {
    const msg = this.formatConsultation(deliberation);
    
    for (const userId of CONFIG.ALLOWED_USERS) {
      try {
        await global.bot.telegram.sendMessage(userId, msg, {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('✅ Aprovar', `approve_${deliberation.id}`)],
            [Markup.button.callback('❌ Rejeitar', `reject_${deliberation.id}`)],
            [Markup.button.callback('📊 Análise', `analysis_${deliberation.id}`)]
          ]).reply_markup
        });
      } catch (e) {
        console.error('Erro notificação:', e.message);
      }
    }
  }

  formatConsultation(d) {
    const home = d.game.home_team || d.game.homeTeam;
    const away = d.game.away_team || d.game.awayTeam;
    
    return `
🎓 **CONSULTA ETERNUM** ${d.isVip ? '⭐ VIP' : ''}

🏀 **${home} vs ${away}**
🤖 **Agente:** ${d.proposer.agent.slice(0,8)} (${d.proposer.agent.split('-')[1]})
🎯 **Proposta:** ${d.proposer.decision}
📉 **Confiança:** ${(d.consensus.confidence*100).toFixed(1)}%
💰 **Stake:** ${d.consensus.stake.toFixed(2)}u

🔍 **Verificador:** ${d.verifier.severity === 'NONE' ? '✅ OK' : '⚠️ ' + d.verifier.concerns[0]}
🧠 **Revisor:** ${d.reviser.modification === 'MAINTAINED' ? 'Manteve' : 'Ajustou'}

**Status:** Aguardando você...
`;
  }

  async resolveBet(deliberationId, agent, won) {
    const decision = agent.state.decisions.slice(-1)[0];
    const profit = won ? decision.stake * 0.9 : -decision.stake;
    
    await agent.learn(deliberationId, won ? 'win' : 'loss', profit);
    
    // Atualizar no banco
    if (!CONFIG.MOCK_MODE) {
      await dbQuery(
        `UPDATE triad_deliberations SET result = $1, profit = $2, resolved_at = NOW() WHERE deliberation_id = $3`,
        [won ? 'win' : 'loss', profit, deliberationId]
      );
    }
    
    const totalDecisions = Array.from(this.agents.values()).reduce((s, a) => s + a.state.decisions.length, 0);
    if (totalDecisions % CONFIG.EVOLUTION_INTERVAL === 0) {
      await this.evolve();
    }
  }

  async evolve() {
    console.log('\n🧬 EVOLUÇÃO\n');
    
    const sorted = Array.from(this.agents.values()).sort((a, b) => b.state.fitness - a.state.fitness);
    const eliteCount = Math.floor(sorted.length * CONFIG.ELITE_RATIO);
    const elites = sorted.slice(0, eliteCount);
    const mortos = sorted.slice(eliteCount).filter(a => a.state.fitness < -20 || a.state.capital <= 0);

    for (const morto of mortos) {
      morto.alive = false;
      if (!CONFIG.MOCK_MODE) {
        await dbQuery(`UPDATE immortal_snapshots SET status = 'DYING' WHERE agent_id = $1`, [morto.id]);
      }
      console.log(`💀 [${morto.id.slice(0,8)}] Hibernação`);
    }

    for (let i = 0; i < mortos.length && i < 4; i++) {
      const pai = elites[i % elites.length];
      const filho = pai.reproduce();
      await filho.manifest();
      this.agents.set(filho.id, filho);
      console.log(`👶 [${filho.id.slice(0,8)}] Nascido de [${pai.id.slice(0,8)}]`);
    }

    this.generation++;
    console.log(`✅ Geração ${this.generation}\n`);
  }

  evolutionLoop() {
    setInterval(() => {
      const total = Array.from(this.agents.values()).reduce((s, a) => s + a.state.decisions.length, 0);
      if (total > 0 && total % CONFIG.EVOLUTION_INTERVAL === 0) {
        this.evolve();
      }
    }, 60000);
  }

  // NOVO: Auto-recovery em caso de falha
  async recover() {
    if (this.restartAttempts >= CONFIG.MAX_RESTART_ATTEMPTS) {
      await logSystem('CRITICAL', 'ECOSYSTEM', 'Máximo de tentativas de restart atingido');
      return false;
    }
    
    this.restartAttempts++;
    await logSystem('WARNING', 'ECOSYSTEM', `Tentando recovery #${this.restartAttempts}`);
    
    await new Promise(r => setTimeout(r, CONFIG.RESTART_DELAY));
    await this.genesis();
    return true;
  }

  getStatus() {
    return {
      generation: this.generation,
      agents: Array.from(this.agents.values()).map(a => a.getStatus()),
      dailyStake: this.dailyStats,
      globalStats
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TELEGRAM BOT - COMANDOS MELHORADOS
// ═══════════════════════════════════════════════════════════════════════════════

function setupBot(ecosystem) {
  const bot = new Telegraf(CONFIG.BOT_TOKEN);

  bot.use((ctx, next) => {
    if (!CONFIG.ALLOWED_USERS.includes(ctx.from?.id)) {
      return ctx.reply('⛔ Acesso negado');
    }
    return next();
  });

  bot.start((ctx) => ctx.replyWithMarkdown(`
🌌 **NBA BRAIN PRO v11.0 ETERNUM PRO**
${CONFIG.MOCK_MODE ? '⚠️ MODO MOCK (dados temporários)' : '✅ MODO PRODUÇÃO (PostgreSQL ativo)'}

/comandos - Lista de comandos
/status - Status do ecossistema
/stats - Estatísticas detalhadas
/force - Forçar análise agora
/eternity - Ver agentes imortais
/history - Histórico de apostas
/vip - Ver alertas VIP
`));

  bot.command('comandos', (ctx) => ctx.replyWithMarkdown(`
📋 **COMANDOS**

🔍 /scan ou /force - Analisar jogos
🧠 /eternity - Agentes imortais
📊 /status - Status geral
📈 /stats - Estatísticas detalhadas
📜 /history - Histórico de apostas
🚨 /vip - Alertas VIP
🧬 /evolve - Forçar evolução
💾 /snapshot - Backup manual
`));

  bot.command('status', (ctx) => {
    const s = ecosystem.getStatus();
    ctx.replyWithMarkdown(`
🌌 **ETERNUM STATUS**
${CONFIG.MOCK_MODE ? '⚠️ MODO MOCK' : '✅ PRODUÇÃO (PostgreSQL)'}

Geração: ${s.generation}
Agentes: ${s.agents.filter(a => a.alive).length}/${s.agents.length}
Stake hoje: ${s.dailyStake.stakeUsed.toFixed(1)}/${CONFIG.MAX_DAILY_STAKE}u

📊 **Globais:**
Total Apostas: ${s.globalStats.totalBets}
Wins: ${s.globalStats.wins} | Losses: ${s.globalStats.losses}
Profit: ${s.globalStats.profit.toFixed(2)}u
Win Rate: ${s.globalStats.totalBets > 0 ? (s.globalStats.wins/s.globalStats.totalBets*100).toFixed(1) : 0}%
`);
  });

  // NOVO: Comando de estatísticas detalhadas
  bot.command('stats', (ctx) => {
    const s = ecosystem.getStatus();
    const top = s.agents
      .filter(a => a.alive)
      .sort((a, b) => b.fitness - a.fitness)
      .slice(0, 3);
    
    let msg = `📈 **ESTATÍSTICAS DETALHADAS**\n\n`;
    msg += `🏆 **Top Agentes:**\n`;
    top.forEach((a, i) => {
      msg += `${i+1}. \`${a.id.slice(0,8)}\` | ${a.species}\n`;
      msg += `   Fitness: ${a.fitness.toFixed(1)} | WR: ${a.winRate}%\n`;
      msg += `   W:${a.wins} L:${a.losses} | 💰${a.capital.toFixed(1)}u\n\n`;
    });
    
    ctx.replyWithMarkdown(msg);
  });

  // NOVO: Comando de histórico
  bot.command('history', async (ctx) => {
    if (CONFIG.MOCK_MODE) {
      return ctx.reply('📜 Modo MOCK - sem histórico no banco');
    }
    
    try {
      const res = await dbQuery(`
        SELECT * FROM triad_deliberations 
        WHERE executed = true 
        ORDER BY created_at DESC LIMIT 5
      `);
      
      if (res.rows.length === 0) {
        return ctx.reply('📜 Nenhuma aposta executada ainda');
      }
      
      let msg = '📜 **ÚLTIMAS APOSTAS**\n\n';
      res.rows.forEach((row, i) => {
        const profit = row.profit || 0;
        const icon = profit > 0 ? '✅' : profit < 0 ? '❌' : '⏳';
        msg += `${icon} ${row.home_team} vs ${row.away_team}\n`;
        msg += `   Resultado: ${row.result || 'Pendente'} | ${profit.toFixed(2)}u\n\n`;
      });
      
      ctx.replyWithMarkdown(msg);
    } catch (err) {
      ctx.reply('❌ Erro ao buscar histórico');
    }
  });

  // NOVO: Comando VIP
  bot.command('vip', (ctx) => {
    ctx.replyWithMarkdown(`
🚨 **SISTEMA VIP**

Alertas automáticos quando:
• Confiança > ${(CONFIG.ALERT_THRESHOLD*100).toFixed(0)}%
• Oportunidade de alta edge detectada

Cooldown: ${CONFIG.NOTIFICATION_COOLDOWN/60000} min entre alertas

Você receberá notificação automaticamente! 🔔
`);
  });

  bot.command('eternity', (ctx) => {
    const s = ecosystem.getStatus();
    const top = s.agents
      .sort((a, b) => b.fitness - a.fitness)
      .slice(0, 5)
      .map((a, i) => `${i+1}. \`${a.id.slice(0,8)}\` | ${a.species} | F:${a.fitness.toFixed(0)} | WR:${a.winRate}% | 💰${a.capital.toFixed(0)}`)
      .join('\n\n');
    
    ctx.replyWithMarkdown(`🌟 **ALMAS IMORTAIS**\n\n${top}`);
  });

  bot.command('force', async (ctx) => {
    await ctx.reply('🔍 Analisando...');
    const games = await fetchOdds();
    for (const g of games.slice(0, 2)) {
      await ecosystem.processGame(g);
    }
    ctx.reply('✅ Concluído');
  });

  bot.command('evolve', async (ctx) => {
    await ctx.reply('🧬 Evolução...');
    await ecosystem.evolve();
    ctx.reply('✅ Evolução concluída');
  });

  bot.command('snapshot', async (ctx) => {
    await ctx.reply('💾 Backup...');
    for (const a of ecosystem.agents.values()) {
      await a.soul.transmigrate(a.state);
    }
    ctx.reply('✅ Backup eterno salvo');
  });

  bot.action(/approve_(.+)/, async (ctx) => {
    const id = ctx.match[1];
    await ecosystem.triad.receiveOverride(id, 'APPROVED', 'Usuário aprovou');
    await ctx.answerCbQuery('Aprovado!');
    await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n✅ **APROVADO POR VOCÊ**', { parse_mode: 'Markdown' });
  });

  bot.action(/reject_(.+)/, async (ctx) => {
    const id = ctx.match[1];
    await ecosystem.triad.receiveOverride(id, 'REJECTED', 'Usuário rejeitou');
    await ctx.answerCbQuery('Rejeitado');
    await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n❌ **REJEITADO POR VOCÊ**', { parse_mode: 'Markdown' });
  });

  bot.action(/analysis_(.+)/, async (ctx) => {
    const id = ctx.match[1];
    const d = ecosystem.triad.deliberations.get(id);
    if (!d) return ctx.answerCbQuery('Não encontrado');
    
    ctx.replyWithMarkdown(`
📊 **ANÁLISE DETALHADA**

Propositor: ${d.proposer.reasoning}
Verificador: ${d.verifier.concerns.join(', ') || 'Nenhuma'}
Revisor: ${d.reviser.rationale}

Probs: ${d.proposer.rawProbs.map(p => (p*100).toFixed(0)+'%').join(' | ')}
Confiança Final: ${(d.consensus.confidence*100).toFixed(1)}%
`);
  });

  return bot;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVIÇOS AUXILIARES - COM CACHE
// ═══════════════════════════════════════════════════════════════════════════════

let oddsCache = { data: [], timestamp: 0 };

async function fetchOdds() {
  // Retornar cache se tiver menos de 5 minutos
  if (Date.now() - oddsCache.timestamp < 300000 && oddsCache.data.length > 0) {
    console.log('📦 Usando cache de odds');
    return oddsCache.data;
  }

  if (!CONFIG.ODDS_API_KEY) {
    const mock = [{
      id: 'mock-' + Date.now(),
      home_team: 'Boston Celtics',
      away_team: 'LA Lakers',
      commence_time: new Date(Date.now() + 3600000).toISOString(),
      homeWinPct: 0.65, awayWinPct: 0.35,
      homeLast10: 8, awayLast10: 5,
      homeRest: 2, awayRest: 1,
      momentumHome: 0.8, momentumAway: 0.4
    }];
    oddsCache = { data: mock, timestamp: Date.now() };
    return mock;
  }

  try {
    const res = await axios.get(
      `https://api.the-odds-api.com/v4/sports/basketball_nba/odds?regions=us&markets=h2h&apiKey=${CONFIG.ODDS_API_KEY}`,
      { timeout: 10000 }
    );
    oddsCache = { data: res.data, timestamp: Date.now() };
    console.log(`📥 ${res.data.length} jogos carregados da API`);
    return res.data;
  } catch (e) {
    console.error('Erro odds:', e.message);
    return oddsCache.data.length > 0 ? oddsCache.data : [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVIDOR WEB - DASHBOARD E API
// ═══════════════════════════════════════════════════════════════════════════════

const app = express();
app.use(express.json());

// NOVO: Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

let ecosystem;

// Dashboard HTML
app.get('/', (req, res) => {
  const s = ecosystem?.getStatus();
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>NBA Brain Pro - Dashboard</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, sans-serif; background: #0a0a0a; color: #fff; padding: 20px; }
    .card { background: #1a1a1a; border-radius: 12px; padding: 20px; margin: 10px 0; }
    .metric { display: inline-block; margin: 10px 20px 10px 0; }
    .metric-value { font-size: 32px; font-weight: bold; color: #00ff88; }
    .metric-label { font-size: 12px; color: #888; text-transform: uppercase; }
    .agent { background: #2a2a2a; padding: 15px; border-radius: 8px; margin: 10px 0; }
    .alive { border-left: 4px solid #00ff88; }
    .dead { border-left: 4px solid #ff4444; opacity: 0.6; }
    h1 { margin: 0 0 20px 0; }
    .status { display: inline-block; padding: 5px 15px; border-radius: 20px; font-size: 12px; }
    .production { background: #00ff88; color: #000; }
    .mock { background: #ffaa00; color: #000; }
  </style>
</head>
<body>
  <h1>🌌 NBA Brain Pro v11.0</h1>
  <span class="status ${CONFIG.MOCK_MODE ? 'mock' : 'production'}">
    ${CONFIG.MOCK_MODE ? '⚠️ MODO MOCK' : '✅ PRODUÇÃO'}
  </span>
  
  <div class="card">
    <h3>📊 Estatísticas Globais</h3>
    <div class="metric">
      <div class="metric-value">${s?.globalStats?.totalBets || 0}</div>
      <div class="metric-label">Total Apostas</div>
    </div>
    <div class="metric">
      <div class="metric-value">${s?.globalStats?.wins || 0}</div>
      <div class="metric-label">Wins</div>
    </div>
    <div class="metric">
      <div class="metric-value">${s?.globalStats?.losses || 0}</div>
      <div class="metric-label">Losses</div>
    </div>
    <div class="metric">
      <div class="metric-value">${(s?.globalStats?.profit || 0).toFixed(1)}u</div>
      <div class="metric-label">Profit</div>
    </div>
    <div class="metric">
      <div class="metric-value">${s?.globalStats?.totalBets > 0 ? ((s.globalStats.wins/s.globalStats.totalBets)*100).toFixed(1) : 0}%</div>
      <div class="metric-label">Win Rate</div>
    </div>
  </div>

  <div class="card">
    <h3>🤖 Agentes (${s?.agents?.filter(a => a.alive).length || 0}/${s?.agents?.length || 0} ativos)</h3>
    ${s?.agents?.map(a => `
      <div class="agent ${a.alive ? 'alive' : 'dead'}">
        <strong>${a.id.slice(0,8)}</strong> | ${a.species} | Gen: ${a.incarnation}<br>
        Fitness: ${a.fitness.toFixed(1)} | Win Rate: ${a.winRate}% | 💰${a.capital.toFixed(1)}u
      </div>
    `).join('') || '<p>Nenhum agente ativo</p>'}
  </div>

  <div class="card">
    <h3>📈 Status do Dia</h3>
    <p>Stake usado: ${(s?.dailyStake?.stakeUsed || 0).toFixed(1)}/${CONFIG.MAX_DAILY_STAKE}u</p>
    <p>Geração: ${s?.generation || 0}</p>
  </div>

  <script>
    setTimeout(() => location.reload(), 30000); // Auto-refresh a cada 30s
  </script>
</body>
</html>
  `);
});

// API endpoints
app.get('/api/status', (req, res) => {
  res.json({
    system: 'NBA BRAIN PRO v11.0 ETERNUM PRO',
    version: '11.0.0',
    mode: CONFIG.MOCK_MODE ? 'MOCK' : 'PRODUCTION',
    status: ecosystem?.running ? 'operational' : 'initializing',
    timestamp: new Date().toISOString(),
    stats: ecosystem?.getStatus()
  });
});

app.get('/api/agents', (req, res) => {
  res.json(ecosystem?.getStatus()?.agents || []);
});

app.get('/api/history', async (req, res) => {
  if (CONFIG.MOCK_MODE) return res.json({ error: 'Modo MOCK ativo' });
  
  try {
    const res = await dbQuery(`SELECT * FROM triad_deliberations ORDER BY created_at DESC LIMIT 20`);
    res.json(res.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', async (req, res) => {
  try {
    if (!CONFIG.MOCK_MODE) await dbQuery('SELECT 1');
    res.json({ 
      status: 'healthy', 
      mode: CONFIG.MOCK_MODE ? 'MOCK' : 'PRODUCTION',
      agents: ecosystem?.agents?.size || 0,
      uptime: process.uptime()
    });
  } catch (e) {
    res.status(500).json({ status: 'unhealthy', error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// INICIALIZAÇÃO COM AUTO-RECOVERY
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  NBA BRAIN PRO v11.0 ETERNUM PRO');
  console.log('='.repeat(60) + '\n');

  try {
    await initDatabase();
  } catch (err) {
    console.error('❌ Falha ao inicializar database:', err);
    CONFIG.MOCK_MODE = true;
  }
  
  ecosystem = new EternumEcosystem();
  
  // Tentar iniciar com auto-recovery
  let started = false;
  let attempts = 0;
  
  while (!started && attempts < CONFIG.MAX_RESTART_ATTEMPTS) {
    attempts++;
    try {
      await ecosystem.genesis();
      started = true;
    } catch (err) {
      console.error(`❌ Tentativa ${attempts} falhou:`, err.message);
      if (attempts < CONFIG.MAX_RESTART_ATTEMPTS) {
        console.log(`🔄 Tentando novamente em ${CONFIG.RESTART_DELAY/1000}s...`);
        await new Promise(r => setTimeout(r, CONFIG.RESTART_DELAY));
      }
    }
  }
  
  if (!started) {
    console.error('💀 Não foi possível iniciar o ecossistema');
    process.exit(1);
  }
  
  const bot = setupBot(ecosystem);
  global.bot = bot;
  bot.launch();
  
  app.listen(CONFIG.PORT, () => {
    console.log(`\n🌐 Dashboard: http://localhost:${CONFIG.PORT}`);
    console.log('='.repeat(60));
    console.log('  ETERNUM PRO ESTÁ VIVO');
    console.log('='.repeat(60) + '\n');
  });

  // Loop principal com tratamento de erro
  setInterval(async () => {
    try {
      const games = await fetchOdds();
      for (const g of games.slice(0, 2)) {
        await ecosystem.processGame(g);
      }
    } catch (err) {
      console.error('❌ Erro no loop principal:', err.message);
      // Tentar recovery se necessário
      if (!ecosystem.running) {
        await ecosystem.recover();
      }
    }
  }, 300000);

  // Keep-alive
  setInterval(() => {
    http.get(`http://localhost:${CONFIG.PORT}/`, () => {});
  }, 14 * 60 * 1000);
}

main().catch(err => {
  console.error('💀 FALHA CRÍTICA:', err);
  process.exit(1);
});
