import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { 
  initDatabase, 
  addUser, 
  getUser,
  addInvite,
  getCredits,
  getAllUsers,
  decrementCredits,
  getOperationStatus,
  setOperationStatus,
  getAllOperations,
  createGiftCard,
  redeemGiftCard,
  getUserGiftCards,
  getUserInvites,
  getGiftCard,
  addChannel,
  updateChannelStatus,
  getChannel,
  getAllActiveChannels,
  getChannelsByOwner
} from './database.js';
import { 
  generatePrediction, 
  generateAviatorMultiplier,
  generateAviatorImage,
  isWithinOperatingHours,
  shouldSendPreparationNotice,
  calculateFutureTime,
  sendGiftCardImage,
  shouldSendSignal,
  shouldSendSuccess,
  generateMinesImage
} from './imageGenerator.js';
import moment from 'moment-timezone';

dotenv.config();

let bot = null;
let isShuttingDown = false;
let pollingRetries = 0;
const MAX_RETRIES = 5;
const RETRY_DELAY = 2000;
const RECONNECT_DELAY = 5000;
const userStates = new Map();
const userCooldowns = new Map();
let botInfo = null;

// Automatic signal intervals
let currentGameInterval = null;
let preparationInterval = null;
let aviatorTimeout = null;
let minesTimeout = null;
let isProcessingMines = false;

