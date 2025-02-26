import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, update, push, child } from 'firebase/database';
import crypto from 'crypto';

const firebaseConfig = {
  apiKey: "AIzaSyA4UEd-3Le5kLwcrVCS4qMPaCH0cIwFEnc",
  authDomain: "telebot-e1836.firebaseapp.com",
  projectId: "telebot-e1836",
  storageBucket: "telebot-e1836.firebasestorage.app",
  messagingSenderId: "506603344452",
  appId: "1:506603344452:web:d821f04134c222b4a02211",
  databaseURL: "https://telebot-e1836-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export async function initDatabase() {
  try {
    const dbRef = ref(database);
    const snapshot = await get(dbRef);
    
    if (!snapshot.exists()) {
      await set(ref(database, 'users'), []);
      await set(ref(database, 'operations'), {
        mines: { active: false, lastUpdated: new Date().toISOString() },
        aviator: { active: false, lastUpdated: new Date().toISOString() }
      });
      await set(ref(database, 'giftcards'), []);
      await set(ref(database, 'channels'), []);
    }
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

export async function getUser(userId) {
  try {
    const usersRef = ref(database, 'users');
    const snapshot = await get(usersRef);
    const users = snapshot.val() || [];
    return users.find(user => user.id === userId);
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
}

export async function addUser(userId, username, invitedBy = null) {
  try {
    const usersRef = ref(database, 'users');
    const snapshot = await get(usersRef);
    const users = snapshot.val() || [];
    
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
      await set(usersRef, users);
    }
  } catch (error) {
    console.error('Error adding user:', error);
  }
}

export async function addInvite(inviterId, invitedId) {
  try {
    const usersRef = ref(database, 'users');
    const snapshot = await get(usersRef);
    const users = snapshot.val() || [];
    const inviter = users.find(user => user.id === inviterId);
    
    if (inviter) {
      inviter.credits = (inviter.credits || 0) + 1;
      inviter.invites = inviter.invites || [];
      inviter.invites.push({
        invited_id: invitedId,
        date: new Date().toISOString()
      });
      await set(usersRef, users);
    }
  } catch (error) {
    console.error('Error adding invite:', error);
  }
}

export async function getCredits(userId) {
  const user = await getUser(userId);
  return user ? user.credits : 0;
}

export async function getAllUsers() {
  try {
    const usersRef = ref(database, 'users');
    const snapshot = await get(usersRef);
    return snapshot.val() || [];
  } catch (error) {
    console.error('Error getting all users:', error);
    return [];
  }
}

export async function decrementCredits(userId) {
  try {
    const usersRef = ref(database, 'users');
    const snapshot = await get(usersRef);
    const users = snapshot.val() || [];
    const user = users.find(user => user.id === userId);
    
    if (user && user.credits > 0) {
      user.credits--;
      await set(usersRef, users);
    }
  } catch (error) {
    console.error('Error decrementing credits:', error);
  }
}

export async function getOperationStatus(operation) {
  try {
    const operationsRef = ref(database, `operations/${operation}`);
    const snapshot = await get(operationsRef);
    return snapshot.val()?.active || false;
  } catch (error) {
    console.error('Error getting operation status:', error);
    return false;
  }
}

export async function setOperationStatus(operation, status) {
  try {
    const operationRef = ref(database, `operations/${operation}`);
    await set(operationRef, {
      active: status,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error setting operation status:', error);
  }
}

export async function getAllOperations() {
  try {
    const operationsRef = ref(database, 'operations');
    const snapshot = await get(operationsRef);
    const operations = snapshot.val() || {};
    return Object.entries(operations).map(([name, data]) => ({
      name,
      active: data.active
    }));
  } catch (error) {
    console.error('Error getting all operations:', error);
    return [];
  }
}

export async function createGiftCard(credits) {
  try {
    const giftcardsRef = ref(database, 'giftcards');
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    
    const giftcard = {
      code,
      credits,
      created_at: new Date().toISOString(),
      created_by: 'admin',
      redeemed_by: []
    };
    
    const snapshot = await get(giftcardsRef);
    const giftcards = snapshot.val() || [];
    giftcards.push(giftcard);
    await set(giftcardsRef, giftcards);
    
    return code;
  } catch (error) {
    console.error('Error creating gift card:', error);
    return null;
  }
}

export async function getGiftCard(code) {
  try {
    const giftcardsRef = ref(database, 'giftcards');
    const snapshot = await get(giftcardsRef);
    const giftcards = snapshot.val() || [];
    return giftcards.find(g => g.code === code);
  } catch (error) {
    console.error('Error getting gift card:', error);
    return null;
  }
}

export async function redeemGiftCard(code, userId) {
  try {
    const giftcardsRef = ref(database, 'giftcards');
    const usersRef = ref(database, 'users');
    
    const [giftcardsSnapshot, usersSnapshot] = await Promise.all([
      get(giftcardsRef),
      get(usersRef)
    ]);
    
    const giftcards = giftcardsSnapshot.val() || [];
    const users = usersSnapshot.val() || [];
    
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
    
    giftcard.redeemed_by.push(userId);
    user.credits += giftcard.credits;
    user.redeemed_giftcards = user.redeemed_giftcards || [];
    user.redeemed_giftcards.push(code);
    
    await Promise.all([
      set(giftcardsRef, giftcards),
      set(usersRef, users)
    ]);
    
    return giftcard.credits;
  } catch (error) {
    console.error('Error redeeming gift card:', error);
    throw error;
  }
}

export async function getUserGiftCards(userId) {
  try {
    const giftcardsRef = ref(database, 'giftcards');
    const snapshot = await get(giftcardsRef);
    const giftcards = snapshot.val() || [];
    return giftcards.filter(g => g.redeemed_by.includes(userId));
  } catch (error) {
    console.error('Error getting user gift cards:', error);
    return [];
  }
}

export async function getUserInvites(userId) {
  const user = await getUser(userId);
  return user ? user.invites || [] : [];
}

export async function addChannel(channelId, channelTitle, ownerId) {
  try {
    const channelsRef = ref(database, 'channels');
    const snapshot = await get(channelsRef);
    const channels = snapshot.val() || [];
    
    if (!channels.some(channel => channel.id === channelId)) {
      channels.push({
        id: channelId,
        title: channelTitle,
        owner_id: ownerId,
        added_date: new Date().toISOString(),
        status: 'pending',
        member_count: 0
      });
      await set(channelsRef, channels);
    }
  } catch (error) {
    console.error('Error adding channel:', error);
  }
}

export async function updateChannelStatus(channelId, status, memberCount = null) {
  try {
    const channelsRef = ref(database, 'channels');
    const snapshot = await get(channelsRef);
    const channels = snapshot.val() || [];
    const channel = channels.find(c => c.id === channelId);
    
    if (channel) {
      channel.status = status;
      if (memberCount !== null) {
        channel.member_count = memberCount;
      }
      await set(channelsRef, channels);
    }
  } catch (error) {
    console.error('Error updating channel status:', error);
  }
}

export async function getChannel(channelId) {
  try {
    const channelsRef = ref(database, 'channels');
    const snapshot = await get(channelsRef);
    const channels = snapshot.val() || [];
    return channels.find(channel => channel.id === channelId);
  } catch (error) {
    console.error('Error getting channel:', error);
    return null;
  }
}

export async function getAllActiveChannels() {
  try {
    const channelsRef = ref(database, 'channels');
    const snapshot = await get(channelsRef);
    const channels = snapshot.val() || [];
    return channels.filter(channel => channel.status === 'active');
  } catch (error) {
    console.error('Error getting active channels:', error);
    return [];
  }
}

export async function getChannelsByOwner(ownerId) {
  try {
    const channelsRef = ref(database, 'channels');
    const snapshot = await get(channelsRef);
    const channels = snapshot.val() || [];
    return channels.filter(channel => channel.owner_id === ownerId);
  } catch (error) {
    console.error('Error getting channels by owner:', error);
    return [];
  }

}
=======
}
>>>>>>> 3816c6d (segundo commjit)
