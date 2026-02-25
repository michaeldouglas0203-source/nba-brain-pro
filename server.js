// ═══════════════════════════════════════════════════════════════════════════════
// NBA BRAIN PRO v10.0 ETERNUM - RENDER OPTIMIZED
// "Agentes não morrem. Eles aprendem eternamente."
// ═══════════════════════════════════════════════════════════════════════════════

const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');
const { Pool } = require('pg');
const tf = require('@tensorflow/tfjs');
require('@tensorflow/tfjs-node');
const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO ETERNUM
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  ODDS_API_KEY: process.env.ODDS_API_KEY || '',
  DATABASE_URL: process.env.DATABASE_URL,
  PORT: process.env.PORT || 10000,
  ALLOWED_USERS: [7707876089],
  
  GENESIS: '2026-02-25T00:00:00Z',
  BACKUP_INTERVAL: 2 * 60 * 1000,
  POPULATION_SIZE: 8,
  ELITE_RATIO: 0.25,
  EVOLUTION_INTERVAL: 15,
  AUTO_EXECUTE: true,
  MAX_DAILY_STAKE: 50,
  TRIAD_THRESHOLD: 0.15
};

// Validação crítica
if (!CONFIG.BOT_TOKEN) throw new Error('BOT_TOKEN não configurado');
if (!CONFIG.DATABASE_URL) throw new Error('DATABASE_URL não configurado');

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE - IMORTALIDADE
// ═══════════════════════════════════════════════════════════════════════════════