// Mensagens estilizadas em HTML
const MESSAGES = {
  WELCOME: (inviteLink) => `
<b>🌟 Bem-vindo ao Melhor Bot de Sinais! 🌟</b>

Para começar a usar o bot, você precisa:

1️⃣ <b>Criar uma conta</b> na plataforma
2️⃣ Fazer seu primeiro depósito para receber <b>BÔNUS DE 300%</b> 🎁

💰 <b>Exemplos de Bônus:</b>
• Depósito de 200MT ➡️ Recebe 600MT
• Depósito de 500MT ➡️ Recebe 1.500MT
• Depósito de 1.000MT ➡️ Recebe 3.000MT

⚠️ <b>IMPORTANTE:</b> 
Sua conta DEVE ser criada através do bot para resultados precisos!

🎯 <b>Compartilhe e Ganhe:</b>
• Seu link: ${inviteLink}
• Cada novo usuário = 4 créditos
`,

  MINES_SIGNAL: (prediction) => `
<b>🎮 SINAL MINES EXCLUSIVO! 🎮</b>

⏰ <b>Horário:</b> ${moment().format('HH:mm:ss')}
⌛️ <b>Válido até:</b> ${prediction.validUntil}

💣 <b>Configurações:</b>
• Número de Minas: ${prediction.mines}
• Tentativas: ${prediction.attempts}

✅ <b>Instruções:</b>
1. Selecione ${prediction.mines} minas
2. Faça até ${prediction.attempts} tentativas
3. Saia após qualquer vitória

⚡️ <b>Faça sua entrada agora!</b>
`,

  AVIATOR_SIGNAL: (multiplier, timeStr) => `
<b>✈️ 🎯 NOVA OPORTUNIDADE AVIATOR EXCLUSIVA! ✈️</b>

⏰ <b>Entrada:</b> ${timeStr}
📈 <b>Multiplicador:</b> ${multiplier}x

🎯 <b>Instruções:</b>
1.⚠️⚠️ Saia antes do crash!
2✅✅ Faça sua entrada agora!
3. Entre com valor alto
4. Retire em ${multiplier}x
⚡️ <b>Entrada Confirmada!</b>
`,

  MINES_SUCCESS: () => `
<b>✅ RESULTADO MINES ✅</b>

🎯 Operação bem sucedida!
💰 Resultado: Green
🛡️ Proteção: Sucesso
💎 Lucro garantido!
`,

  AVIATOR_SUCCESS: () => `
<b>✅ RESULTADO AVIATOR ✅</b>

🎯 Operação bem sucedida!
💰 Resultado: Green
🛡️ Proteção: Sucesso
💎 Lucro garantido!
`,

  GIFT_CARD_CREATED: (code, credits) => `
<b>🎁 GIFT CARD CRIADO COM SUCESSO! 🎁</b>

🔑 <b>Código:</b> <code>${code}</code>
💎 <b>Créditos:</b> ${credits}

📢 Compartilhe a imagem acima com o código!
`,

  GIFT_CARD_REDEEMED: (code, credits, newBalance) => `
<b>✨ PARABÉNS! GIFT CARD RESGATADO! ✨</b>

🎁 <b>Detalhes do Resgate:</b>
• Código: <code>${code}</code>
• Créditos: ${credits}

💰 <b>Novo Saldo:</b> ${newBalance} créditos

🎮 <b>Aproveite seus créditos para gerar sinais!</b>
`,

  BALANCE: (credits) => `
<b>💰 SEU SALDO ATUAL 💰</b>

${credits} créditos disponíveis

📊 <b>Use seus créditos para:</b>
• Gerar sinais do Mines
• Prever multiplicadores do Aviator
`,

  PREPARATION_NOTICE: (game) => `
<b>🚨 ATENÇÃO! ${game.toUpperCase()} COMEÇA EM 1 HORA! 🚨</b>

⏰ <b>Início das operações:</b> ${game === 'mines' ? '00:00' : '12:00'}

⚠️ <b>Prepare-se:</b>
1. Crie sua conta se ainda não tem
2. Faça seu depósito para aproveitar os sinais
3. Fique atento aos sinais!

✅ <b>Não perca tempo, prepare-se agora!</b>
`,

  ADMIN_MENU: `
<b>🔧 Menu de Administrador</b>

Escolha uma opção:
• 👥 Ver Usuários
• ⚙️ Controle de Operações
• 🎁 Criar Gift Card
• 📢 Enviar Mensagem para Todos
• 📣 Enviar Mensagem para Canal
`,

  MAIN_MENU: `
<b>✈️ Menu Principal</b>

Escolha uma opção:
• 💰 Ver Saldo
• 👥 Meus Convites
• 🎁 Resgatar Gift Card
• 📋 Histórico de Gift Cards
• ✈️ Prever Aviator
• 💣 Gerar Sinal Mines
`,

  INVITES_LIST: (invites) => {
    let message = '<b>👥 Seus Convites:</b>\n\n';
    if (invites.length === 0) {
      message += 'Você ainda não convidou ninguém.';
    } else {
      invites.forEach((invite, index) => {
        message += `${index + 1}. ID: ${invite.invited_id}\n   Data: ${moment(invite.date).format('DD/MM/YYYY HH:mm')}\n\n`;
      });
    }
    return message;
  },

  GIFT_CARD_HISTORY: (giftcards) => {
    let message = '<b>📋 Histórico de Gift Cards:</b>\n\n';
    if (giftcards.length === 0) {
      message += 'Você ainda não resgatou nenhum gift card.';
    } else {
      giftcards.forEach((card, index) => {
        message += `${index + 1}. Código: <code>${card.code}</code>\n   Créditos: ${card.credits}\n   Data: ${moment(card.redeemed_at).format('DD/MM/YYYY HH:mm')}\n\n`;
      });
    }
    return message;
  },

  USERS_LIST: (users) => {
    let message = '<b>👥 Usuários do Bot:</b>\n\n';
    users.forEach(user => {
      message += `ID: ${user.id}\nUsername: @${user.username || 'Sem username'}\nCréditos: ${user.credits}\n\n`;
    });
    return message;
  },

  OPERATIONS_STATUS: (operations) => {
    let message = '<b>Status das Operações:</b>\n\n';
    operations.forEach(op => {
      message += `${op.name.toUpperCase()}: ${op.active ? '✅' : '❌'}\n`;
    });
    return message;
  },

  ONBOARDING: {
    ACCOUNT_CREATION: `
<b>📝 CRIAR CONTA</b>

Para começar a usar o bot, você precisa criar uma conta na plataforma.

1️⃣ Clique no botão abaixo para criar sua conta
2️⃣ Após criar a conta, envie uma foto da tela de confirmação
3️⃣ Vamos te guiar para os próximos passos!
`,

    DEPOSIT_INFO: `
<b>💰 FAÇA SEU PRIMEIRO DEPÓSITO</b>

Aproveite nosso bônus exclusivo de 300%!

💎 <b>Exemplos de Bônus:</b>
• Depósito de 200MT ➡️ Recebe 600MT
• Depósito de 500MT ➡️ Recebe 1.500MT
• Depósito de 1.000MT ➡️ Recebe 3.000MT

📸 Envie uma foto do comprovante do depósito
`,

    SHARE_BOT: (inviteLink) => `
<b>🎯 ÚLTIMO PASSO!</b>

Para começar a usar o bot, compartilhe com seus amigos:

1️⃣ Compartilhe seu link de convite com 5 pessoas
2️⃣ Ganhe 4 créditos por cada novo usuário e seu convidado 20 pra teste.
3️⃣ Use os créditos para gerar sinais!

🔗 <b>Seu link:</b> ${inviteLink}

⚡️ Compartilhe agora e comece a ganhar!
`
  },

  WANT_OWN_BOT: `
<b>🤖 Quer Seu Próprio Bot de Sinais?</b>

Para ter seu próprio bot, siga os passos:

1️⃣ Crie um canal ou grupo no Telegram
2️⃣ Adicione pelo menos 20 membros ativos
3️⃣ Me promova a administrador com todas as permissões
4️⃣ Envie o link do seu canal/grupo

⚠️ <b>Requisitos Importantes:</b>
• Mínimo de 20 membros ativos
• Bot deve ser administrador
• Todas as permissões necessárias

📜 <b>Política de Privacidade:</b>
• Seus dados estão seguros
• Não compartilhamos informações
• Uso exclusivo para sinais
`,

  PRIVACY_POLICY: `
<b>📜 Política de Privacidade</b>

1. <b>Coleta de Dados</b>
• ID do Telegram
• Nome de usuário
• Dados de uso do bot

2. <b>Uso dos Dados</b>
• Envio de sinais
• Gerenciamento de créditos
• Estatísticas anônimas

3. <b>Segurança</b>
• Dados criptografados
• Acesso restrito
• Sem compartilhamento

4. <b>Seus Direitos</b>
• Acesso aos dados
• Correção de informações
• Exclusão de conta

5. <b>Contato</b>
• Suporte via bot
• Resposta em 24h
`,

  CHANNEL_REGISTRATION: `
<b>📝 Registro de Canal/Grupo</b>

Por favor, envie o link do seu canal ou grupo.

⚠️ <b>Lembre-se dos requisitos:</b>
• Mínimo 20 membros
• Bot como admin
• Todas as permissões
`,

  CHANNEL_VERIFICATION: (memberCount) => `
<b>🔍 Verificação do Canal</b>

Membros atuais: ${memberCount}
Mínimo necessário: 20

${memberCount >= 20 ? '✅ Número de membros adequado!' : '❌ Precisa de mais membros!'}
${memberCount >= 20 ? '\n🎉 Seu canal será ativado em breve!' : '\n⚠️ Adicione mais membros e tente novamente.'}
`,

  CHANNEL_SUCCESS: `
<b>✅ Canal Registrado com Sucesso!</b>

Seu canal agora receberá:
• Sinais do Mines
• Previsões do Aviator
• Atualizações automáticas

🎮 Os sinais começarão em breve!
`,

  CHANNEL_ERROR: `
<b>❌ Erro no Registro</b>

Verifique:
• Se o bot é administrador
• Se todas as permissões foram dadas
• Se o link está correto

Tente novamente quando resolver.
`
};

