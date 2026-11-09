const express = require('express');
const session = require('express-session');
const crypto = require('node:crypto');
const { allChannels, saveChannel, removeChannel, deletionsForGuild } = require('./store');
const { TYPES } = require('./moderation');

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function guildMark(guild) {
  const letter = escapeHtml(guild.name[0]?.toUpperCase() || '?');
  const iconUrl = guild.iconURL({ extension: 'png', size: 128 });
  if (!iconUrl) return `<span class="server-mark rounded-circle d-flex align-items-center justify-content-center fs-4">${letter}</span>`;
  return `<span class="server-mark has-icon rounded-circle d-flex align-items-center justify-content-center fs-4"><span class="fallback">${letter}</span><img src="${escapeHtml(iconUrl)}" alt="${escapeHtml(guild.name)} server icon" onerror="this.remove();this.parentElement.classList.remove('has-icon')"></span>`;
}

function page(title, body, scripts = '') {
  return `<!doctype html><html lang="en" data-bs-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Ember</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"><link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet"><style>:root{--ember:#ff6b4a;--violet:#9b6cff;--panel:#141522;--panel-2:#1a1c2d;--line:#30334b}body{min-height:100vh;background:radial-gradient(circle at 5% 0,#262046 0,transparent 30%),radial-gradient(circle at 95% 15%,#302044 0,transparent 28%),#0c0d16;color:#edf0ff}.navbar{background:rgba(12,13,22,.8)!important;border-bottom:1px solid var(--line);backdrop-filter:blur(14px)}.navbar-brand i{color:var(--ember);filter:drop-shadow(0 0 7px var(--ember))}.eyebrow{color:#bb9cff;letter-spacing:.09em}.server-card,.control-card,.modal-content{background:linear-gradient(145deg,var(--panel-2),var(--panel));border:1px solid var(--line)!important}.server-card{transition:transform .18s,border-color .18s,box-shadow .18s}.server-card:hover{transform:translateY(-5px);border-color:#9b6cff!important;box-shadow:0 0 25px rgba(155,108,255,.18)}.server-mark{width:50px;height:50px;background:linear-gradient(135deg,var(--ember),var(--violet));box-shadow:0 0 20px rgba(255,107,74,.35);color:#fff;font-weight:700;overflow:hidden;flex:none}.server-mark img{width:100%;height:100%;object-fit:cover}.server-mark.has-icon .fallback{display:none}.control-card{border-left:3px solid var(--ember)!important}.btn-primary{--bs-btn-bg:#7448df;--bs-btn-border-color:#7448df;--bs-btn-hover-bg:#8c65ea;--bs-btn-hover-border-color:#8c65ea;box-shadow:0 0 17px rgba(116,72,223,.25)}.btn-outline-danger{--bs-btn-color:#ff8e7a;--bs-btn-border-color:#a64c43;--bs-btn-hover-bg:#a64c43}.combo{position:relative}.combo-trigger{background:#10111d!important;border-color:#3a3e59!important;color:#eef!important;text-align:left}.combo-trigger:focus{box-shadow:0 0 0 .25rem rgba(155,108,255,.22)}.combo-panel{display:none;position:absolute;z-index:10;left:0;right:0;top:calc(100% + .35rem);max-height:245px;overflow:auto;background:#10111d;border:1px solid #4b4f70;border-radius:.6rem;box-shadow:0 18px 40px rgba(0,0,0,.5)}.combo.open .combo-panel{display:block}.combo-search{position:sticky;top:0;background:#10111d;padding:.6rem;border-bottom:1px solid #343752}.combo-option{display:block;width:100%;border:0;background:transparent;color:#e7e9fa;text-align:left;padding:.6rem .8rem}.combo-option:hover,.combo-option.selected{background:#292342}.combo-option.selected:after{content:'✓';float:right;color:#b79bff}.form-control{background:#10111d;border-color:#3a3e59;color:#eef}.form-control:focus{background:#10111d;color:#fff;border-color:#9b6cff;box-shadow:0 0 0 .25rem rgba(155,108,255,.2)}.toggle{background:#10111d;border-color:#363a56!important}.modal-header,.modal-footer{border-color:#30334b}.form-check-input:checked{background-color:#8b62ec;border-color:#8b62ec}</style></head><body><nav class="navbar navbar-expand"><div class="container"><a class="navbar-brand fw-bold" href="/"><i class="bi bi-shield-fill-check me-2"></i>Ember</a><span class="navbar-text small text-secondary"><i class="bi bi-lightning-charge-fill text-warning me-1"></i>Moderation dashboard</span></div></nav><main class="container py-4 py-md-5">${body}</main><script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>${scripts}</body></html>`;
}

