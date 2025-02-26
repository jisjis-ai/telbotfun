import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, update, push, child } from 'firebase/database';
import crypto from 'crypto';
import moment from 'moment-timezone';

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
      await set(ref(database, 'pendingRegistrations'), {});
      await set(ref(database, 'deposits'), {});
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

export async function startRegistration(userId, username) {
  try {
    const pendingRef = ref(database, `pendingRegistrations/${userId}`);
    await set(pendingRef, {
      username: username,
      status: 'awaiting_proof',
      timestamp: new Date().toISOString()
    });
    return true;
  } catch (error) {
    console.error('Error starting registration:', error);
    return false;
  }
}

export async function submitRegistrationProof(userId, proofMessageId) {
  try {
    const pendingRef = ref(database, `pendingRegistrations/${userId}`);
    await update(pendingRef, {
      proofMessageId: proofMessageId,
      status: 'awaiting_review'
    });
    return true;
  } catch (error) {
    console.error('Error submitting proof:', error);
    return false;
  }
}

export async function approveRegistration(userId, invitedBy = null) {
  try {
    const pendingRef = ref(database, `pendingRegistrations/${userId}`);
    const pendingSnapshot = await get(pendingRef);
    const pendingData = pendingSnapshot.val();
    
    if (!pendingData) {
      throw new Error('Registro pendente não encontrado');
    }
    
    const usersRef = ref(database, 'users');
    const snapshot = await get(usersRef);
    const users = snapshot.val() || [];
    
    // Adicionar novo usuário com créditos iniciais
    const newUser = {
      id: userId,
      username: pendingData.username,
      credits: 20, // Créditos iniciais
      invited_by: invitedBy,
      join_date: new Date().toISOString(),
      redeemed_giftcards: [],
      invites: [],
      status: 'active',
      registration_proof: pendingData.proofMessageId
    };
    
    users.push(newUser);
    await set(usersRef, users);
    
    // Se foi convidado por alguém, adicionar créditos ao convidante
    if (invitedBy) {
      const inviter = users.find(user => user.id === invitedBy);
      if (inviter) {
        inviter.credits += 4; // Bônus para quem convidou
        inviter.invites = inviter.invites || [];
        inviter.invites.push({
          invited_id: userId,
          date: new Date().toISOString()
        });
        await set(usersRef, users);
      }
    }
    
    // Limpar registro pendente
    await set(pendingRef, null);
    
    return {
      success: true,
      user: newUser
    };
  } catch (error) {
    console.error('Error approving registration:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function rejectRegistration(userId, reason) {
  try {
    const pendingRef = ref(database, `pendingRegistrations/${userId}`);
    await set(pendingRef, null);
    return true;
  } catch (error) {
    console.error('Error rejecting registration:', error);
    return false;
  }
}

export async function startDeposit(userId, amount) {
  try {
    const depositRef = ref(database, `deposits/${userId}`);
    await set(depositRef, {
      amount: amount,
      status: 'awaiting_proof',
      timestamp: new Date().toISOString()
    });
    return true;
  } catch (error) {
    console.error('Error starting deposit:', error);
    return false;
  }
}

export async function submitDepositProof(userId, proofMessageId) {
  try {
    const depositRef = ref(database, `deposits/${userId}`);
    await update(depositRef, {
      proofMessageId: proofMessageId,
      status: 'awaiting_review'
    });
    return true;
  } catch (error) {
    console.error('Error submitting deposit proof:', error);
    return false;
  }
}

export async function approveDeposit(userId) {
  try {
    const depositRef = ref(database, `deposits/${userId}`);
    const depositSnapshot = await get(depositRef);
    const depositData = depositSnapshot.val();
    
    if (!depositData) {
      throw new Error('Depósito não encontrado');
    }
    
    const usersRef = ref(database, 'users');
    const snapshot = await get(usersRef);
    const users = snapshot.val() || [];
    const user = users.find(u => u.id === userId);
    
    if (user) {
      user.credits += depositData.amount;
      await set(usersRef, users);
    }
    
    // Limpar depósito pendente
    await set(depositRef, null);
    
    return {
      success: true,
      amount: depositData.amount
    };
  } catch (error) {
    console.error('Error approving deposit:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function rejectDeposit(userId, reason) {
  try {
    const depositRef = ref(database, `deposits/${userId}`);
    await set(depositRef, null);
    return true;
  } catch (error) {
    console.error('Error rejecting deposit:', error);
    return false;
  }
}

export async function addInvite(inviterId, invitedId) {
  try {
    const usersRef = ref(database, 'users');
    const snapshot = await get(usersRef);
    const users = snapshot.val() || [];
    const inviter = users.find(user => user.id === inviterId);
    
    if (inviter) {
      inviter.credits = (inviter.credits || 0) + 4; // Bônus por convite
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

export async function getAllChannels() {
  try {
    const channelsRef = ref(database, 'channels');
    const snapshot = await get(channelsRef);
    return snapshot.val() || [];
  } catch (error) {
    console.error('Error getting all channels:', error);
    return [];
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

// Funções do imageGenerator.js mantidas aqui para compatibilidade
export async function generateMinesImage(prediction) {
  // ... (código existente mantido)
}

export function generatePrediction() {
  // ... (código existente mantido)
}

export function generateAviatorMultiplier() {
  // ... (código existente mantido)
}

export function calculateFutureTime() {
  // ... (código existente mantido)
}

export async function generateAviatorImage(multiplier) {
  // ... (código existente mantido)
}

export async function sendGiftCardImage(code, credits) {
  // ... (código existente mantido)
}

export function isWithinOperatingHours(game) {
  // ... (código existente mantido)
}

export function shouldSendPreparationNotice(game) {
  // ... (código existente mantido)
}

export function shouldSendSignal() {
  return true;
}

export function shouldSendSuccess() {
  return true;
}