async function checkTelegramAPI() {
  try {
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`);
    return response.status === 200;
  } catch (error) {
    console.error('Error checking Telegram API:', error.message);
    return false;
  }
}

async function reconnectBot() {
  console.log('Attempting to reconnect...');
  
  if (await checkTelegramAPI()) {
    try {
      await stopBot();
      await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY));
      await initBot();
      console.log('Successfully reconnected!');
      return true;
    } catch (error) {
      console.error('Error during reconnection:', error.message);
    }
  }
  
  return false;
}

async function sendMessageToAllChannels(message, options = {}) {
  try {
    // Enviar para o canal principal
    await bot.sendMessage(process.env.CHANNEL_ID, message, options);

    // Enviar para todos os canais ativos
    const activeChannels = await getAllActiveChannels();
    for (const channel of activeChannels) {
      try {
        await bot.sendMessage(channel.id, message, options);
      } catch (error) {
        console.error(`Error sending message to channel ${channel.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in sendMessageToAllChannels:', error);
  }
}

async function sendPhotoToAllChannels(photo, options = {}) {
  try {
    // Enviar para o canal principal
    await bot.sendPhoto(process.env.CHANNEL_ID, photo, options);

    // Enviar para todos os canais ativos
    const activeChannels = await getAllActiveChannels();
    for (const channel of activeChannels) {
      try {
        await bot.sendPhoto(channel.id, photo, options);
      } catch (error) {
        console.error(`Error sending photo to channel ${channel.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in sendPhotoToAllChannels:', error);
  }
}

async function sendDocumentToAllChannels(document, options = {}) {
  try {
    // Enviar para o canal principal
    const mainMessage = await bot.sendDocument(process.env.CHANNEL_ID, document, options);

    // Enviar para todos os canais ativos
    const activeChannels = await getAllActiveChannels();
    for (const channel of activeChannels) {
      try {
        await bot.sendDocument(channel.id, document, options);
      } catch (error) {
        console.error(`Error sending document to channel ${channel.id}:`, error);
      }
    }
    return mainMessage;
  } catch (error) {
    console.error('Error in sendDocumentToAllChannels:', error);
    return null;
  }
}

async function editMessageMediaForAllChannels(media, options) {
  try {
    // Editar no canal principal
    await bot.editMessageMedia(media, options);

    // Editar em todos os canais ativos
    const activeChannels = await getAllActiveChannels();
    for (const channel of activeChannels) {
      try {
        const channelOptions = {
          ...options,
          chat_id: channel.id
        };
        await bot.editMessageMedia(media, channelOptions);
      } catch (error) {
        console.error(`Error editing message in channel ${channel.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in editMessageMediaForAllChannels:', error);
  }
}

async function sendPreparationNotice(channelId, game) {
  const keyboard = {
    inline_keyboard: [
      [
        { text: '💰 Fazer Depósito', url: 'https://receber.netlify.app/deposit' }
      ],
      [
        { text: '📝 Criar Conta', url: 'https://receber.netlify.app/register' }
      ]
    ]
  };

  await sendMessageToAllChannels(
    MESSAGES.PREPARATION_NOTICE(game),
    { 
      reply_markup: keyboard,
      parse_mode: 'HTML'
    }
  );
}

async function checkAndSendPreparationNotices() {
  if (shouldSendPreparationNotice('mines')) {
    await sendPreparationNotice(process.env.CHANNEL_ID, 'mines');
    await setOperationStatus('mines', false);
  }
  
  if (shouldSendPreparationNotice('aviator')) {
    await sendPreparationNotice(process.env.CHANNEL_ID, 'aviator');
    await setOperationStatus('aviator', false);
  }
}

async function sendMinesSignal(channelId) {
  if (!isWithinOperatingHours('mines') || isProcessingMines) return;
  
  try {
    isProcessingMines = true;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🎮 APOSTAR AGORA', url: 'https://receber.netlify.app/register' }
        ]
      ]
    };

    const prediction = generatePrediction();
    const imageBuffer = await generateMinesImage(prediction);

    // Enviar sinal para todos os canais
    await sendPhotoToAllChannels(imageBuffer, {
      caption: MESSAGES.MINES_SIGNAL(prediction),
      parse_mode: 'HTML',
      reply_markup: keyboard
    });

    // Aguardar 1 minuto (validade do sinal) + 30 segundos
    await new Promise(resolve => setTimeout(resolve, 90000)); // 60s + 30s

    // Enviar mensagem de green para todos
    await sendMessageToAllChannels(
      MESSAGES.MINES_SUCCESS(),
      { parse_mode: 'HTML' }
    );

    // Enviar GIF de análise para todos
    const gifMessage = await sendDocumentToAllChannels('gpt.gif', {
      caption: '🤖 Escaneando Oportunidade com inteligência artificial. Aguarde...',
      parse_mode: 'HTML'
    });

    // Aguardar tempo aleatório entre 1 e 30 segundos
    const randomDelay = Math.floor(Math.random() * 29000) + 1000;
    await new Promise(resolve => setTimeout(resolve, randomDelay));

    // Editar mensagem trocando o GIF pela imagem de alerta em todos os canais
    await editMessageMediaForAllChannels({
      type: 'photo',
      media: 'alert.png',
      caption: '🎯 Sinal Entrado!'
    }, {
      chat_id: channelId,
      message_id: gifMessage.message_id
    });

    // Aguardar 1 minuto antes do próximo sinal
    await new Promise(resolve => setTimeout(resolve, 60000));
    
    isProcessingMines = false;

    // Agendar o próximo sinal
    if (minesTimeout) {
      clearTimeout(minesTimeout);
    }
    minesTimeout = setTimeout(() => sendMinesSignal(channelId), 1000);

  } catch (error) {
    console.error('Error in sendMinesSignal:', error);
    isProcessingMines = false;
    
    // Em caso de erro, tentar novamente após 30 segundos
    if (minesTimeout) {
      clearTimeout(minesTimeout);
    }
    minesTimeout = setTimeout(() => sendMinesSignal(channelId), 30000);
  }
}

async function sendAviatorSignal(channelId) {
  if (!isWithinOperatingHours('aviator')) return;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '🎮 APOSTAR AGORA', url: 'https://receber.netlify.app/register' }
      ]
    ]
  };

  const multiplier = generateAviatorMultiplier();
  const result = await generateAviatorImage(multiplier);
  
  if (result && result.buffer) {
    // Enviar sinal para todos os canais
    await sendPhotoToAllChannels(result.buffer, {
      caption: MESSAGES.AVIATOR_SIGNAL(multiplier, result.timeStr),
      parse_mode: 'HTML',
      reply_markup: keyboard
    });

    // Calcula o tempo até o momento do sinal
    const now = moment().tz('Africa/Maputo');
    const targetTime = result.targetTime;
    const timeUntilSignal = targetTime.diff(now);

    // Limpa qualquer timeout existente
    if (aviatorTimeout) {
      clearTimeout(aviatorTimeout);
    }

    // Agenda o envio do green para 30 segundos após o horário do sinal
    aviatorTimeout = setTimeout(async () => {
      await sendMessageToAllChannels(
        MESSAGES.AVIATOR_SUCCESS(),
        { parse_mode: 'HTML' }
      );

      // Agenda o próximo sinal para 30 segundos depois
      setTimeout(() => {
        sendAviatorSignal(channelId);
      }, 30 * 1000);
    }, timeUntilSignal + 30000);
  }
}