function hasManagementPermission(userGuild) {
  if (userGuild.owner) return true;
  const permissions = BigInt(userGuild.permissions || '0');
  return (permissions & 0x8n) !== 0n || (permissions & 0x20n) !== 0n;
}

function loginPage(message = '') {
  const notice = message ? `<div class="alert alert-danger border-danger-subtle">${escapeHtml(message)}</div>` : '';
  return page('Sign in', `<div class="row justify-content-center pt-md-5"><div class="col-md-8 col-lg-5"><div class="card control-card shadow-lg"><div class="card-body p-4 p-md-5"><div class="text-center mb-4"><i class="bi bi-shield-lock-fill fs-1 text-info"></i><h1 class="h3 fw-bold mt-2">Welcome to Ember</h1><p class="text-secondary mb-0">Sign in to manage your server's channel controls.</p></div>${notice}<a class="btn btn-primary w-100 py-2 mb-4" href="/auth/discord"><i class="bi bi-discord me-2"></i>Continue with Discord</a><div class="d-flex align-items-center gap-3 text-secondary small mb-4"><hr class="flex-grow-1">or administrator login<hr class="flex-grow-1"></div><form method="post" action="/login"><label class="form-label">Username</label><input class="form-control mb-3" name="username" autocomplete="username" required><label class="form-label">Password</label><input class="form-control mb-4" type="password" name="password" autocomplete="current-password" required><button class="btn btn-outline-light w-100" type="submit"><i class="bi bi-key me-1"></i>Sign in as administrator</button></form></div></div></div></div>`);
}

