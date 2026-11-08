require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { moderateMessage } = require('./moderation');
const { dashboard } = require('./dashboard');

for (const key of ['DISCORD_TOKEN', 'DASHBOARD_USERNAME', 'DASHBOARD_PASSWORD']) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });
client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));
client.on('messageCreate', moderateMessage);
client.login(process.env.DISCORD_TOKEN);

const app = dashboard(client);
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Dashboard listening on port ${port}`));
