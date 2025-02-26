import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import Database from 'better-sqlite3';

const db = new Database('bot.db');

const USERS_FILE = 'usuarios.json';
const OPERATIONS_FILE = 'operations.json';
const GIFTCARDS_FILE = 'giftcards.json';
const CHANNELS_FILE = 'canais.json';

// Inicializa as tabelas do SQLite
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    credits INTEGER DEFAULT 0,
    invited_by INTEGER,
    join_date TEXT,
    redeemed_giftcards TEXT DEFAULT '[]',
    invites TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS operations (
    name TEXT PRIMARY KEY,
    active INTEGER DEFAULT 0,
    last_updated TEXT
  );

  CREATE TABLE IF NOT EXISTS giftcards (
    code TEXT PRIMARY KEY,
    credits INTEGER NOT NULL,
    created_at TEXT,
    created_by TEXT,
    redeemed_by TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    owner_id INTEGER,
    added_date TEXT,
    status TEXT DEFAULT 'pending',
    member_count INTEGER DEFAULT 0
  );
`);

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

// Função para sincronizar dados entre SQLite e JSON
async function syncData() {
  try {
    // Sync users
    const users = db.prepare('SELECT * FROM users').all();
    await writeJsonFile(USERS_FILE, users);

    // Sync operations
    const operations = db.prepare('SELECT * FROM operations').all();
    const operationsObj = operations.reduce((acc, op) => {
      acc[op.name] = {
        active: Boolean(op.active),
        lastUpdated: op.last_updated
      };
      return acc;
    }, {});
    await writeJsonFile(OPERATIONS_FILE, operationsObj);

    // Sync giftcards
    const giftcards = db.prepare('SELECT * FROM giftcards').all();
    await writeJsonFile(GIFTCARDS_FILE, giftcards);

    // Sync channels
    const channels = db.prepare('SELECT * FROM channels').all();
    await writeJsonFile(CHANNELS_FILE, { channels });
  } catch (error) {
    console.error('Error syncing data:', error);
  }
}

export async function initDatabase() {
  try {
    // Initialize operations in SQLite if they don't exist
    const stmt = db.prepare('INSERT OR IGNORE INTO operations (name, active, last_updated) VALUES (?, ?, ?)');
    const now = new Date().toISOString();
    stmt.run('mines', 0, now);
    stmt.run('aviator', 0, now);

    // Carregar dados dos arquivos JSON para o SQLite se necessário
    const usersJson = await readJsonFile(USERS_FILE);
    if (usersJson) {
      const insertUser = db.prepare('INSERT OR REPLACE INTO users (id, username, credits, invited_by, join_date, redeemed_giftcards, invites) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const user of usersJson) {
        insertUser.run(
          user.id,
          user.username,
          user.credits,
          user.invited_by,
          user.join_date,
          JSON.stringify(user.redeemed_giftcards),
          JSON.stringify(user.invites)
        );
      }
    }

    // Sync all data
    await syncData();
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

export async function getUser(userId) {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (user) {
      user.redeemed_giftcards = JSON.parse(user.redeemed_giftcards);
      user.invites = JSON.parse(user.invites);
      return user;
    }
    return null;
  } catch (error) {
    console.error('Error getting user:', error);
    // Fallback to JSON
    const users = await readJsonFile(USERS_FILE) || [];
    return users.find(u => u.id === userId);
  }
}

export async function addUser(userId, username, invitedBy = null) {
  try {
    const initialCredits = 20; // 20 créditos para todos os novos usuários
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO users (id, username, credits, invited_by, join_date, redeemed_giftcards, invites)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      userId,
      username,
      initialCredits,
      invitedBy,
      new Date().toISOString(),
      '[]',
      '[]'
    );

    await syncData();
  } catch (error) {
    console.error('Error adding user:', error);
  }
}

export async function addInvite(inviterId, invitedId) {
  try {
    const user = await getUser(inviterId);
    if (user) {
      const invites = JSON.parse(user.invites || '[]');
      invites.push({
        invited_id: invitedId,
        date: new Date().toISOString()
      });

      const stmt = db.prepare(`
        UPDATE users 
        SET credits = credits + 4, invites = ?
        WHERE id = ?
      `);
      
      stmt.run(JSON.stringify(invites), inviterId);
      await syncData();
    }
  } catch (error) {
    console.error('Error adding invite:', error);
  }
}

export async function getCredits(userId) {
  try {
    const user = await getUser(userId);
    return user ? user.credits : 0;
  } catch (error) {
    console.error('Error getting credits:', error);
    return 0;
  }
}

export async function getAllUsers() {
  try {
    return db.prepare('SELECT * FROM users').all();
  } catch (error) {
    console.error('Error getting all users:', error);
    return await readJsonFile(USERS_FILE) || [];
  }
}

export async function decrementCredits(userId) {
  try {
    db.prepare('UPDATE users SET credits = credits - 1 WHERE id = ? AND credits > 0').run(userId);
    await syncData();
  } catch (error) {
    console.error('Error decrementing credits:', error);
  }
}

export async function getOperationStatus(operation) {
  try {
    const result = db.prepare('SELECT active FROM operations WHERE name = ?').get(operation);
    return result ? Boolean(result.active) : false;
  } catch (error) {
    console.error('Error getting operation status:', error);
    const operations = await readJsonFile(OPERATIONS_FILE) || {};
    return operations[operation]?.active || false;
  }
}

export async function setOperationStatus(operation, status) {
  try {
    db.prepare('UPDATE operations SET active = ?, last_updated = ? WHERE name = ?')
      .run(status ? 1 : 0, new Date().toISOString(), operation);
    await syncData();
  } catch (error) {
    console.error('Error setting operation status:', error);
  }
}

export async function getAllOperations() {
  try {
    const operations = db.prepare('SELECT * FROM operations').all();
    return operations.map(op => ({
      name: op.name,
      active: Boolean(op.active)
    }));
  } catch (error) {
    console.error('Error getting all operations:', error);
    const operations = await readJsonFile(OPERATIONS_FILE) || {};
    return Object.entries(operations).map(([name, data]) => ({
      name,
      active: data.active
    }));
  }
}

export async function createGiftCard(credits) {
  try {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const stmt = db.prepare(`
      INSERT INTO giftcards (code, credits, created_at, created_by, redeemed_by)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      code,
      credits,
      new Date().toISOString(),
      'admin',
      '[]'
    );
    
    await syncData();
    return code;
  } catch (error) {
    console.error('Error creating gift card:', error);
    return null;
  }
}