async function startGameOperations() {
  const now = moment().tz('Africa/Maputo');
  const hour = now.hours();
  const channelId = process.env.CHANNEL_ID;
  
  if (currentGameInterval) {
    clearInterval(currentGameInterval);
    currentGameInterval = null;
  }
  
  if (minesTimeout) {
    clearTimeout(minesTimeout);
    minesTimeout = null;
  }
  
  if (hour >= 0 && hour < 12) {
    await setOperationStatus('mines', true);
    await setOperationStatus('aviator', false);
    isProcessingMines = false;
    minesTimeout = setTimeout(() => sendMinesSignal(channelId), 1000);
  } else if (hour >= 12 && hour < 23) {
    await setOperationStatus('mines', false);
    await setOperationStatus('aviator', true);
    setTimeout(() => {
      sendAviatorSignal(channelId);
    }, 30 * 1000);
  } else {
    await setOperationStatus('mines', false);
    await setOperationStatus('aviator', false);
  }
}

async function sendMainMenu(userId) {
  const keyboard = {
    inline_keyboard: [
      [{ text: '💰 Ver Saldo', callback_data: 'check_balance' }],
      [{ text: '👥 Meus Convites', callback_data: 'my_invites' }],
      [{ text: '🎁 Resgatar Gift Card', callback_data: 'redeem_giftcard' }],
      [{ text: '📋 Histórico de Gift Cards', callback_data: 'giftcard_history' }],
      [{ text: '✈️ Prever Aviator', callback_data: 'generate_aviator' }],
      [{ text: '💣 Gerar Sinal Mines', callback_data: 'generate_mines' }],
      [{ text: '🤖 Quero Meu Próprio Bot', callback_data: 'want_own_bot' }],
      [{ text: '📜 Política de Privacidade', callback_data: 'privacy_policy' }]
    ]
  };
  
  await bot.sendMessage(userId, MESSAGES.MAIN_MENU, { 
    reply_markup: keyboard,
    parse_mode: 'HTML'
  });
}

async function sendAdminMenu(userId) {
  const keyboard = {
    inline_keyboard: [
      [{ text: '👥 Ver Usuários', callback_data: 'admin_users' }],
      [{ text: '⚙️ Controle de Operações', callback_data: 'admin_operations' }],
      [{ text: '🎁 Criar Gift Card', callback_data: 'create_giftcard' }],
      [{ text: '📢 Enviar Mensagem para Todos', callback_data: 'broadcast_users' }],
      [{ text: '📣 Enviar Mensagem para Canal', callback_data: 'broadcast_channel' }]
    ]
  };

  await bot.sendMessage(userId, MESSAGES.ADMIN_MENU, {
    reply_markup: keyboard,
    parse_mode: 'HTML'
  });
}

async function checkMembership(userId) {
  try {
    const chatMember = await bot.getChatMember(process.env.CHANNEL_ID, userId);
    return ['member', 'administrator', 'creator'].includes(chatMember.status);
  } catch (error) {
    return false;
  }
}

async function generateInviteLink(userId) {
  try {
    return `https://t.me/${botInfo.username}?start=${userId}`;
  } catch (error) {
    console.error('Error generating invite link:', error);
    return `https://t.me/${process.env.BOT_USERNAME}?start=${userId}`;
  }
}

async function handleOnboarding(userId, msg) {
  const state = userStates.get(userId);
  
  if (!state || !state.onboarding) {
    userStates.set(userId, { onboarding: 'awaiting_account' });
    
    const keyboard = {
      inline_keyboard: [
        [{ text: '📝 Criar Conta', url: 'https://receber.netlify.app/register' }]
      ]
    };
    
    await bot.sendMessage(userId, MESSAGES.ONBOARDING.ACCOUNT_CREATION, {
      reply_markup: keyboard,
      parse_mode: 'HTML'
    });
    return;
  }
  
  if (state.onboarding === 'awaiting_account') {
    if (!msg.photo) {
      await bot.sendMessage(userId, 'Por favor, envie uma foto da tela de confirmação da sua conta.');
      return;
    }
    
    userStates.set(userId, { onboarding: 'awaiting_deposit' });
    
    const keyboard = {
      inline_keyboard: [
        [{ text: '💰 Fazer Depósito', url: 'https://receber.netlify.app/deposit' }]
      ]
    };
    
    await bot.sendMessage(userId, MESSAGES.ONBOARDING.DEPOSIT_INFO, {
      reply_markup: keyboard,
      parse_mode: 'HTML'
    });
    return;
  }
  
  if (state.onboarding === 'awaiting_deposit') {
    if (!msg.photo) {
      await bot.sendMessage(userId, 'Por favor, envie uma foto do comprovante do seu depósito.');
      return;
    }
    
    const inviteLink = await generateInviteLink(userId);
    userStates.set(userId, { onboarding: 'awaiting_shares' });
    
    const keyboard = {
      inline_keyboard: [
        [{ text: '📲 Compartilhar Bot', url: `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent('Venha conhecer o melhor bot de sinais!')}` }]
      ]
    };
    
    await bot.sendMessage(userId, MESSAGES.ONBOARDING.SHARE_BOT(inviteLink), {
      reply_markup: keyboard,
      parse_mode: 'HTML'
    });
    return;
  }
  
  if (state.onboarding === 'awaiting_shares') {
    userStates.delete(userId);
    await sendMainMenu(userId);
  }
}

