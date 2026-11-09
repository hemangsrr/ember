const fs = require('node:fs/promises');
const path = require('node:path');

const filePath = path.join(__dirname, '..', 'data', 'settings.json');
let queue = Promise.resolve();

async function read() {
  try {
    const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return { channels: data.channels || {}, deletions: data.deletions || [] };
  } catch (error) {
    if (error.code === 'ENOENT') return { channels: {}, deletions: [] };
    throw error;
  }
}

async function write(data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function getChannel(channelId) {
  return read().then((data) => data.channels[channelId] || null);
}

function allChannels() {
  return read().then((data) => data.channels);
}

function saveChannel(channelId, settings) {
  queue = queue.then(async () => {
    const data = await read();
    data.channels[channelId] = settings;
    await write(data);
  });
  return queue;
}

function removeChannel(channelId) {
  queue = queue.then(async () => {
    const data = await read();
    delete data.channels[channelId];
    await write(data);
  });
  return queue;
}

function recordDeletion(deletion) {
  queue = queue.then(async () => {
    const data = await read();
    data.deletions.unshift(deletion);
    await write(data);
  });
  return queue;
}

function deletionsForGuild(guildId) {
  return read().then((data) => data.deletions.filter((deletion) => deletion.guildId === guildId));
}

module.exports = { getChannel, allChannels, saveChannel, removeChannel, recordDeletion, deletionsForGuild };
