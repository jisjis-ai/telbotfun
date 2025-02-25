import Jimp from 'jimp';
import moment from 'moment-timezone';

export async function generateMinesImage(prediction) {
  try {
    // Criar uma nova imagem com fundo preto
    const image = new Jimp(800, 800, 0x000000FF);
    
    // Configurações da grade
    const gridSize = 5;
    const cellSize = 150;
    const padding = 25;
    const startX = (800 - (gridSize * cellSize)) / 2;
    const startY = (800 - (gridSize * cellSize)) / 2;
    
    // Desenhar a grade
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const x = startX + (j * cellSize);
        const y = startY + (i * cellSize);
        
        // Desenhar célula com borda azul neon
        for (let b = 0; b < 3; b++) {
          image.scan(x-b, y-b, cellSize+2*b, cellSize+2*b, function(x, y, idx) {
            this.bitmap.data[idx + 0] = 0; // R
            this.bitmap.data[idx + 1] = 255; // G
            this.bitmap.data[idx + 2] = 255; // B
            this.bitmap.data[idx + 3] = 255; // A
          });
        }
        
        // Preencher interior da célula com preto
        image.scan(x+3, y+3, cellSize-6, cellSize-6, function(x, y, idx) {
          this.bitmap.data[idx + 0] = 0; // R
          this.bitmap.data[idx + 1] = 0; // G
          this.bitmap.data[idx + 2] = 0; // B
          this.bitmap.data[idx + 3] = 255; // A
        });
        
        // Desenhar diamante se esta posição for uma das selecionadas
        if (prediction.starPositions.some(pos => pos.x === i && pos.y === j)) {
          const diamondSize = cellSize * 0.6;
          const centerX = x + cellSize / 2;
          const centerY = y + cellSize / 2;
          const halfSize = diamondSize / 2;
          
          // Pontos do diamante
          const points = [
            { x: centerX, y: centerY - halfSize }, // Topo
            { x: centerX + halfSize, y: centerY }, // Direita
            { x: centerX, y: centerY + halfSize }, // Base
            { x: centerX - halfSize, y: centerY }  // Esquerda
          ];
          
          // Desenhar o diamante preenchido
          for (let px = centerX - halfSize; px <= centerX + halfSize; px++) {
            for (let py = centerY - halfSize; py <= centerY + halfSize; py++) {
              // Verificar se o ponto está dentro do diamante usando produto vetorial
              let inside = true;
              for (let i = 0; i < points.length; i++) {
                const j = (i + 1) % points.length;
                const vec1x = points[j].x - points[i].x;
                const vec1y = points[j].y - points[i].y;
                const vec2x = px - points[i].x;
                const vec2y = py - points[i].y;
                const cross = vec1x * vec2y - vec1y * vec2x;
                if (cross < 0) {
                  inside = false;
                  break;
                }
              }
              
              if (inside && px >= 0 && px < 800 && py >= 0 && py < 800) {
                // Adicionar brilho ao diamante
                const distanceToCenter = Math.sqrt(
                  Math.pow(px - centerX, 2) + Math.pow(py - centerY, 2)
                );
                const brightness = Math.max(0, 1 - distanceToCenter / halfSize);
                const color = Jimp.rgbaToInt(
                  0,  // R
                  Math.floor(255 * brightness), // G
                  Math.floor(255 * brightness), // B
                  255 // A
                );
                image.setPixelColor(color, px, py);
              }
            }
          }
          
          // Adicionar brilho extra nas bordas
          points.forEach((point, idx) => {
            const nextPoint = points[(idx + 1) % points.length];
            const steps = 20;
            for (let s = 0; s <= steps; s++) {
              const px = Math.floor(point.x + (nextPoint.x - point.x) * (s / steps));
              const py = Math.floor(point.y + (nextPoint.y - point.y) * (s / steps));
              if (px >= 0 && px < 800 && py >= 0 && py < 800) {
                image.setPixelColor(0x00FFFFFF, px, py);
              }
            }
          });
        }
      }
    }
    
    return await image.getBufferAsync(Jimp.MIME_PNG);
  } catch (error) {
    console.error('Error generating Mines image:', error);
    return null;
  }
}

export function generatePrediction() {
  // Configurações do jogo Mines
  const mines = 3; // Número de minas
  const attempts = 3; // Número de tentativas
  const validityMinutes = 5; // Validade do sinal em minutos
  
  // Gerar posições aleatórias para os diamantes
  const numDiamonds = 3; // Número de diamantes a serem colocados
  const starPositions = [];
  
  for (let i = 0; i < numDiamonds; i++) {
    let x, y;
    do {
      x = Math.floor(Math.random() * 5);
      y = Math.floor(Math.random() * 5);
    } while (starPositions.some(pos => pos.x === x && pos.y === y));
    starPositions.push({ x, y });
  }
  
  // Calculate validity time using Maputo timezone
  const validUntil = moment().tz('Africa/Maputo').add(validityMinutes, 'minutes').format('HH:mm:ss');
  
  return {
    mines: mines,
    attempts: attempts,
    validUntil: validUntil,
    starPositions: starPositions,
    safeSpots: starPositions.map(pos => `${pos.x+1}x${pos.y+1}`)
  };
}

export function generateAviatorMultiplier() {
  // Gera um número entre 1.00 e 7.00
  return (Math.random() * 6 + 1).toFixed(2);
}