async function updateOperationsMenu(chatId) {
  const operations = await getAllOperations();
  const keyboard = {
    inline_keyboard: [
      ...operations.map(op => ([{
        text: `${op.name.toUpperCase()} ${op.active ? '✅' : '❌'}`,
        callback_data: `toggle_${op.name}`
      }])),
      [{ text: '🔙 Voltar', callback_data: 'admin_menu' }]
    ]
  };
  
  await bot.sendMessage(chatId, MESSAGES.OPERATIONS_STATUS(operations), { 
    reply_markup: keyboard,
    parse_mode: 'HTML'
  });
}

async function initBot() {
  if (bot || isShuttingDown) return;

  try {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { 
      polling: {
        interval: 300,
        autoStart: true,
        params: {
          timeout: 10
        }
      }
    });

    const channelId = process.env.CHANNEL_ID;
    const adminId = parseInt(process.env.ADMIN_ID);
    const channelLink = process.env.CHANNEL_LINK;
    
    await bot.sendMessage(channelId, 
      '<b>🚀 Bot iniciado com sucesso!</b>\n\nOperações começarão em 30 segundos.',
      { parse_mode: 'HTML' }
    );

    botInfo = await bot.getMe();
    
    preparationInterval = setInterval(checkAndSendPreparationNotices, 5 * 60 * 1000);
    await startGameOperations();
    setInterval(startGameOperations, 60 * 60 * 1000);

    // Tratamento de erros de polling
    bot.on('polling_error', async (error) => {
      console.log('Polling error:', error.message);
      
      if (error.message.includes('ETELEGRAM: 409 Conflict') || 
          error.message.includes('socket hang up') ||
          error.message.includes('ETIMEDOUT')) {
        pollingRetries++;
        
        if (pollingRetries <= MAX_RETRIES) {
          const reconnected = await reconnectBot();
          if (!reconnected) {
            console.log('Failed to reconnect. Retrying in 5 seconds...');
            setTimeout(() => reconnectBot(), RECONNECT_DELAY);
          }
        } else {
          console.log('Max retries reached. Please check your internet connection and Telegram API status.');
          process.exit(1);
        }
      }
    });

    // Tratamento de erros gerais do bot
    bot.on('error', async (error) => {
      console.log('Bot error:', error.message);
      if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
        await reconnectBot();
      }
    });
    pollingRetries = 0;

    // Handler principal de mensagens
    bot.on('message', async (msg) => {
      try {
        if (!msg.from) return;
        
        const userId = msg.from.id;
        const username = msg.from.username || `user${userId}`;
        const isPrivateChat = msg.chat.type === 'private';
        const state = userStates.get(userId);

        // Primeiro verificar se o usuário é membro do canal
        const isMember = await checkMembership(userId);
        
        // Se não for membro do canal e for chat privado
        if (!isMember && isPrivateChat) {
          const keyboard = {
            inline_keyboard: [[
              { text: '🔥 Entrar no Canal', url: channelLink }
            ]]
          };

          await bot.sendMessage(userId, 
            '<b>Para usar o bot, você precisa primeiro entrar no nosso canal:</b>',
            {
              reply_markup: keyboard,
              parse_mode: 'HTML'
            }
          );
          
          // Verificar após 20 segundos se o usuário entrou no canal
          setTimeout(async () => {
            const hasJoined = await checkMembership(userId);
            if (hasJoined) {
              await handleOnboarding(userId, msg);
            }
          }, 20000);
          
          return;
        }

        // Se for membro do canal, continuar com o fluxo normal
        const user = await getUser(userId);
        if (!user) {
          await addUser(userId, username);
          await handleOnboarding(userId, msg);
          return;
        }

        // Tratamento de registro de canal
        if (state?.type === 'awaiting_channel_link') {
          if (!msg.text?.includes('t.me/')) {
            await bot.sendMessage(userId, '❌ Por favor, envie um link válido do Telegram (deve incluir t.me/)');
            return;
          }

          try {
            const channelUsername = msg.text.split('t.me/')[1].split('/')[0];
            const chatInfo = await bot.getChat('@' + channelUsername);
            
            if (!['channel', 'supergroup', 'group'].includes(chatInfo.type)) {
              await bot.sendMessage(userId, '❌ O link deve ser de um canal ou grupo!');
              return;
            }

            const memberCount = await bot.getChatMemberCount(chatInfo.id);
            const botMember = await bot.getChatMember(chatInfo.id, botInfo.id);
            
            if (!['administrator'].includes(botMember.status)) {
              await bot.sendMessage(userId, MESSAGES.CHANNEL_ERROR);
              return;
            }

            await addChannel(chatInfo.id, chatInfo.title, userId);
            await bot.sendMessage(userId, MESSAGES.CHANNEL_VERIFICATION(memberCount));

            if (memberCount >= 20) {
              await updateChannelStatus(chatInfo.id, 'active', memberCount);
              await bot.sendMessage(userId, MESSAGES.CHANNEL_SUCCESS);
            }

          } catch (error) {
            console.error('Error registering channel:', error);
            await bot.sendMessage(userId, MESSAGES.CHANNEL_ERROR);
          }

          userStates.delete(userId);
          return;
        }

        // Tratamento de broadcast
        if (state?.type === 'awaiting_broadcast_users_media' || state?.type === 'awaiting_broadcast_channel_media') {
          let mediaId = null;
          let mediaType = null;
          
          if (msg.photo) {
            mediaId = msg.photo[msg.photo.length - 1].file_id;
            mediaType = 'photo';
          } else if (msg.video) {
            mediaId = msg.video.file_id;
            mediaType = 'video';
          } else if (msg.document) {
            mediaId = msg.document.file_id;
            mediaType = 'document';
          }

          if (mediaId) {
            userStates.set(userId, {
              type: state.type === 'awaiting_broadcast_users_media' ? 
                'awaiting_broadcast_users_caption' : 
                'awaiting_broadcast_channel_caption',
              mediaId,
              mediaType,
              originalType: state.type
            });
            await bot.sendMessage(userId, '📝 Agora envie o texto da legenda:');
          } else if (msg.text) {
            userStates.set(userId, {
              type: state.type === 'awaiting_broadcast_users_media' ? 
                'awaiting_broadcast_users_button_confirm' : 
                'awaiting_broadcast_channel_button_confirm',
              text: msg.text,
              originalType: state.type
            });
            const keyboard = {
              inline_keyboard: [
                [
                  { text: 'Sim', callback_data: 'broadcast_add_button' },
                  { text: 'Não', callback_data: 'broadcast_no_button' }
                ]
              ]
            };
            await bot.sendMessage(userId, '🔘 Deseja adicionar um botão à mensagem?', {
              reply_markup: keyboard
            });
          }
          return;
        }

        if (state?.type === 'awaiting_broadcast_users_caption' || state?.type === 'awaiting_broadcast_channel_caption') {
          userStates.set(userId, {
            ...state,
            caption: msg.text,
            type: state.type === 'awaiting_broadcast_users_caption' ? 
              'awaiting_broadcast_users_button_confirm' : 
              'awaiting_broadcast_channel_button_confirm'
          });
          
          const keyboard = {
            inline_keyboard: [
              [
                { text: 'Sim', callback_data: 'broadcast_add_button' },
                { text: 'Não', callback_data: 'broadcast_no_button' }
              ]
            ]
          };
          
          await bot.sendMessage(userId, '🔘 Deseja adicionar um botão à mensagem?', {
            reply_markup: keyboard
          });
          return;
        }

        if (state?.type === 'awaiting_button_text') {
          userStates.set(userId, {
            ...state,
            buttonText: msg.text,
            type: 'awaiting_button_url'
          });
          await bot.sendMessage(userId, '🔗 Envie o link do botão:');
          return;
        }

        if (state?.type === 'awaiting_button_url') {
          const url = msg.text;
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            await bot.sendMessage(userId, '❌ Link inválido! O link deve começar com http:// ou https://');
            return;
          }

          const keyboard = {
            inline_keyboard: [
              [{ text: state.buttonText, url }]
            ]
          };

          const broadcastState = {
            ...state,
            keyboard,
            type: 'ready_to_broadcast'
          };

          userStates.set(userId, broadcastState);

          // Preview da mensagem
          if (broadcastState.mediaId) {
            const sendMethod = {
              photo: bot.sendPhoto.bind(bot),
              video: bot.sendVideo.bind(bot),
              document: bot.sendDocument.bind(bot)
            }[broadcastState.mediaType];

            await sendMethod(userId, broadcastState.mediaId, {
              caption: broadcastState.caption,
              parse_mode: 'HTML',
              reply_markup: keyboard
            });
          } else {
            await bot.sendMessage(userId, broadcastState.text, {
              parse_mode: 'HTML',
              reply_markup: keyboard
            });
          }

          const confirmKeyboard = {
            inline_keyboard: [
              [
                { text: '✅ Confirmar', callback_data: state.originalType === 'awaiting_broadcast_users_media' ? 
                  'confirm_broadcast_users' : 'confirm_broadcast_channel' },
                { text: '❌ Cancelar', callback_data: 'cancel_broadcast' }
              ]
            ]
          };

          await bot.sendMessage(userId, 'Confirma o envio da mensagem acima?', {
             reply_markup: confirmKeyboard
          });
          return;
        }

        // Tratamento de gift card
        if (state === 'awaiting_giftcard_code') {
          const code = msg.text.trim().toUpperCase();
          try {
            const credits = await redeemGiftCard(code, userId);
            const buffer = await sendGiftCardImage(code, credits);
            
            await bot.sendPhoto(userId, buffer, {
              caption: MESSAGES.GIFT_CARD_REDEEMED(code, credits, await getCredits(userId)),
              parse_mode: 'HTML'
            });
          } catch (error) {
            await bot.sendMessage(userId, `❌ ${error.message}`);
          }
          
          userStates.delete(userId);
          await sendMainMenu(userId);
          return;
        }

        if (state === 'awaiting_giftcard_value' && userId === adminId) {
          const credits = parseInt(msg.text);
          if (isNaN(credits) || credits <= 0) {
            await bot.sendMessage(adminId, '❌ Valor inválido. Use um número positivo.');
            return;
          }

          const code = await createGiftCard(credits);
          const buffer = await sendGiftCardImage(code, credits);
          
          await bot.sendPhoto(adminId, buffer, {
            caption: MESSAGES.GIFT_CARD_CREATED(code, credits),
            parse_mode: 'HTML'
          });
          
          userStates.delete(userId);
          await sendAdminMenu(adminId);
          return;
        }

        // Comando /start com referral
        if (msg.text?.startsWith('/start')) {
          const args = msg.text.split(' ');
          if (args.length > 1) {
            const inviterId = parseInt(args[1]);
            if (!isNaN(inviterId) && inviterId !== userId) {
              await addInvite(inviterId, userId);
            }
          }
          
          await handleOnboarding(userId, msg);
          return;
        }

        // Comandos de admin
        if (userId === adminId) {
          if (msg.text === '/admin') {
            await sendAdminMenu(userId);
            return;
          }
        }

        // Se chegou até aqui e está em chat privado, mostrar menu principal
        if (isPrivateChat) {
          await sendMainMenu(userId);
        }

      } catch (error) {
        console.error('Error in message handler:', error);
        try {
          await bot.sendMessage(userId, '❌ Ocorreu um erro. Por favor, tente novamente.');
        } catch (sendError) {
          console.error('Error sending error message:', sendError);
        }
      }
    });

    // Handler de callback queries (botões inline)
    bot.on('callback_query', async (query) => {
      try {
        const userId = query.from.id;
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;
        const data = query.data;

        // Verificar saldo
        if (data === 'check_balance') {
          const credits = await getCredits(userId);
          await bot.editMessageText(MESSAGES.BALANCE(credits), {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 Voltar', callback_data: 'main_menu' }]]
            }
          });
        }

        // Meus convites
        else if (data === 'my_invites') {
          const invites = await getUserInvites(userId);
          await bot.editMessageText(MESSAGES.INVITES_LIST(invites), {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 Voltar', callback_data: 'main_menu' }]]
            }
          });
        }

        // Histórico de gift cards
        else if (data === 'giftcard_history') {
          const giftcards = await getUserGiftCards(userId);
          await bot.editMessageText(MESSAGES.GIFT_CARD_HISTORY(giftcards), {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 Voltar', callback_data: 'main_menu' }]]
            }
          });
        }

        // Resgatar gift card
        else if (data === 'redeem_giftcard') {
          userStates.set(userId, 'awaiting_giftcard_code');
          await bot.editMessageText(
            '<b>🎁 Digite o código do Gift Card:</b>',
            {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [[{ text: '🔙 Cancelar', callback_data: 'main_menu' }]]
              }
            }
          );
        }

        // Gerar previsão do Aviator
        else if (data === 'generate_aviator') {
          const credits = await getCredits(userId);
          if (credits <= 0) {
            await bot.answerCallbackQuery(query.id, {
              text: '❌ Você não tem créditos suficientes!',
              show_alert: true
            });
            return;
          }

          if (!isWithinOperatingHours('aviator')) {
            await bot.answerCallbackQuery(query.id, {
              text: '❌ Aviator só está disponível das 12:00 às 23:00!',
              show_alert: true
            });
            return;
          }

          await decrementCredits(userId);
          const multiplier = generateAviatorMultiplier();
          const result = await generateAviatorImage(multiplier);
          
          if (result && result.buffer) {
            await bot.deleteMessage(chatId, messageId);
            await bot.sendPhoto(chatId, result.buffer, {
              caption: MESSAGES.AVIATOR_SIGNAL(multiplier, result.timeStr),
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🎮 APOSTAR AGORA', url: 'https://receber.netlify.app/register' }],
                  [{ text: '🔙 Voltar ao Menu', callback_data: 'main_menu' }]
                ]
              }
            });
          }
        }

        // Gerar sinal do Mines
        else if (data === 'generate_mines') {
          const credits = await getCredits(userId);
          if (credits <= 0) {
            await bot.answerCallbackQuery(query.id, {
              text: '❌ Você não tem créditos suficientes!',
              show_alert: true
            });
            return;
          }

          if (!isWithinOperatingHours('mines')) {
            await bot.answerCallbackQuery(query.id, {
              text: '❌ Mines só está disponível das 00:00 às 12:00!',
              show_alert: true
            });
            return;
          }

          await decrementCredits(userId);
          const prediction = generatePrediction();
          const imageBuffer = await generateMinesImage(prediction);
          
          await bot.deleteMessage(chatId, messageId);
          await bot.sendPhoto(chatId, imageBuffer, {
            caption: MESSAGES.MINES_SIGNAL(prediction),
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🎮 APOSTAR AGORA', url: 'https://receber.netlify.app/register' }],
                [{ text: '🔙 Voltar ao Menu', callback_data: 'main_menu' }]
              ]
            }
          });
        }

        // Quero meu próprio bot
        else if (data === 'want_own_bot') {
          userStates.set(userId, { type: 'awaiting_channel_link' });
          await bot.editMessageText(MESSAGES.WANT_OWN_BOT, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📝 Registrar Canal/Grupo', callback_data: 'register_channel' }],
                [{ text: '🔙 Voltar', callback_data: 'main_menu' }]
              ]
            }
          });
        }

        // Registrar canal
        else if (data === 'register_channel') {
          await bot.editMessageText(MESSAGES.CHANNEL_REGISTRATION, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 Voltar', callback_data: 'want_own_bot' }]]
            }
          });
        }

        // Política de privacidade
        else if (data === 'privacy_policy') {
          await bot.editMessageText(MESSAGES.PRIVACY_POLICY, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 Voltar', callback_data: 'main_menu' }]]
            }
          });
        }

        // Operações de admin
        else if (userId === adminId) {
          if (data === 'admin_menu') {
            await sendAdminMenu(userId);
          }
          
          else if (data === 'admin_users') {
            const users = await getAllUsers();
            await bot.editMessageText(MESSAGES.USERS_LIST(users), {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [[{ text: '🔙 Voltar', callback_data: 'admin_menu' }]]
              }
            });
          }
          
          else if (data === 'admin_operations') {
            await updateOperationsMenu(chatId);
          }
          
          else if (data.startsWith('toggle_')) {
            const operation = data.replace('toggle_', '');
            const currentStatus = await getOperationStatus(operation);
            await setOperationStatus(operation, !currentStatus);
            await updateOperationsMenu(chatId);
          }
          
          else if (data === 'create_giftcard') {
            userStates.set(userId, 'awaiting_giftcard_value');
            await bot.editMessageText(
              '<b>🎁 Digite o valor em créditos do Gift Card:</b>',
              {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [[{ text: '🔙 Cancelar', callback_data: 'admin_menu' }]]
                }
              }
            );
          }
          
          else if (data === 'broadcast_users') {
            userStates.set(userId, { type: 'awaiting_broadcast_users_media' });
            await bot.editMessageText(
              '<b>📢 Envie a mensagem ou mídia que deseja transmitir para todos os usuários:</b>',
              {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [[{ text: '🔙 Cancelar', callback_data: 'admin_menu' }]]
                }
              }
            );
          }
          
          else if (data === 'broadcast_channel') {
            userStates.set(userId, { type: 'awaiting_broadcast_channel_media' });
            await bot.editMessageText(
              '<b>📣 Envie a mensagem ou mídia que deseja transmitir para o canal:</b>',
              {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [[{ text: '🔙 Cancelar', callback_data: 'admin_menu' }]]
                }
              }
            );
          }
          
          else if (data === 'broadcast_add_button') {
            userStates.set(userId, {
              ...userStates.get(userId),
              type: 'awaiting_button_text'
            });
            await bot.editMessageText(
              '📝 Digite o texto que aparecerá no botão:',
              {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [[{ text: '🔙 Cancelar', callback_data: 'admin_menu' }]]
                }
              }
            );
          }
          
          else if (data === 'broadcast_no_button') {
            const state = userStates.get(userId);
            const broadcastState = {
              ...state,
              type: 'ready_to_broadcast'
            };
            userStates.set(userId, broadcastState);

            if (broadcastState.mediaId) {
              const sendMethod = {
                photo: bot.sendPhoto.bind(bot),
                video: bot.sendVideo.bind(bot),
                document: bot.sendDocument.bind(bot)
              }[broadcastState.mediaType];

              await sendMethod(userId, broadcastState.mediaId, {
                caption: broadcastState.caption,
                parse_mode: 'HTML'
              });
            } else {
              await bot.sendMessage(userId, broadcastState.text, {
                parse_mode: 'HTML'
              });
            }

            const confirmKeyboard = {
              inline_keyboard: [
                [
                  { text: '✅ Confirmar', callback_data: state.originalType === 'awaiting_broadcast_users_media' ? 
                    'confirm_broadcast_users' : 'confirm_broadcast_channel' },
                  { text: '❌ Cancelar', callback_data: 'cancel_broadcast' }
                ]
              ]
            };

            await bot.sendMessage(userId, 'Confirma o envio da mensagem acima?', {
               reply_markup: confirmKeyboard
            });
          }
          
          else if (data === 'confirm_broadcast_users') {
            const state = userStates.get(userId);
            const users = await getAllUsers();
            
            let successCount = 0;
            let errorCount = 0;

            for (const user of users) {
              try {
                if (state.mediaId) {
                  const sendMethod = {
                    photo: bot.sendPhoto.bind(bot),
                    video: bot.sendVideo.bind(bot),
                    document: bot.sendDocument.bind(bot)
                  }[state.mediaType];

                  await sendMethod(user.id, state.mediaId, {
                    caption: state.caption,
                    parse_mode: 'HTML',
                    reply_markup: state.keyboard
                  });
                } else {
                  await bot.sendMessage(user.id, state.text, {
                    parse_mode: 'HTML',
                    reply_markup: state.keyboard
                  });
                }
                successCount++;
              } catch (error) {
                console.error(`Error sending broadcast to user ${user.id}:`, error);
                errorCount++;
              }
            }

            await bot.editMessageText(
              `📢 Broadcast concluído!\n\n✅ Enviado: ${successCount}\n❌ Falhas: ${errorCount}`,
              {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: {
                  inline_keyboard: [[{ text: '🔙 Voltar', callback_data: 'admin_menu' }]]
                }
              }
            );
            
            userStates.delete(userId);
          }
          
          else if (data === 'confirm_broadcast_channel') {
            const state = userStates.get(userId);
            
            try {
              if (state.mediaId) {
                const sendMethod = {
                  photo: bot.sendPhoto.bind(bot),
                  video: bot.sendVideo.bind(bot),
                  document: bot.sendDocument.bind(bot)
                }[state.mediaType];

                await sendMethod(process.env.CHANNEL_ID, state.mediaId, {
                  caption: state.caption,
                  parse_mode: 'HTML',
                  reply_markup: state.keyboard
                });
              } else {
                await bot.sendMessage(process.env.CHANNEL_ID, state.text, {
                  parse_mode: 'HTML',
                  reply_markup: state.keyboard
                });
              }

              await bot.editMessageText(
                '📣 Mensagem enviada ao canal com sucesso!',
                {
                  chat_id: chatId,
                  message_id: messageId,
                  reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Voltar', callback_data: 'admin_menu' }]]
                  }
                }
              );
            } catch (error) {
              console.error('Error sending broadcast to channel:', error);
              await bot.editMessageText(
                '❌ Erro ao enviar mensagem ao canal.',
                {
                  chat_id: chatId,
                  message_id: messageId,
                  reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Voltar', callback_data: 'admin_menu' }]]
                  }
                }
              );
            }
            
            userStates.delete(userId);
          }
          
          else if (data === 'cancel_broadcast') {
            userStates.delete(userId);
            await sendAdminMenu(userId);
          }
        }

        // Menu principal
        if (data === 'main_menu') {
          await sendMainMenu(userId);
        }

        // Responder callback query para remover estado de loading
        await bot.answerCallbackQuery(query.id);

      } catch (error) {
        console.error('Error in callback query handler:', error);
        try {
          await bot.answerCallbackQuery(query.id, {
            text: '❌ Ocorreu um erro. Por favor, tente novamente.',
            show_alert: true
          });
        } catch (answerError) {
          console.error('Error answering callback query:', answerError);
        }
      }
    });

  } catch (error) {
    console.error('Error initializing bot:', error);
    process.exit(1);
  }
}

async function stopBot() {
  if (!bot || isShuttingDown) return;
  
  isShuttingDown = true;
  
  try {
    if (preparationInterval) {
      clearInterval(preparationInterval);
      preparationInterval = null;
    }
    
    if (currentGameInterval) {
      clearInterval(currentGameInterval);
      currentGameInterval = null;
    }
    
    if (minesTimeout) {
      clearTimeout(minesTimeout);
      minesTimeout = null;
    }
    
    if (aviatorTimeout) {
      clearTimeout(aviatorTimeout);
      aviatorTimeout = null;
    }
    
    await bot.stopPolling();
    bot = null;
    isShuttingDown = false;
    console.log('Bot stopped successfully');
  } catch (error) {
    console.error('Error stopping bot:', error);
    isShuttingDown = false;
  }
}

process.on('SIGINT', async () => {
  console.log('Received SIGINT. Gracefully shutting down...');
  await stopBot();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM. Gracefully shutting down...');
  await stopBot();
  process.exit(0);
});

// Initialize database and start bot
await initDatabase();
await initBot();
