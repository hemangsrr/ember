require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { moderateMessage } = require('./moderation');
const { dashboard } = require('./dashboard');

for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_REDIRECT_URI', 'DASHBOARD_USERNAME', 'DASHBOARD_PASSWORD', 'SESSION_SECRET']) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });
client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));
client.on('messageCreate', moderateMessage);
client.login(process.env.DISCORD_TOKEN);

const app = dashboard(client);
const port = Number(process.env.PORT || 3000);
// Railway's public proxy reaches services through the injected PORT on all interfaces.
app.listen(port, '0.0.0.0', () => console.log(`Dashboard listening on port ${port}`));