export function calculateFutureTime() {
  const now = moment().tz('Africa/Maputo');
  // Adiciona 2 minutos ao tempo atual
  const futureTime = now.add(2, 'minutes').seconds(Math.floor(Math.random() * 30) + 30);
  return {
    time: futureTime,
    timeStr: futureTime.format('HH:mm:ss')
  };
}

export async function generateAviatorImage(multiplier) {
  try {
    // Create a new image with black background
    const image = new Jimp(800, 400, 0x000000FF);
    
    // Create sunburst effect
    const centerX = 400;
    const centerY = 200;
    const numRays = 12;
    const rayLength = 400;
    
    for (let i = 0; i < numRays; i++) {
      const angle = (i * 2 * Math.PI) / numRays;
      
      // Draw ray with gradient opacity
      for (let j = 0; j < rayLength; j += 2) {
        const x = centerX + j * Math.cos(angle);
        const y = centerY + j * Math.sin(angle);
        const opacity = Math.floor((1 - j / rayLength) * 50); // Fade out
        image.setPixelColor(Jimp.rgbaToInt(20, 20, 20, opacity), Math.floor(x), Math.floor(y));
      }
    }
    
    // Load fonts
    const font = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
    const largeFont = await Jimp.loadFont(Jimp.FONT_SANS_128_WHITE);
    
    // Add "VOOU PARA LONGE!" text in white with better positioning
    const titleText = 'VOOU PARA LONGE!';
    const titleWidth = Jimp.measureText(font, titleText);
    const titleX = (800 - titleWidth) / 2;
    await image.print(font, titleX, 50, {
      text: titleText
    });
    
    // Print multiplier in red with better positioning
    const multiplierText = `${multiplier}x`;
    const textWidth = Jimp.measureText(largeFont, multiplierText);
    const textX = (800 - textWidth) / 2;
    
    // Create a temporary image for the red text
    const textImage = new Jimp(800, 400, 0x00000000);
    await textImage.print(largeFont, textX, 150, {
      text: multiplierText
    });
    
    // Apply red tint only to the multiplier text
    textImage.color([{ apply: 'red', params: [100] }]);
    
    // Composite the red text onto the main image
    image.composite(textImage, 0, 0);
    
    // Convert image to buffer
    const buffer = await image.getBufferAsync(Jimp.MIME_PNG);
    const futureTime = calculateFutureTime();
    return { buffer, timeStr: futureTime.timeStr, targetTime: futureTime.time };
  } catch (error) {
    console.error('Error generating Aviator image:', error);
    return null;
  }
}

export async function sendGiftCardImage(code, credits) {
  try {
    const image = new Jimp(800, 400, 0x000000FF);
    
    // Load fonts
    const font = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
    const largeFont = await Jimp.loadFont(Jimp.FONT_SANS_128_WHITE);
    
    // Add decorative elements
    const centerX = 400;
    const centerY = 200;
    const numRays = 12;
    const rayLength = 400;
    
    for (let i = 0; i < numRays; i++) {
      const angle = (i * 2 * Math.PI) / numRays;
      for (let j = 0; j < rayLength; j += 2) {
        const x = centerX + j * Math.cos(angle);
        const y = centerY + j * Math.sin(angle);
        const opacity = Math.floor((1 - j / rayLength) * 50);
        image.setPixelColor(Jimp.rgbaToInt(20, 20, 20, opacity), Math.floor(x), Math.floor(y));
      }
    }
    
    // Add "GIFT CARD" text
    const titleText = '🎁 GIFT CARD';
    const titleWidth = Jimp.measureText(font, titleText);
    const titleX = (800 - titleWidth) / 2;
    await image.print(font, titleX, 50, {
      text: titleText
    });
    
    // Add credits value
    const creditsText = `${credits} CRÉDITOS`;
    const creditsWidth = Jimp.measureText(largeFont, creditsText);
    const creditsX = (800 - creditsWidth) / 2;
    await image.print(largeFont, creditsX, 150, {
      text: creditsText
    });
    
    // Add code
    const codeText = code;
    const codeWidth = Jimp.measureText(font, codeText);
    const codeX = (800 - codeWidth) / 2;
    await image.print(font, codeX, 300, {
      text: codeText
    });
    
    return await image.getBufferAsync(Jimp.MIME_PNG);
  } catch (error) {
    console.error('Error generating gift card image:', error);
    return null;
  }
}

export function isWithinOperatingHours(game) {
  const now = moment().tz('Africa/Maputo');
  const hour = now.hours();
  
  if (game === 'mines') {
    // Mines: 00:00 - 12:00 (Horário de Maputo)
    return hour >= 0 && hour < 12;
  } else if (game === 'aviator') {
    // Aviator: 12:00 - 23:00 (Horário de Maputo)
    return hour >= 12 && hour < 23;
  }
  
  return false;
}

export function shouldSendPreparationNotice(game) {
  const now = moment().tz('Africa/Maputo');
  const hour = now.hours();
  
  if (game === 'mines') {
    // Uma hora antes do Mines começar (23:00 horário de Maputo)
    return hour === 23;
  } else if (game === 'aviator') {
    // Uma hora antes do Aviator começar (11:00 horário de Maputo)
    return hour === 11;
  }
  
  return false;
}

// Função para verificar se o sinal deve ser enviado
export function shouldSendSignal() {
  return true; // Agora sempre retorna true pois o controle é feito no index.js
}

// Função para verificar se deve enviar confirmação de sucesso
export function shouldSendSuccess() {
  return true; // Agora sempre retorna true pois o controle é feito no index.js
}