const db = new Pool({
  connectionString: CONFIG.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

async function initDatabase() {
  const client = await db.connect();
  try {
    await client.query(`
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
        last_backup TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS triad_deliberations (
        id SERIAL PRIMARY KEY,
        deliberation_id VARCHAR(64) UNIQUE,
        game_id VARCHAR(100),
        proposer JSONB,
        verifier JSONB,
        reviser JSONB,
        final_consensus JSONB,
        your_override JSONB,
        executed BOOLEAN DEFAULT false,
        profit DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS eternity_log (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(50),
        agent_id VARCHAR(100),
        details JSONB,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_snapshots_agent ON immortal_snapshots(agent_id);
      CREATE INDEX IF NOT EXISTS idx_deliberations_game ON triad_deliberations(game_id);
    `);
    console.log('💾 Database Eternum inicializado');
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOUL ENGINE - IMORTALIDADE ABSOLUTA
// ═══════════════════════════════════════════════════════════════════════════════

class SoulEngine {
  constructor(agentId, species) {
    this.agentId = agentId;
    this.species = species;
    this.soulHash = this.generateHash();
    this.incarnation = 0;
  }

  generateHash() {
    return crypto.createHash('sha256')
      .update(`${this.agentId}-${CONFIG.GENESIS}-${Date.now()}-${Math.random()}`)
      .digest('hex');
  }

  async resurrect() {
    try {
      const res = await db.query(
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
      
      console.log(`✨ [${this.agentId}] RESSURREIÇÃO #${this.incarnation} | Fitness: ${saved.fitness} | Capital: ${saved.capital}`);
      
      return {
        weights: saved.neural_weights,
        memory: saved.memory || [],
        knowledge: saved.knowledge || {},
        lineage: saved.lineage || [this.agentId],
        decisions: saved.decisions || [],
        fitness: parseFloat(saved.fitness),
        capital: parseFloat(saved.capital)
      };
    } catch (err) {
      console.error(`💀 [${this.agentId}] Erro na ressurreição:`, err.message);
      return null;
    }
  }

  async transmigrate(state) {
    try {
      const snapshot = {
        weights: state.brain ? await this.serializeWeights(state.brain) : null,
        memory: state.memory.slice(-500),
        knowledge: Object.fromEntries(state.knowledge || new Map()),
        lineage: state.lineage,
        decisions: state.decisions.slice(-50),
        fitness: state.fitness,
        capital: state.capital
      };

      await db.query(
        `INSERT INTO immortal_snapshots 
         (agent_id, soul_hash, generation, neural_weights, memory, knowledge, lineage, decisions, fitness, capital, last_backup)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         ON CONFLICT (agent_id) DO UPDATE SET
         generation = EXCLUDED.generation,
         neural_weights = EXCLUDED.neural_weights,
         memory = EXCLUDED.memory,
         knowledge = EXCLUDED.knowledge,
         lineage = EXCLUDED.lineage,
         decisions = EXCLUDED.decisions,
         fitness = EXCLUDED.fitness,
         capital = EXCLUDED.capital,
         last_backup = NOW()`,
        [
          this.agentId, this.soulHash, this.incarnation,
          JSON.stringify(snapshot.weights),
          JSON.stringify(snapshot.memory),
          JSON.stringify(snapshot.knowledge),
          JSON.stringify(snapshot.lineage),
          JSON.stringify(snapshot.decisions),
          snapshot.fitness, snapshot.capital
        ]
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
// TRÍADE COGNITIVA
// ═══════════════════════════════════════════════════════════════════════════════

class TriadCognitive {
  constructor() {
    this.deliberations = new Map();
  }

  async deliberate(game, agentProposer) {
    const deliberationId = crypto.randomUUID();
    console.log(`\n🧠 [TRÍADE] #${deliberationId.slice(0,8)}`);

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
      status: consensus.confidence > 0.85 ? 'AUTO_EXECUTE' : 'PENDING_APPROVAL'
    };

    this.deliberations.set(deliberationId, deliberation);

    await db.query(
      `INSERT INTO triad_deliberations 
       (deliberation_id, game_id, proposer, verifier, reviser, final_consensus)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (deliberation_id) DO NOTHING`,
      [deliberationId, game.id, 
       JSON.stringify(deliberation.proposer),
       JSON.stringify(deliberation.verifier),
       JSON.stringify(deliberation.reviser),
       JSON.stringify(consensus)]
    );

    console.log(`✅ [TRÍADE] ${consensus.decision} | Conf: ${(consensus.confidence*100).toFixed(1)}% | ${deliberation.status}`);
    return deliberation;
  }

  async proposerThink(game, agent) {
    const features = agent.extractFeatures(game);
    const prediction = agent.state.brain.predict(tf.tensor2d([features]));
    const probs = prediction.dataSync();
    prediction.dispose();

    const confidence = Math.max(...probs);
    const decisionIndex = probs.indexOf(confidence);

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
    if (proposal.decision.includes('HOME') && (game.homeRest || 2) < (game.awayRest || 2)) {
      concerns.push('FATIGUE_RISK');
    }

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

    if (verification.severity === 'MEDIUM') {
      finalConfidence *= 0.8;
      if (finalConfidence < 0.7) finalDecision = 'PASS';
    }

    return {
      finalDecision,
      finalConfidence,
      modification: finalDecision !== proposal.decision ? 'CONSERVATIVE_SHIFT' : 'MAINTAINED',
      rationale: `Proposta=${proposal.decision}, Verif=${verification.severity}`
    };
  }

  reachConsensus(proposal, verification, revision) {
    const weights = { proposer: 0.4, verifier: 0.3, reviser: 0.3 };
    if (revision.modification === 'CONSERVATIVE_SHIFT') {
      weights.reviser = 0.5; weights.proposer = 0.3;
    }

    const finalConfidence = (
      proposal.confidence * weights.proposer +
      verification.trustAdjustment * weights.verifier +
      revision.finalConfidence * weights.reviser
    );

    return {
      decision: revision.finalDecision,
      confidence: finalConfidence,
      stake: proposal.stake * verification.trustAdjustment,
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

  async receiveOverride(deliberationId, userDecision, reason) {
    const delib = this.deliberations.get(deliberationId);
    if (!delib) return null;

    delib.yourOverride = { original: delib.consensus.decision, override: userDecision, reason, timestamp: Date.now() };
    delib.consensus.decision = userDecision;
    delib.status = 'OVERRIDDEN';

    await db.query(
      `UPDATE triad_deliberations SET your_override = $1, executed = true WHERE deliberation_id = $2`,
      [JSON.stringify(delib.yourOverride), deliberationId]
    );

    return delib;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENTE IMORTAL
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
    
    console.log(`🌟 [${this.id}] ${this.species} | Capital: ${this.state.capital}`);
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
    return [
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
      Math.min(1, this.state.memory.length / 100)
    ].slice(0, this.getInputSize());
  }

  calculateStake(confidence) {
    const edge = confidence - 0.5;
    const kelly = edge / 0.5;
    const stake = this.state.capital * kelly * 0.25;
    return Math.max(this.state.capital * 0.005, Math.min(this.state.capital * 0.05, stake));
  }

  async learn(gameId, result, profit) {
    const decision = this.state.decisions.find(d => d.game === gameId);
    if (!decision) return;

    decision.result = result;
    decision.profit = profit;
    this.state.fitness += profit;
    this.state.capital += profit;

    const features = this.extractFeatures(decision.gameContext);
    const target = this.encodeResult(result);
    
    await this.state.brain.fit(
      tf.tensor2d([features]),
      tf.tensor2d([target]),
      { epochs: 1, verbose: 0 }
    );

    this.state.memory.push({ game: decision.gameContext, result, profit, timestamp: Date.now() });
    console.log(`📚 [${this.id}] ${result} | ${profit.toFixed(2)} | Fitness: ${this.state.fitness.toFixed(2)}`);
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
    return {
      id: this.id,
      species: this.species,
      incarnation: this.soul.incarnation,
      fitness: this.state.fitness,
      capital: this.state.capital,
      decisions: this.state.decisions.length,
      alive: this.alive
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ECOSSISTEMA ETERNUM
// ═══════════════════════════════════════════════════════════════════════════════

class EternumEcosystem {
  constructor() {
    this.agents = new Map();
    this.triad = new TriadCognitive();
    this.population = [];
    this.generation = 0;
    this.dailyStats = { stakeUsed: 0, date: new Date().toDateString() };
    this.running = false;
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
    this.evolutionLoop();
  }

  async processGame(game) {
    if (new Date().toDateString() !== this.dailyStats.date) {
      this.dailyStats = { stakeUsed: 0, date: new Date().toDateString() };
    }

    if (this.dailyStats.stakeUsed >= CONFIG.MAX_DAILY_STAKE) {
      console.log('📊 Limite diário');
      return null;
    }

    console.log(`\n🏀 ${game.home_team || game.homeTeam} vs ${game.away_team || game.awayTeam}`);

    const specialist = this.selectSpecialist();
    if (!specialist) return null;

    const deliberation = await this.triad.deliberate(game, specialist);

    if (deliberation.status === 'AUTO_EXECUTE' && CONFIG.AUTO_EXECUTE) {
      await this.executeDecision(deliberation, specialist);
    } else {
      await this.consultUser(deliberation);
    }

    return deliberation;
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

    // Simula resultado (em produção: verificar resultado real)
    setTimeout(() => {
      const won = Math.random() > 0.45;
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
🎓 **CONSULTA ETERNUM**

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
    const profit = won ? agent.state.decisions.slice(-1)[0].stake * 0.9 : -agent.state.decisions.slice(-1)[0].stake;
    await agent.learn(deliberationId, won ? 'win' : 'loss', profit);
    
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
      await db.query(`UPDATE immortal_snapshots SET status = 'DYING' WHERE agent_id = $1`, [morto.id]);
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

  getStatus() {
    return {
      generation: this.generation,
      agents: Array.from(this.agents.values()).map(a => a.getStatus()),
      dailyStake: this.dailyStats
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TELEGRAM BOT
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
🌌 **NBA BRAIN PRO v10.0 ETERNUM**

/comandos - Lista de comandos
/status - Status do ecossistema
/force - Forçar análise agora
/eternity - Ver agentes imortais
`));

  bot.command('comandos', (ctx) => ctx.replyWithMarkdown(`
📋 **COMANDOS**

🔍 /scan ou /force - Analisar jogos
🧠 /eternity - Agentes imortais
📊 /status - Status geral
🧬 /evolve - Forçar evolução
💾 /snapshot - Backup manual
`));

  bot.command('status', (ctx) => {
    const s = ecosystem.getStatus();
    ctx.replyWithMarkdown(`
🌌 **ETERNUM**

Geração: ${s.generation}
Agentes: ${s.agents.filter(a => a.alive).length}/${s.agents.length}
Stake hoje: ${s.dailyStake.stakeUsed.toFixed(1)}/${CONFIG.MAX_DAILY_STAKE}u

Top: ${s.agents.sort((a,b) => b.fitness - a.fitness)[0]?.id.slice(0,8) || 'N/A'}
Fitness: ${s.agents.sort((a,b) => b.fitness - a.fitness)[0]?.fitness.toFixed(1) || 0}
`);
  });

  bot.command('eternity', (ctx) => {
    const s = ecosystem.getStatus();
    const top = s.agents
      .sort((a, b) => b.fitness - a.fitness)
      .slice(0, 5)
      .map((a, i) => `${i+1}. \`${a.id.slice(0,8)}\` | ${a.species} | F:${a.fitness.toFixed(0)} | C:${a.capital.toFixed(0)}`)
      .join('\n');
    
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

  // Callbacks
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
📊 **ANÁLISE**

Propositor: ${d.proposer.reasoning}
Verificador: ${d.verifier.concerns.join(', ') || 'Nenhuma'}
Revisor: ${d.reviser.rationale}

Probs: ${d.proposer.rawProbs.map(p => (p*100).toFixed(0)+'%').join(' | ')}
`);
  });

  return bot;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVIÇOS
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchOdds() {
  if (!CONFIG.ODDS_API_KEY) {
    return [{
      id: 'mock-' + Date.now(),
      home_team: 'Boston Celtics',
      away_team: 'LA Lakers',
      commence_time: new Date(Date.now() + 3600000).toISOString(),
      homeWinPct: 0.65, awayWinPct: 0.35,
      homeLast10: 8, awayLast10: 5,
      homeRest: 2, awayRest: 1,
      momentumHome: 0.8, momentumAway: 0.4
    }];
  }

  try {
    const res = await axios.get(
      `https://api.the-odds-api.com/v4/sports/basketball_nba/odds?regions=us&markets=h2h&apiKey=${CONFIG.ODDS_API_KEY}`,
      { timeout: 10000 }
    );
    return res.data;
  } catch (e) {
    console.error('Erro odds:', e.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

const app = express();
app.use(express.json());

let ecosystem;

app.get('/', (req, res) => {
  res.json({
    system: 'NBA BRAIN PRO v10.0 ETERNUM',
    status: ecosystem?.running ? 'operational' : 'initializing',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'healthy', agents: ecosystem?.agents?.size || 0 });
  } catch (e) {
    res.status(500).json({ status: 'unhealthy', error: e.message });
  }
});

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  NBA BRAIN PRO v10.0 ETERNUM');
  console.log('='.repeat(60) + '\n');

  await initDatabase();
  
  ecosystem = new EternumEcosystem();
  await ecosystem.genesis();
  
  const bot = setupBot(ecosystem);
  global.bot = bot;
  bot.launch();
  
  app.listen(CONFIG.PORT, () => {
    console.log(`\n🌐 Porta ${CONFIG.PORT}`);
    console.log('='.repeat(60));
    console.log('  ETERNUM ESTÁ VIVO');
    console.log('='.repeat(60) + '\n');
  });

  setInterval(async () => {
    const games = await fetchOdds();
    for (const g of games.slice(0, 2)) {
      await ecosystem.processGame(g);
    }
  }, 300000);

  setInterval(() => {
    http.get(`http://localhost:${CONFIG.PORT}/`, () => {});
  }, 14 * 60 * 1000);
}

main().catch(err => {
  console.error('💀 FALHA:', err);
  process.exit(1);
});
