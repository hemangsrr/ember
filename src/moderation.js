const { getChannel } = require('./store');

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<]+/gi;
const TYPES = ['images', 'videos', 'links', 'commands', 'text'];

function classify(message) {
  const attachments = [...message.attachments.values()];
  const image = attachments.some((file) => file.contentType?.startsWith('image/'));
  const video = attachments.some((file) => file.contentType?.startsWith('video/'));
  const links = URL_PATTERN.test(message.content);
  URL_PATTERN.lastIndex = 0;
  const commands = /^\s*[!/]/.test(message.content);
  const remaining = message.content
    .replace(URL_PATTERN, '')
    .replace(/^\s*[!/]\S*/, '')
    .trim();
  URL_PATTERN.lastIndex = 0;
  const text = Boolean(remaining);
  return { images: image, videos: video, links, commands, text };
}

function allowedDescription(settings) {
  const singular = { images: 'image', videos: 'video', links: 'link', commands: 'command', text: 'text' };
  const names = TYPES.filter((type) => settings.allowed?.[type]).map((type) => singular[type]);
  return names.length ? names.join(', ') : 'no content';
}

async function moderateMessage(message) {
  if (message.author.bot || !message.guild || !message.deletable) return;
  const settings = await getChannel(message.channelId);
  if (!settings || !settings.enabled) return;

  const roleIds = settings.roleIds || [];
  const hasAllowedRole = roleIds.some((roleId) => message.member?.roles.cache.has(roleId));
  const roleBlocked = roleIds.length > 0 && !hasAllowedRole;
  const classified = classify(message);
  const contentBlocked = TYPES.some((type) => classified[type] && !settings.allowed?.[type]);

  if (!roleBlocked && !contentBlocked) return;

  try {
    await message.delete();
    const alert = await message.channel.send({
      content: `<@${message.author.id}> only ${allowedDescription(settings)} allowed here.`,
      allowedMentions: { users: [message.author.id] }
    });
    setTimeout(() => alert.delete().catch(() => {}), 10_000);
  } catch (error) {
    console.error(`Could not moderate message in ${message.channelId}:`, error.message);
  }
}

module.exports = { moderateMessage, TYPES };
