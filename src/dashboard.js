const express = require('express');
const { allChannels, saveChannel, removeChannel } = require('./store');
const { TYPES } = require('./moderation');

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function dashboard(client) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  // Render uses this unauthenticated endpoint to determine whether the web service is alive.
  app.get('/health', (_req, res) => res.json({ ok: true, discordReady: client.isReady() }));
  app.use((req, res, next) => {
    const expected = `Basic ${Buffer.from(`${process.env.DASHBOARD_USERNAME}:${process.env.DASHBOARD_PASSWORD}`).toString('base64')}`;
    if (req.headers.authorization === expected) return next();
    res.set('WWW-Authenticate', 'Basic realm="Ember dashboard"');
    return res.status(401).send('Dashboard authentication required.');
  });

  app.get('/', async (_req, res) => {
    const stored = await allChannels();
    const guilds = [...client.guilds.cache.values()];
    const installUrl = process.env.DISCORD_CLIENT_ID
      ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(process.env.DISCORD_CLIENT_ID)}&permissions=76800&scope=bot%20applications.commands`
      : null;
    const cards = guilds.map((guild) => {
      const channels = [...guild.channels.cache.values()].filter((channel) => channel.isTextBased() && !channel.isThread());
      const roles = [...guild.roles.cache.values()].filter((role) => !role.managed && role.id !== guild.id);
      return `<section class="card"><h2>${escapeHtml(guild.name)}</h2>
        <form method="post" action="/channels">
          <input type="hidden" name="guildId" value="${guild.id}">
          <label>Channel<select name="channelId" required>${channels.map((c) => `<option value="${c.id}"># ${escapeHtml(c.name)}</option>`).join('')}</select></label>
          <label>Roles allowed to post <small>(leave empty to use Discord permissions)</small><select name="roleIds" multiple size="5">${roles.map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}</select></label>
          <fieldset><legend>Allowed content</legend>${TYPES.map((type) => `<label class="check"><input type="checkbox" name="${type}" checked> ${type[0].toUpperCase() + type.slice(1)}</label>`).join('')}</fieldset>
          <button type="submit">Enable channel control</button>
        </form></section>`;
    }).join('') || '<p>Waiting for Discord connection or the bot has not joined a server yet.</p>';
    const active = Object.entries(stored).map(([id, value]) => `<li><code>${id}</code> — ${escapeHtml(value.guildName || 'Unknown server')} <form class="inline" method="post" action="/channels/${id}/delete"><button class="danger">Disable</button></form></li>`).join('') || '<li>None</li>';
    const install = installUrl ? `<p><a class="install" href="${installUrl}" target="_blank" rel="noopener">Install Ember to a server</a></p>` : '<p><small>Set DISCORD_CLIENT_ID to display the server-install link.</small></p>';
    res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ember dashboard</title><style>body{font-family:system-ui;background:#111827;color:#f9fafb;max-width:1000px;margin:auto;padding:2rem}h1{color:#f97316}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1rem}.card{background:#1f2937;padding:1.25rem;border-radius:12px}label{display:block;margin:.7rem 0}select{width:100%;margin-top:.3rem;padding:.45rem}.check{display:inline-block;margin-right:1rem}button,.install{display:inline-block;background:#f97316;color:#111827;text-decoration:none;border:0;border-radius:6px;padding:.6rem .9rem;font-weight:700;cursor:pointer}.danger{background:#ef4444;color:white}.inline{display:inline;margin-left:.5rem}small{color:#9ca3af}code{color:#fdba74}</style></head><body><h1>Ember moderation dashboard</h1><p>Configure channel controls for every server where the bot is present.</p>${install}<h2>Active controls</h2><ul>${active}</ul><div class="grid">${cards}</div></body></html>`);
  });
  app.post('/channels', async (req, res) => {
    const roleIds = Array.isArray(req.body.roleIds) ? req.body.roleIds : req.body.roleIds ? [req.body.roleIds] : [];
    await saveChannel(req.body.channelId, { enabled: true, guildId: req.body.guildId, guildName: client.guilds.cache.get(req.body.guildId)?.name, roleIds, allowed: Object.fromEntries(TYPES.map((type) => [type, Boolean(req.body[type])])) });
    res.redirect('/');
  });
  app.post('/channels/:channelId/delete', async (req, res) => { await removeChannel(req.params.channelId); res.redirect('/'); });
  return app;
}

module.exports = { dashboard };