function dashboard(client) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.urlencoded({ extended: false }));
  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT_NAME), maxAge: 1000 * 60 * 60 * 8 }
  }));
  app.get('/health', (_req, res) => res.json({ ok: true, discordReady: client.isReady() }));
  app.get('/login', (req, res) => res.send(loginPage(req.query.error)));
  app.post('/login', (req, res) => {
    const digest = (value) => crypto.createHash('sha256').update(value).digest();
    const usernameMatches = crypto.timingSafeEqual(digest(req.body.username || ''), digest(process.env.DASHBOARD_USERNAME));
    const passwordMatches = crypto.timingSafeEqual(digest(req.body.password || ''), digest(process.env.DASHBOARD_PASSWORD));
    if (!usernameMatches || !passwordMatches) return res.status(401).send(loginPage('Incorrect administrator credentials.'));
    req.session.auth = { type: 'admin' };
    return res.redirect('/');
  });
  app.get('/auth/discord', (req, res) => {
    const state = crypto.randomBytes(24).toString('hex');
    req.session.oauthState = state;
    const params = new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, redirect_uri: process.env.DISCORD_REDIRECT_URI, response_type: 'code', scope: 'identify guilds', state });
    res.redirect(`https://discord.com/oauth2/authorize?${params}`);
  });
  app.get('/auth/discord/callback', async (req, res) => {
    if (!req.query.code || req.query.state !== req.session.oauthState) return res.redirect('/login?error=Discord+sign-in+could+not+be+verified.');
    delete req.session.oauthState;
    try {
      const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code: req.query.code, redirect_uri: process.env.DISCORD_REDIRECT_URI }) });
      if (!tokenResponse.ok) throw new Error('Token exchange failed');
      const token = await tokenResponse.json();
      const headers = { Authorization: `Bearer ${token.access_token}` };
      const [userResponse, guildResponse] = await Promise.all([fetch('https://discord.com/api/v10/users/@me', { headers }), fetch('https://discord.com/api/v10/users/@me/guilds', { headers })]);
      if (!userResponse.ok || !guildResponse.ok) throw new Error('Discord account lookup failed');
      const user = await userResponse.json();
      const userGuilds = await guildResponse.json();
      req.session.auth = { type: 'discord', user: { id: user.id, username: user.global_name || user.username }, guildIds: userGuilds.filter(hasManagementPermission).map((item) => item.id) };
      return res.redirect('/');
    } catch (error) {
      console.error('Discord OAuth login failed:', error.message);
      return res.redirect('/login?error=Discord+sign-in+failed.+Please+try+again.');
    }
  });
  app.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));
  app.use((req, res, next) => req.session.auth ? next() : res.redirect('/login'));

  app.get('/', async (req, res) => {
    const stored = await allChannels();
    const allGuilds = [...client.guilds.cache.values()];
    const guilds = (req.session.auth.type === 'admin' ? allGuilds : allGuilds.filter((guild) => req.session.auth.guildIds.includes(guild.id))).sort((a, b) => a.name.localeCompare(b.name));
    const guild = guilds.find((item) => item.id === req.query.guildId);
    const installUrl = process.env.DISCORD_CLIENT_ID ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(process.env.DISCORD_CLIENT_ID)}&permissions=76800&scope=bot%20applications.commands` : null;

    if (!guild) {
      const cards = guilds.map((item) => {
        const count = Object.values(stored).filter((control) => control.guildId === item.id).length;
        return `<div class="col"><a href="/?guildId=${item.id}" class="server-card card h-100 text-decoration-none text-light"><div class="card-body d-flex align-items-center gap-3">${guildMark(item)}<div class="overflow-hidden"><h2 class="h5 mb-1 text-truncate">${escapeHtml(item.name)}</h2><p class="text-secondary small mb-0"><i class="bi bi-toggles2 me-1"></i>${count} active ${count === 1 ? 'control' : 'controls'}</p></div><i class="bi bi-chevron-right ms-auto text-secondary"></i></div></a></div>`;
      }).join('') || '<div class="col-12"><div class="alert alert-dark border-secondary">Waiting for Discord to connect, or the bot has not joined a server yet.</div></div>';
      const install = installUrl ? `<a class="btn btn-outline-light" href="${installUrl}" target="_blank" rel="noopener"><i class="bi bi-plus-circle me-1"></i>Install Ember</a>` : '';
      return res.send(page('Servers', `<div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-5"><div><p class="eyebrow fw-bold small mb-2">SERVER MANAGEMENT</p><h1 class="display-6 fw-bold mb-1">Select a server</h1><p class="text-secondary mb-0">Configure protected channels with a few focused controls.</p></div>${install}</div><div class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-4">${cards}</div>`));
    }

    const channels = [...guild.channels.cache.values()].filter((channel) => channel.isTextBased() && !channel.isThread()).sort((a, b) => a.name.localeCompare(b.name));
    const roles = [...guild.roles.cache.values()].filter((role) => !role.managed && role.id !== guild.id).sort((a, b) => b.position - a.position);
    const activeControls = Object.entries(stored).filter(([, control]) => control.guildId === guild.id);
    const deletions = await deletionsForGuild(guild.id);
    const controls = activeControls.map(([channelId, control]) => {
      const channelName = guild.channels.cache.get(channelId)?.name || control.channelName || 'Unavailable channel';
      const allowed = TYPES.filter((type) => control.allowed?.[type]).map((type) => type[0].toUpperCase() + type.slice(1)).join(' · ') || 'No content';
      return `<article class="control-card card mb-3"><div class="card-body d-flex flex-column flex-sm-row align-items-sm-center gap-3"><div class="flex-grow-1"><h2 class="h6 mb-1"><i class="bi bi-hash text-info"></i>${escapeHtml(channelName)}</h2><div class="text-secondary small">ID <code>${channelId}</code></div><span class="badge rounded-pill text-bg-dark border border-secondary mt-2">${escapeHtml(allowed)}</span></div><form method="post" action="/channels/${channelId}/delete?guildId=${guild.id}"><button class="btn btn-outline-danger btn-sm"><i class="bi bi-x-circle me-1"></i>Disable</button></form></div></article>`;
    }).join('') || '<div class="control-card card"><div class="card-body text-center py-5 text-secondary"><i class="bi bi-shield-slash fs-2 d-block mb-2"></i>No channel controls are active yet.</div></div>';
    const channelOptions = channels.map((channel) => `<button type="button" class="combo-option" data-value="${channel.id}" data-label="# ${escapeHtml(channel.name)}"># ${escapeHtml(channel.name)} <span class="text-secondary small">— ${channel.id}</span></button>`).join('');
    const roleOptions = roles.map((role) => `<button type="button" class="combo-option" data-value="${role.id}" data-label="@${escapeHtml(role.name)}">@${escapeHtml(role.name)}</button>`).join('');
    const toggles = TYPES.map((type) => `<div class="col"><div class="toggle form-check rounded-3 p-3"><input class="form-check-input" type="checkbox" name="${type}" id="${type}" checked><label class="form-check-label" for="${type}">${type[0].toUpperCase() + type.slice(1)}</label></div></div>`).join('');
    const deletionRows = deletions.map((entry) => `<tr><td><div class="fw-semibold">${escapeHtml(entry.username)}</div><code>${escapeHtml(entry.userId)}</code></td><td><div class="text-info"># ${escapeHtml(entry.channelName || entry.channelId)}</div><small class="text-secondary">${escapeHtml(entry.reason || 'Deleted')}</small></td><td class="log-content">${escapeHtml(entry.messageContent)}</td><td><code>${escapeHtml(entry.messageId)}</code><br><small class="text-secondary">${escapeHtml(new Date(entry.deletedAt).toLocaleString())}</small></td></tr>`).join('') || '<tr><td colspan="4" class="text-center text-secondary py-4">No messages have been deleted in this server.</td></tr>';
    const logModal = `<div class="modal fade" id="deletionLogModal" tabindex="-1" aria-labelledby="deletionLogTitle" aria-hidden="true"><div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><div><p class="eyebrow fw-bold small mb-1">MODERATION HISTORY</p><h2 class="modal-title h5" id="deletionLogTitle">Deletion log <span class="badge text-bg-dark border border-secondary">${deletions.length}</span></h2></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div><div class="modal-body p-0"><div class="table-responsive"><table class="table table-dark table-hover align-middle mb-0"><thead><tr><th>User</th><th>Channel / reason</th><th>Message content</th><th>Message / time</th></tr></thead><tbody>${deletionRows}</tbody></table></div></div><div class="modal-footer"><button class="btn btn-outline-light" type="button" data-bs-dismiss="modal">Close</button></div></div></div></div>`;
    const modal = `<div class="modal fade" id="controlModal" tabindex="-1" aria-labelledby="controlModalTitle" aria-hidden="true"><div class="modal-dialog modal-dialog-centered"><div class="modal-content"><form method="post" action="/channels"><input type="hidden" name="guildId" value="${guild.id}"><input type="hidden" id="channelId" name="channelId"><select id="roleIds" name="roleIds" multiple hidden>${roles.map((role) => `<option value="${role.id}">${escapeHtml(role.name)}</option>`).join('')}</select><div class="modal-header"><div><p class="eyebrow fw-bold small mb-1">NEW RULE</p><h2 class="modal-title h5" id="controlModalTitle">Add channel control</h2></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div><div class="modal-body"><p class="text-secondary small">Choose where the rule applies, who can post, and what they can post.</p><div class="mb-4 combo" data-combo="channel"><label class="form-label fw-semibold">Channel</label><button type="button" class="combo-trigger btn w-100 d-flex justify-content-between align-items-center"><span>Select a channel</span><i class="bi bi-chevron-down"></i></button><div class="combo-panel"><div class="combo-search"><input class="form-control form-control-sm" type="search" placeholder="Search channels…" autocomplete="off"></div><div class="combo-options">${channelOptions || '<span class="d-block p-3 text-secondary small">No text channels available.</span>'}</div></div><div class="invalid-feedback d-block d-none">Select a channel to continue.</div></div><div class="mb-4 combo" data-combo="roles"><label class="form-label fw-semibold">Roles allowed to post <span class="text-secondary fw-normal">(optional)</span></label><button type="button" class="combo-trigger btn w-100 d-flex justify-content-between align-items-center"><span>Everyone with Discord channel access</span><i class="bi bi-chevron-down"></i></button><div class="combo-panel"><div class="combo-search"><input class="form-control form-control-sm" type="search" placeholder="Search roles…" autocomplete="off"></div><div class="combo-options">${roleOptions || '<span class="d-block p-3 text-secondary small">No assignable roles available.</span>'}</div></div><div class="form-text text-secondary">Leave blank to follow the channel's existing Discord permissions.</div></div><fieldset><legend class="fs-6 fw-semibold mb-2">Allowed content</legend><div class="row row-cols-2 g-2">${toggles}</div></fieldset></div><div class="modal-footer"><button class="btn btn-outline-light" type="button" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" type="submit"><i class="bi bi-shield-check me-1"></i>Enable control</button></div></form></div></div></div>`;
    const script = `<script>document.querySelectorAll('.combo').forEach((combo)=>{const trigger=combo.querySelector('.combo-trigger'),search=combo.querySelector('input[type=search]'),options=[...combo.querySelectorAll('.combo-option')],kind=combo.dataset.combo;trigger.addEventListener('click',()=>{document.querySelectorAll('.combo.open').forEach(x=>{if(x!==combo)x.classList.remove('open')});combo.classList.toggle('open');if(combo.classList.contains('open'))setTimeout(()=>search.focus(),0)});search.addEventListener('input',()=>{const q=search.value.toLowerCase();options.forEach(x=>x.hidden=!x.textContent.toLowerCase().includes(q))});options.forEach(option=>option.addEventListener('click',()=>{if(kind==='channel'){document.getElementById('channelId').value=option.dataset.value;trigger.querySelector('span').textContent=option.dataset.label;options.forEach(x=>x.classList.remove('selected'));option.classList.add('selected');combo.classList.remove('open');combo.querySelector('.invalid-feedback').classList.add('d-none')}else{option.classList.toggle('selected');const selected=options.filter(x=>x.classList.contains('selected'));document.querySelectorAll('#roleIds option').forEach(x=>x.selected=selected.some(y=>y.dataset.value===x.value));trigger.querySelector('span').textContent=selected.length?selected.map(x=>x.dataset.label).join(', '):'Everyone with Discord channel access'}}));});document.addEventListener('click',(event)=>{if(!event.target.closest('.combo'))document.querySelectorAll('.combo.open').forEach(x=>x.classList.remove('open'))});document.querySelector('#controlModal form').addEventListener('submit',(event)=>{if(!document.getElementById('channelId').value){event.preventDefault();document.querySelector('[data-combo=channel] .invalid-feedback').classList.remove('d-none');document.querySelector('[data-combo=channel]').classList.add('open')}});</script>`;
    const body = `<a class="btn btn-sm btn-link text-decoration-none text-secondary px-0 mb-4" href="/"><i class="bi bi-arrow-left me-1"></i>All servers</a><div class="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3 mb-4"><div class="d-flex align-items-center gap-3">${guildMark(guild)}<div><p class="eyebrow fw-bold small mb-1">SERVER SETTINGS</p><h1 class="h2 fw-bold mb-0">${escapeHtml(guild.name)}</h1></div></div><div class="d-flex gap-2"><button class="btn btn-outline-light" data-bs-toggle="modal" data-bs-target="#deletionLogModal"><i class="bi bi-journal-text me-1"></i>Deletion log <span class="badge text-bg-dark">${deletions.length}</span></button><button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#controlModal"><i class="bi bi-plus-lg me-1"></i>Add channel control</button></div></div><section><div class="d-flex align-items-center justify-content-between mb-3"><h2 class="h5 mb-0">Active channel controls</h2><span class="badge text-bg-dark border border-secondary rounded-pill">${activeControls.length}</span></div>${controls}</section>${modal}${logModal}`;
    res.send(page(guild.name, body, script));
  });

  app.post('/channels', async (req, res) => {
    const roleIds = Array.isArray(req.body.roleIds) ? req.body.roleIds : req.body.roleIds ? [req.body.roleIds] : [];
    const guild = client.guilds.cache.get(req.body.guildId);
    const channel = guild?.channels.cache.get(req.body.channelId);
    if (req.session.auth.type !== 'admin' && !req.session.auth.guildIds.includes(req.body.guildId)) return res.status(403).send('You do not have permission to manage this server.');
    if (!guild || !channel?.isTextBased()) return res.status(400).send('The selected server or channel is unavailable.');
    await saveChannel(req.body.channelId, { enabled: true, guildId: guild.id, guildName: guild.name, channelName: channel.name, roleIds, allowed: Object.fromEntries(TYPES.map((type) => [type, Boolean(req.body[type])])) });
    res.redirect(`/?guildId=${guild.id}`);
  });
  app.post('/channels/:channelId/delete', async (req, res) => {
    const control = (await allChannels())[req.params.channelId];
    if (!control || (req.session.auth.type !== 'admin' && !req.session.auth.guildIds.includes(control.guildId))) return res.status(403).send('You do not have permission to manage this channel.');
    await removeChannel(req.params.channelId);
    res.redirect(`/?guildId=${req.query.guildId || ''}`);
  });
  return app;
}

module.exports = { dashboard };
