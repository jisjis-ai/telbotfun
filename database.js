import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const USERS_FILE = 'usuarios.json';
const OPERATIONS_FILE = 'operations.json';
const GIFTCARDS_FILE = 'giftcards.json';
const CHANNELS_FILE = 'canais.json';

// Helper function to read JSON file
async function readJsonFile(filename) {
  try {
    const data = await fs.readFile(filename, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

// Helper function to write JSON file
async function writeJsonFile(filename, data) {
  await fs.writeFile(filename, JSON.stringify(data, null, 2), 'utf8');
}

export async function initDatabase() {
  // Initialize users.json if it doesn't exist
  const users = await readJsonFile(USERS_FILE);
  if (!users) {
    await writeJsonFile(USERS_FILE, []);
  }

  // Initialize operations.json if it doesn't exist
  const operations = await readJsonFile(OPERATIONS_FILE);
  if (!operations) {
    await writeJsonFile(OPERATIONS_FILE, {
      mines: { active: false, lastUpdated: new Date().toISOString() },
      aviator: { active: false, lastUpdated: new Date().toISOString() }
    });
  }

  // Initialize giftcards.json if it doesn't exist
  const giftcards = await readJsonFile(GIFTCARDS_FILE);
  if (!giftcards) {
    await writeJsonFile(GIFTCARDS_FILE, []);
  }

  // Initialize channels.json if it doesn't exist
  const channels = await readJsonFile(CHANNELS_FILE);
  if (!channels) {
    await writeJsonFile(CHANNELS_FILE, { channels: [] });
  }
}

export async function getUser(userId) {
  const users = await readJsonFile(USERS_FILE) || [];
  return users.find(user => user.id === userId);
}

export async function addUser(userId, username, invitedBy = null) {
  const users = await readJsonFile(USERS_FILE) || [];
  if (!users.some(user => user.id === userId)) {
    users.push({
      id: userId,
      username: username,
      credits: 0,
      invited_by: invitedBy,
      join_date: new Date().toISOString(),
      redeemed_giftcards: [],
      invites: []
    });
    await writeJsonFile(USERS_FILE, users);
  }
}

export async function addInvite(inviterId, invitedId) {
  const users = await readJsonFile(USERS_FILE) || [];
  const inviter = users.find(user => user.id === inviterId);
  
  if (inviter) {
    inviter.credits = (inviter.credits || 0) + 1;
    inviter.invites = inviter.invites || [];
    inviter.invites.push({
      invited_id: invitedId,
      date: new Date().toISOString()
    });
    await writeJsonFile(USERS_FILE, users);
  }
}

export async function getCredits(userId) {
  const user = await getUser(userId);
  return user ? user.credits : 0;
}

export async function getAllUsers() {
  return await readJsonFile(USERS_FILE) || [];
}

export async function decrementCredits(userId) {
  const users = await readJsonFile(USERS_FILE) || [];
  const user = users.find(user => user.id === userId);
  
  if (user && user.credits > 0) {
    user.credits--;
    await writeJsonFile(USERS_FILE, users);
  }
}

export async function getOperationStatus(operation) {
  const operations = await readJsonFile(OPERATIONS_FILE) || {};
  return operations[operation]?.active || false;
}

export async function setOperationStatus(operation, status) {
  const operations = await readJsonFile(OPERATIONS_FILE) || {};
  operations[operation] = {
    active: status,
    lastUpdated: new Date().toISOString()
  };
  await writeJsonFile(OPERATIONS_FILE, operations);
}

export async function getAllOperations() {
  const operations = await readJsonFile(OPERATIONS_FILE) || {};
  return Object.entries(operations).map(([name, data]) => ({
    name,
    active: data.active
  }));
}

export async function createGiftCard(credits) {
  const giftcards = await readJsonFile(GIFTCARDS_FILE) || [];
  const code = crypto.randomBytes(4).toString('hex').toUpperCase();
  
  const giftcard = {
    code,
    credits,
    created_at: new Date().toISOString(),
    created_by: 'admin',
    redeemed_by: []
  };
  
  giftcards.push(giftcard);
  await writeJsonFile(GIFTCARDS_FILE, giftcards);
  return code;
}

export async function getGiftCard(code) {
  const giftcards = await readJsonFile(GIFTCARDS_FILE) || [];
  return giftcards.find(g => g.code === code);
}

export async function redeemGiftCard(code, userId) {
  const giftcards = await readJsonFile(GIFTCARDS_FILE) || [];
  const users = await readJsonFile(USERS_FILE) || [];
  
  const giftcard = giftcards.find(g => g.code === code);
  const user = users.find(u => u.id === userId);
  
  if (!giftcard) {
    throw new Error('Código inválido');
  }
  
  if (!user) {
    throw new Error('Usuário não encontrado');
  }
  
  if (giftcard.redeemed_by.includes(userId)) {
    throw new Error('Você já resgatou este gift card');
  }
  
  // Adiciona o usuário à lista de resgates
  giftcard.redeemed_by.push(userId);
  
  // Atualiza os créditos do usuário
  user.credits += giftcard.credits;
  user.redeemed_giftcards = user.redeemed_giftcards || [];
  user.redeemed_giftcards.push(code);
  
  await writeJsonFile(GIFTCARDS_FILE, giftcards);
  await writeJsonFile(USERS_FILE, users);
  
  return giftcard.credits;
}

export async function getUserGiftCards(userId) {
  const giftcards = await readJsonFile(GIFTCARDS_FILE) || [];
  return giftcards.filter(g => g.redeemed_by.includes(userId));
}

export async function getUserInvites(userId) {
  const user = await getUser(userId);
  return user ? user.invites || [] : [];
}

export async function addChannel(channelId, channelTitle, ownerId) {
  const channelsData = await readJsonFile(CHANNELS_FILE) || { channels: [] };
  
  if (!channelsData.channels.some(channel => channel.id === channelId)) {
    channelsData.channels.push({
      id: channelId,
      title: channelTitle,
      owner_id: ownerId,
      added_date: new Date().toISOString(),
      status: 'pending', // pending, active, rejected
      member_count: 0
    });
    await writeJsonFile(CHANNELS_FILE, channelsData);
  }
}

export async function updateChannelStatus(channelId, status, memberCount = null) {
  const channelsData = await readJsonFile(CHANNELS_FILE) || { channels: [] };
  const channel = channelsData.channels.find(c => c.id === channelId);
  
  if (channel) {
    channel.status = status;
    if (memberCount !== null) {
      channel.member_count = memberCount;
    }
    await writeJsonFile(CHANNELS_FILE, channelsData);
  }
}

export async function getChannel(channelId) {
  const channelsData = await readJsonFile(CHANNELS_FILE) || { channels: [] };
  return channelsData.channels.find(channel => channel.id === channelId);
}

export async function getAllActiveChannels() {
  const channelsData = await readJsonFile(CHANNELS_FILE) || { channels: [] };
  return channelsData.channels.filter(channel => channel.status === 'active');
}

export async function getChannelsByOwner(ownerId) {
  const channelsData = await readJsonFile(CHANNELS_FILE) || { channels: [] };
  return channelsData.channels.filter(channel => channel.owner_id === ownerId);
}