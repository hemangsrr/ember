const express = require('express');
const { allChannels, saveChannel, removeChannel } = require('./store');
const { TYPES } = require('./moderation');

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function page(title, body, scripts = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Ember</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"><link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet"><style>body{background:#f6f7fb}.navbar-brand i{color:#ff7849}.server-card{transition:transform .15s,box-shadow .15s;border:0}.server-card:hover{transform:translateY(-4px);box-shadow:0 .75rem 1.5rem rgba(15,23,42,.12)}.server-mark{width:48px;height:48px;background:linear-gradient(135deg,#ff7849,#8b5cf6);color:#fff;font-weight:700}.active-control{border-left:4px solid #ff7849}.content-toggle{min-width:130px}.form-select[multiple]{min-height:170px}</style></head><body><nav class="navbar navbar-dark bg-dark shadow-sm"><div class="container"><a class="navbar-brand fw-semibold" href="/"><i class="bi bi-shield-check me-2"></i>Ember</a><span class="navbar-text small">Channel moderation</span></div></nav><main class="container py-4 py-md-5">${body}</main><script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>${scripts}</body></html>`;
}

function dashboard(client) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.get('/health', (_req, res) => res.json({ ok: true, discordReady: client.isReady() }));
  app.use((req, res, next) => {
    const expected = `Basic ${Buffer.from(`${process.env.DASHBOARD_USERNAME}:${process.env.DASHBOARD_PASSWORD}`).toString('base64')}`;
    if (req.headers.authorization === expected) return next();
    res.set('WWW-Authenticate', 'Basic realm="Ember dashboard"');
    return res.status(401).send('Dashboard authentication required.');
  });

  app.get('/', async (req, res) => {
    const stored = await allChannels();
    const guilds = [...client.guilds.cache.values()].sort((a, b) => a.name.localeCompare(b.name));
    const selectedGuild = guilds.find((guild) => guild.id === req.query.guildId);
    const installUrl = process.env.DISCORD_CLIENT_ID ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(process.env.DISCORD_CLIENT_ID)}&permissions=76800&scope=bot%20applications.commands` : null;

    if (!selectedGuild) {
      const cards = guilds.map((guild) => {
        const controls = Object.values(stored).filter((control) => control.guildId === guild.id).length;
        return `<div class="col"><a class="card server-card h-100 text-decoration-none text-dark" href="/?guildId=${guild.id}"><div class="card-body d-flex gap-3 align-items-center"><div class="server-mark rounded-circle d-flex align-items-center justify-content-center fs-4">${escapeHtml(guild.name.charAt(0).toUpperCase())}</div><div class="overflow-hidden"><h2 class="h5 mb-1 text-truncate">${escapeHtml(guild.name)}</h2><p class="mb-0 text-secondary small"><i class="bi bi-sliders me-1"></i>${controls} active ${controls === 1 ? 'control' : 'controls'}</p></div><i class="bi bi-chevron-right ms-auto text-secondary"></i></div></a></div>`;
      }).join('') || '<div class="col-12"><div class="alert alert-secondary">Waiting for Discord to connect, or the bot has not joined a server yet.</div></div>';
      const install = installUrl ? `<a class="btn btn-outline-primary" href="${installUrl}" target="_blank" rel="noopener"><i class="bi bi-plus-circle me-1"></i>Install Ember</a>` : '';
      return res.send(page('Servers', `<div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4"><div><p class="text-uppercase text-primary fw-semibold small mb-1">Moderation dashboard</p><h1 class="display-6 fw-bold mb-1">Choose a server</h1><p class="text-secondary mb-0">Manage channel controls for a server where Ember is installed.</p></div>${install}</div><div class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-4">${cards}</div>`));
    }

    const channels = [...selectedGuild.channels.cache.values()].filter((channel) => channel.isTextBased() && !channel.isThread()).sort((a, b) => a.name.localeCompare(b.name));
    const roles = [...selectedGuild.roles.cache.values()].filter((role) => !role.managed && role.id !== selectedGuild.id).sort((a, b) => b.position - a.position);
    const activeControls = Object.entries(stored).filter(([, control]) => control.guildId === selectedGuild.id);
    const active = activeControls.map(([channelId, control]) => {
      const channel = selectedGuild.channels.cache.get(channelId);
      const channelName = channel?.name || control.channelName || 'Deleted or unavailable channel';
      const enabled = TYPES.filter((type) => control.allowed?.[type]).map((type) => type[0].toUpperCase() + type.slice(1)).join(', ') || 'No content';
      return `<div class="card active-control shadow-sm mb-3"><div class="card-body d-flex flex-column flex-md-row align-items-md-center gap-3"><div class="flex-grow-1"><h3 class="h6 mb-1"><i class="bi bi-hash text-primary"></i>${escapeHtml(channelName)}</h3><div class="small text-secondary">Channel ID: <code>${channelId}</code></div><div class="small mt-2"><span class="badge text-bg-light border">${escapeHtml(enabled)}</span></div></div><form method="post" action="/channels/${channelId}/delete?guildId=${selectedGuild.id}"><button class="btn btn-outline-danger btn-sm" type="submit"><i class="bi bi-x-circle me-1"></i>Disable</button></form></div></div>`;
    }).join('') || '<div class="border rounded-3 p-4 text-center text-secondary"><i class="bi bi-shield-slash fs-3 d-block mb-2"></i>No channel controls are active in this server yet.</div>';
    const contentToggles = TYPES.map((type) => `<div class="col"><div class="form-check border rounded-3 p-3 h-100 content-toggle"><input class="form-check-input" type="checkbox" name="${type}" id="${type}" checked><label class="form-check-label fw-medium" for="${type}">${type[0].toUpperCase() + type.slice(1)}</label></div></div>`).join('');
    const form = `<div class="card border-0 shadow-sm"><div class="card-body p-4"><div class="d-flex align-items-center gap-2 mb-4"><span class="rounded-circle bg-primary-subtle text-primary p-2"><i class="bi bi-plus-lg"></i></span><div><h2 class="h5 mb-0">Add channel control</h2><p class="small text-secondary mb-0">Messages that do not match the selected rules are deleted.</p></div></div><form method="post" action="/channels"><input type="hidden" name="guildId" value="${selectedGuild.id}"><div class="mb-4"><label class="form-label fw-semibold" for="channelId">Channel</label><input class="form-control mb-2 searchable" data-target="channelId" type="search" placeholder="Search channels…" autocomplete="off"><select class="form-select" name="channelId" id="channelId" required><option value="" selected disabled>Select a channel</option>${channels.map((channel) => `<option value="${channel.id}"># ${escapeHtml(channel.name)} — ${channel.id}</option>`).join('')}</select></div><div class="mb-4"><label class="form-label fw-semibold" for="roleIds">Roles allowed to post <span class="text-secondary fw-normal">(optional)</span></label><input class="form-control mb-2 searchable" data-target="roleIds" type="search" placeholder="Search roles…" autocomplete="off"><select class="form-select" name="roleIds" id="roleIds" multiple size="6">${roles.map((role) => `<option value="${role.id}">@${escapeHtml(role.name)}</option>`).join('')}</select><div class="form-text">Leave empty to follow the channel's existing Discord permissions. Hold Ctrl/Cmd to choose several roles.</div></div><fieldset class="mb-4"><legend class="fs-6 fw-semibold">Allowed content</legend><div class="row row-cols-2 row-cols-md-3 row-cols-xl-5 g-2">${contentToggles}</div></fieldset><button class="btn btn-primary" type="submit"><i class="bi bi-shield-check me-1"></i>Enable channel control</button></form></div></div>`;
    const script = '<script>document.querySelectorAll(".searchable").forEach((input)=>{const select=document.getElementById(input.dataset.target);input.addEventListener("input",()=>{const needle=input.value.toLowerCase();[...select.options].forEach((option)=>{if(!option.value)return;option.hidden=!option.text.toLowerCase().includes(needle);});});});</script>';
    res.send(page(selectedGuild.name, `<a class="btn btn-sm btn-link text-decoration-none ps-0 mb-3" href="/"><i class="bi bi-arrow-left me-1"></i>All servers</a><div class="d-flex align-items-center gap-3 mb-4"><div class="server-mark rounded-circle d-flex align-items-center justify-content-center fs-4">${escapeHtml(selectedGuild.name.charAt(0).toUpperCase())}</div><div><p class="text-uppercase text-primary fw-semibold small mb-1">Server settings</p><h1 class="h3 fw-bold mb-0">${escapeHtml(selectedGuild.name)}</h1></div></div><div class="row g-4"><section class="col-lg-7"><h2 class="h5 mb-3">Active channel controls <span class="badge text-bg-secondary">${activeControls.length}</span></h2>${active}</section><section class="col-lg-5">${form}</section></div>`, script));
  });

  app.post('/channels', async (req, res) => {
    const roleIds = Array.isArray(req.body.roleIds) ? req.body.roleIds : req.body.roleIds ? [req.body.roleIds] : [];
    const guild = client.guilds.cache.get(req.body.guildId);
    const channel = guild?.channels.cache.get(req.body.channelId);
    if (!guild || !channel?.isTextBased()) return res.status(400).send('The selected server or channel is unavailable.');
    await saveChannel(req.body.channelId, { enabled: true, guildId: guild.id, guildName: guild.name, channelName: channel.name, roleIds, allowed: Object.fromEntries(TYPES.map((type) => [type, Boolean(req.body[type])])) });
    res.redirect(`/?guildId=${guild.id}`);
  });
  app.post('/channels/:channelId/delete', async (req, res) => { await removeChannel(req.params.channelId); res.redirect(`/?guildId=${req.query.guildId || ''}`); });
  return app;
}

module.exports = { dashboard };