export async function getGiftCard(code) {
  try {
    const giftcard = db.prepare('SELECT * FROM giftcards WHERE code = ?').get(code);
    if (giftcard) {
      giftcard.redeemed_by = JSON.parse(giftcard.redeemed_by);
      return giftcard;
    }
    return null;
  } catch (error) {
    console.error('Error getting gift card:', error);
    const giftcards = await readJsonFile(GIFTCARDS_FILE) || [];
    return giftcards.find(g => g.code === code);
  }
}

export async function redeemGiftCard(code, userId) {
  try {
    const giftcard = await getGiftCard(code);
    if (!giftcard) {
      throw new Error('Código inválido');
    }

    if (giftcard.redeemed_by.includes(userId)) {
      throw new Error('Você já resgatou este gift card');
    }

    const redeemedBy = [...giftcard.redeemed_by, userId];

    db.prepare(`
      UPDATE giftcards 
      SET redeemed_by = ?
      WHERE code = ?
    `).run(JSON.stringify(redeemedBy), code);

    db.prepare(`
      UPDATE users 
      SET credits = credits + ?,
          redeemed_giftcards = json_array_append(redeemed_giftcards, ?)
      WHERE id = ?
    `).run(giftcard.credits, code, userId);

    await syncData();
    return giftcard.credits;
  } catch (error) {
    console.error('Error redeeming gift card:', error);
    throw error;
  }
}

export async function getUserGiftCards(userId) {
  try {
    const giftcards = db.prepare(`
      SELECT * FROM giftcards 
      WHERE json_array_contains(redeemed_by, ?)
    `).all(userId);
    return giftcards.map(g => ({...g, redeemed_by: JSON.parse(g.redeemed_by)}));
  } catch (error) {
    console.error('Error getting user gift cards:', error);
    const giftcards = await readJsonFile(GIFTCARDS_FILE) || [];
    return giftcards.filter(g => g.redeemed_by.includes(userId));
  }
}

export async function getUserInvites(userId) {
  try {
    const user = await getUser(userId);
    return user ? JSON.parse(user.invites) : [];
  } catch (error) {
    console.error('Error getting user invites:', error);
    return [];
  }
}

export async function addChannel(channelId, channelTitle, ownerId) {
  try {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO channels (id, title, owner_id, added_date, status, member_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      channelId,
      channelTitle,
      ownerId,
      new Date().toISOString(),
      'pending',
      0
    );
    
    await syncData();
  } catch (error) {
    console.error('Error adding channel:', error);
  }
}

export async function updateChannelStatus(channelId, status, memberCount = null) {
  try {
    const stmt = db.prepare(`
      UPDATE channels 
      SET status = ?
      ${memberCount !== null ? ', member_count = ?' : ''}
      WHERE id = ?
    `);
    
    if (memberCount !== null) {
      stmt.run(status, memberCount, channelId);
    } else {
      stmt.run(status, channelId);
    }
    
    await syncData();
  } catch (error) {
    console.error('Error updating channel status:', error);
  }
}

export async function getChannel(channelId) {
  try {
    return db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
  } catch (error) {
    console.error('Error getting channel:', error);
    const channelsData = await readJsonFile(CHANNELS_FILE) || { channels: [] };
    return channelsData.channels.find(channel => channel.id === channelId);
  }
}

export async function getAllActiveChannels() {
  try {
    return db.prepare("SELECT * FROM channels WHERE status = 'active'").all();
  } catch (error) {
    console.error('Error getting active channels:', error);
    const channelsData = await readJsonFile(CHANNELS_FILE) || { channels: [] };
    return channelsData.channels.filter(channel => channel.status === 'active');
  }
}

export async function getChannelsByOwner(ownerId) {
  try {
    return db.prepare('SELECT * FROM channels WHERE owner_id = ?').all(ownerId);
  } catch (error) {
    console.error('Error getting channels by owner:', error);
    const channelsData = await readJsonFile(CHANNELS_FILE) || { channels: [] };
    return channelsData.channels.filter(channel => channel.owner_id === ownerId);
  }
}
