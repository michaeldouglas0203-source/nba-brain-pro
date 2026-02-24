const express = require('express');
const { Telegraf } = require('telegraf');

const app = express();
const BOT_TOKEN = '8045598302:AAFD5EN4uelzckSFxp8Wn43na0IdcBolqOo';
const bot = new Telegraf(BOT_TOKEN);

const ALLOWED_USER_IDS = [7707876089];

bot.use((ctx, next) => {
  if (!ALLOWED_USER_IDS.includes(ctx.from?.id)) return;
  return next();
});

bot.start((ctx) => {
  ctx.reply('Bem-vindo ao NBA Brain Pro! Teste OK.');
});

bot.command('scan', (ctx) => {
  ctx.reply('Scan test OK - sem IA pesada por enquanto.');
});

bot.launch().then(() => console.log('Bot iniciado com sucesso!'));

app.get('/', (req, res) => res.send('Servidor OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor na porta ${PORT}`));
