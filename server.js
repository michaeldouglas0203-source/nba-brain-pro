// server.js - NBA Brain Pro Bot
const express = require('express');
const { Telegraf } = require('telegraf');
const axios = require('axios');

const app = express();
app.use(express.json());

// SUA API DO BOTFATHER
const BOT_TOKEN = '8045598302:AAFD5EN4uelzckSFxp8Wn43na0IdcBolqOo';
const bot = new Telegraf(BOT_TOKEN);

// Dados em memória
const users = new Map();
const opportunities = [];

// ========== BOT TELEGRAM ==========

bot.start((ctx) => {
    const userId = ctx.from.id;
    users.set(userId, {
        id: userId,
        name: ctx.from.first_name,
        bankroll: 100,
        autoTrading: false,
        bets: []
    });
    
    ctx.reply(`
🤖 *NBA Brain Pro - Auto Trader*

Bem-vindo, ${ctx.from.first_name}!

*Comandos:*
/start - Iniciar
/auto - Ativar/desativar trading
/scan - Buscar oportunidades
/status - Ver status
/bankroll - Ver bankroll
/help - Ajuda

⚠️ *Aviso:* Apostas envolvem riscos!
    `, { parse_mode: 'Markdown' });
});

bot.command('auto', (ctx) => {
    const user = users.get(ctx.from.id);
    if (!user) return ctx.reply('Envie /start primeiro');
    
    user.autoTrading = !user.autoTrading;
    
    if (user.autoTrading) {
        ctx.reply('🟢 *MODO AUTOMÁTICO ATIVADO*', { parse_mode: 'Markdown' });
        scanForUser(ctx.from.id);
    } else {
        ctx.reply('🔴 *MODO AUTOMÁTICO DESATIVADO*', { parse_mode: 'Markdown' });
    }
});

bot.command('scan', async (ctx) => {
    ctx.reply('🔍 Analisando jogos...');
    await scanForUser(ctx.from.id);
});

bot.command('status', (ctx) => {
    const user = users.get(ctx.from.id);
    if (!user) return ctx.reply('Envie /start primeiro');
    
    const todayBets = user.bets.filter(b => 
        new Date(b.date).toDateString() === new Date().toDateString()
    );
    
    const profit = todayBets.reduce((sum, b) => sum + (b.profit || 0), 0);
    
    ctx.reply(`
📊 *STATUS*

💰 Bankroll: ${user.bankroll}u
📈 Hoje: ${profit >= 0 ? '+' : ''}${profit.toFixed(2)}u
🎯 Bets: ${todayBets.length}
🤖 Auto: ${user.autoTrading ? 'ATIVO ✅' : 'PAUSADO ❌'}
    `, { parse_mode: 'Markdown' });
});

bot.command('bankroll', (ctx) => {
    ctx.reply('💰 Envie: /setbankroll 200 (para alterar)');
});

bot.hears(/\/setbankroll (.+)/, (ctx) => {
    const amount = parseFloat(ctx.match[1]);
    const user = users.get(ctx.from.id);
    if (!user) return;
    if (isNaN(amount) || amount <= 0) return ctx.reply('Valor inválido');
    
    user.bankroll = amount;
    ctx.reply(`✅ Bankroll: ${amount}u`);
});

// ========== ANÁLISE ==========

async function scanForUser(userId) {
    const user = users.get(userId);
    if (!user) return;
    
    // Jogos simulados
    const games = [
        { home: 'OKC Thunder', away: 'DEN Nuggets' },
        { home: 'BOS Celtics', away: 'NY Knicks' },
        { home: 'LAL Lakers', away: 'GS Warriors' }
    ];
    
    const found = [];
    
    for (const game of games) {
        if (Math.random() > 0.6) continue;
        
        const confidence = 75 + Math.floor(Math.random() * 20);
        const ev = 5 + Math.floor(Math.random() * 10);
        
        found.push({
            game: `${game.home} vs ${game.away}`,
            pick: Math.random() > 0.5 ? game.home : game.away,
            odds: (1.8 + Math.random() * 0.6).toFixed(2),
            confidence,
            ev,
            stake: (user.bankroll * 0.02).toFixed(2)
        });
    }
    
    if (found.length === 0) {
        return bot.telegram.sendMessage(userId, 
            '🔍 Nenhuma oportunidade encontrada. Tentando em 2min...'
        );
    }
    
    for (const opp of found.slice(0, 2)) {
        const msg = `
💎 *OPORTUNIDADE*

🏀 ${opp.game}
🎯 ${opp.pick}
📊 ${opp.confidence}% | 💰 ${opp.odds}
📈 +${opp.ev}% EV | 💵 ${opp.stake}u

${user.autoTrading ? '⏳ Auto em 30s...' : '👉 Responda EXECUTAR'}
        `;
        
        await bot.telegram.sendMessage(userId, msg, {
            parse_mode: 'Markdown'
        });
        
        if (user.autoTrading) {
            setTimeout(() => executeBet(userId, opp), 30000);
        }
    }
}

function executeBet(userId, opp) {
    const user = users.get(userId);
    const bet = { ...opp, date: new Date(), result: null, profit: null };
    user.bets.push(bet);
    
    bot.telegram.sendMessage(userId, `✅ *EXECUTADA*\n${opp.pick} @ ${opp.odds}`, {
        parse_mode: 'Markdown'
    });
    
    // Resultado simulado em 2h
    setTimeout(() => {
        const won = Math.random() > 0.45;
        bet.result = won ? 'win' : 'loss';
        bet.profit = won ? bet.stake * (bet.odds - 1) : -bet.stake;
        user.bankroll += bet.profit;
        
        bot.telegram.sendMessage(userId, 
            `${won ? '✅ GANHOU' : '❌ PERDEU'}: ${bet.profit >= 0 ? '+' : ''}${bet.profit.toFixed(2)}u`,
            { parse_mode: 'Markdown' }
        );
    }, 1000 * 60 * 60 * 2);
}

// ========== SERVIDOR ==========

app.get('/', (req, res) => {
    res.json({ status: 'NBA Brain Pro Online', users: users.size });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Servidor na porta ${PORT}`);
});

bot.launch();
console.log('🤖 Bot iniciado');

// Auto-scan a cada 2min
setInterval(() => {
    for (const [userId, user] of users) {
        if (user.autoTrading) scanForUser(userId);
    }
}, 2 * 60 * 1000);
