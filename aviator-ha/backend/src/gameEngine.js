// gameEngine.js
// Lógica de rondas tipo Aviator con máquina de estados, scheduler y publicación de eventos
// Integra Socket.IO, Redis y MongoDB

import EventEmitter from 'events';
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';
import Redis from 'ioredis';

// --- Configuración Redis (ajusta si es necesario) ---
let redis;
try {
  redis = new Redis();
  console.log('[GameEngine] Redis conectado');
} catch (error) {
  console.log('[GameEngine] Redis no disponible, funcionando sin caché');
  redis = {
    publish: () => {}, // Función vacía para evitar errores
  };
}

// --- Esquema de Usuario ---
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  balance: { type: Number, default: 1000 },
  totalFlights: { type: Number, default: 0 },
  totalProfit: { type: Number, default: 0 },
  bestMultiplier: { type: Number, default: 0 },
  lastSeen: { type: Date, default: Date.now },
});
const User = mongoose.models.User || mongoose.model('User', userSchema);

// --- Esquema de Apuesta ---
const betSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  roundId: String,
  amount: Number, // En centavos para evitar decimales
  multiplier: Number, // En milésimas (ej: 2530 = 2.530x)
  profit: Number, // En centavos
  cashedOut: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now },
});
const Bet = mongoose.models.Bet || mongoose.model('Bet', betSchema);

// --- Esquema de Ronda y Apuesta (simplificado) ---
const roundSchema = new mongoose.Schema({
  roundId: String,
  state: String,
  startTime: Date,
  endTime: Date,
  crashPoint: Number, // Guardado en milésimas (ej: 2530 = 2.530x)
  seed: String,
  bets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bet' }],
});
const Round = mongoose.models.Round || mongoose.model('Round', roundSchema);

// --- Máquina de estados ---
const STATES = [
  'waiting',
  'betting_open',
  'betting_closed',
  'in_flight',
  'crash',
  'settlement',
];

export default class GameEngine extends EventEmitter {
  constructor(io, isCoordinator = false) {
    super();
    this.io = io;
    this.isCoordinator = isCoordinator; // Solo un nodo debe ser coordinador
    this.state = 'waiting';
    this.round = null;
    this.timers = {};
    
    // Sistema de usuarios conectados
    this.connectedUsers = new Map(); // socketId -> { userId, username, balance, betting }
    this.currentBets = new Map(); // userId -> { amount, betId }
    
    // Setup de eventos de Socket.IO
    this.setupSocketEvents();
    
    // Solo iniciar el ciclo de rondas si es coordinador
    if (isCoordinator) this.startCycle();
  }

  // Configurar eventos de Socket.IO
  setupSocketEvents() {
    this.io.on('connection', (socket) => {
      console.log(`[GameEngine] Usuario conectado: ${socket.id}`);
      
      // Usuario se une
      socket.on('user:join', async (data) => {
        try {
          await this.handleUserJoin(socket, data);
        } catch (error) {
          console.error('[GameEngine] Error en user:join:', error);
        }
      });
      
      // Colocar apuesta
      socket.on('bet:place', async (data) => {
        try {
          await this.handleBetPlace(socket, data);
        } catch (error) {
          console.error('[GameEngine] Error en bet:place:', error);
        }
      });
      
      // Hacer cashout
      socket.on('bet:cashout', async (data) => {
        try {
          await this.handleBetCashout(socket, data);
        } catch (error) {
          console.error('[GameEngine] Error en bet:cashout:', error);
        }
      });
      
      // Cancelar/retirar apuesta
      socket.on('bet:cancel', async (data) => {
        try {
          await this.handleBetCancel(socket, data);
        } catch (error) {
          console.error('[GameEngine] Error en bet:cancel:', error);
        }
      });
      
      // Usuario se desconecta
      socket.on('disconnect', () => {
        this.handleUserDisconnect(socket);
      });
    });
  }

  // Manejar conexión de usuario
  async handleUserJoin(socket, data) {
    const { username, balance } = data;
    
    // Buscar o crear usuario
    let user = await User.findOne({ username });
    if (!user) {
      user = await User.create({
        username,
        balance: balance || 1000,
        lastSeen: new Date(),
      });
      console.log(`[GameEngine] Usuario creado: ${username}`);
    } else {
      // Actualizar última conexión
      user.lastSeen = new Date();
      await user.save();
    }
    
    // Agregar a usuarios conectados
    this.connectedUsers.set(socket.id, {
      userId: user._id,
      username: user.username,
      balance: user.balance,
      betting: false,
      socketId: socket.id,
    });
    
    // Enviar estado actual del juego al usuario
    socket.emit('round:update', {
      state: this.state,
      roundId: this.round?.roundId,
      multiplier: this.getCurrentMultiplier(),
    });
    
    // Enviar balance actualizado
    socket.emit('balance:update', { balance: user.balance });
    
    // Broadcast lista de usuarios
    this.broadcastUsersList();
    
    console.log(`[GameEngine] Usuario ${username} se unió con balance $${user.balance}`);
  }

  // Manejar colocación de apuesta
  async handleBetPlace(socket, data) {
    const { amount, username } = data;
    const userConnection = this.connectedUsers.get(socket.id);
    
    if (!userConnection) {
      socket.emit('bet:placed', { success: false, message: 'Usuario no encontrado' });
      return;
    }
    
    // Validar estado del juego
    if (this.state !== 'betting_open') {
      socket.emit('bet:placed', { success: false, message: 'Apuestas cerradas' });
      return;
    }
    
    // Validar que no tenga apuesta activa
    if (this.currentBets.has(userConnection.userId.toString())) {
      socket.emit('bet:placed', { success: false, message: 'Ya tienes una apuesta activa' });
      return;
    }
    
    // Buscar usuario en BD
    const user = await User.findById(userConnection.userId);
    if (!user) {
      socket.emit('bet:placed', { success: false, message: 'Usuario no encontrado en BD' });
      return;
    }
    
    // Validar balance
    const amountInCents = Math.round(amount * 100); // Convertir a centavos
    if (amountInCents > user.balance * 100) {
      socket.emit('bet:placed', { success: false, message: 'Balance insuficiente' });
      return;
    }
    
    // Crear apuesta
    const bet = await Bet.create({
      userId: user._id,
      roundId: this.round.roundId,
      amount: amountInCents,
      timestamp: new Date(),
    });
    
    // Descontar balance
    user.balance -= amount;
    await user.save();
    
    // Agregar a apuestas actuales
    this.currentBets.set(user._id.toString(), {
      amount: amountInCents,
      betId: bet._id,
    });
    
    // Actualizar estado del usuario
    userConnection.balance = user.balance;
    userConnection.betting = true;
    
    // Responder al usuario
    socket.emit('bet:placed', {
      success: true,
      amount: amount,
      newBalance: user.balance,
      message: 'Apuesta colocada exitosamente',
    });
    
    // Broadcast lista actualizada
    this.broadcastUsersList();
    
    console.log(`[GameEngine] ${username} apostó $${amount} (Balance: $${user.balance})`);
  }

  // Manejar cashout
  async handleBetCashout(socket, data) {
    const { username, multiplier } = data;
    const userConnection = this.connectedUsers.get(socket.id);
    
    if (!userConnection) {
      socket.emit('bet:cashout', { success: false, message: 'Usuario no encontrado' });
      return;
    }
    
    // Validar estado del juego
    if (this.state !== 'in_flight') {
      socket.emit('bet:cashout', { success: false, message: 'No puedes hacer cashout ahora' });
      return;
    }
    
    // Verificar apuesta activa
    const userBet = this.currentBets.get(userConnection.userId.toString());
    if (!userBet) {
      socket.emit('bet:cashout', { success: false, message: 'No tienes apuesta activa' });
      return;
    }
    
    // Calcular ganancia
    const betAmount = userBet.amount / 100; // Convertir de centavos a dólares
    const winnings = betAmount * multiplier;
    const profit = winnings - betAmount;
    
    // Actualizar apuesta en BD
    await Bet.findByIdAndUpdate(userBet.betId, {
      multiplier: Math.round(multiplier * 1000), // Guardar en milésimas
      profit: Math.round(profit * 100), // Guardar en centavos
      cashedOut: true,
    });
    
    // Actualizar usuario
    const user = await User.findById(userConnection.userId);
    user.balance += winnings;
    user.totalProfit += profit;
    if (multiplier > user.bestMultiplier) {
      user.bestMultiplier = multiplier;
    }
    await user.save();
    
    // Remover de apuestas actuales
    this.currentBets.delete(userConnection.userId.toString());
    
    // Actualizar estado del usuario
    userConnection.balance = user.balance;
    userConnection.betting = false;
    
    // Responder al usuario
    socket.emit('bet:cashout', {
      success: true,
      profit: profit,
      newBalance: user.balance,
      multiplier: multiplier,
    });
    
    // Broadcast lista actualizada
    this.broadcastUsersList();
    
    console.log(`[GameEngine] ${username} hizo cashout en ${multiplier}x - Ganancia: $${profit.toFixed(2)}`);
  }

  // Manejar cancelación de apuesta
  async handleBetCancel(socket, data) {
    const { username } = data;
    const userConnection = this.connectedUsers.get(socket.id);
    
    if (!userConnection) {
      socket.emit('bet:cancelled', { success: false, message: 'Usuario no encontrado' });
      return;
    }
    
    // Validar estado del juego (solo se puede cancelar durante betting_open)
    if (this.state !== 'betting_open') {
      socket.emit('bet:cancelled', { success: false, message: 'No puedes cancelar la apuesta ahora' });
      return;
    }
    
    // Verificar apuesta activa
    const userBet = this.currentBets.get(userConnection.userId.toString());
    if (!userBet) {
      socket.emit('bet:cancelled', { success: false, message: 'No tienes apuesta activa para cancelar' });
      return;
    }
    
    // Obtener datos de la apuesta
    const betAmount = userBet.amount / 100; // Convertir de centavos a dólares
    
    // Eliminar apuesta de la base de datos
    await Bet.findByIdAndDelete(userBet.betId);
    
    // Devolver dinero al usuario
    const user = await User.findById(userConnection.userId);
    user.balance += betAmount;
    await user.save();
    
    // Remover de apuestas actuales
    this.currentBets.delete(userConnection.userId.toString());
    
    // Actualizar estado del usuario
    userConnection.balance = user.balance;
    userConnection.betting = false;
    
    // Responder al usuario
    socket.emit('bet:cancelled', {
      success: true,
      refundedAmount: betAmount,
      newBalance: user.balance,
      message: 'Apuesta cancelada exitosamente',
    });
    
    // Actualizar balance del usuario
    socket.emit('balance:update', { balance: user.balance });
    
    // Broadcast lista actualizada
    this.broadcastUsersList();
    
    console.log(`[GameEngine] ${username} canceló su apuesta de $${betAmount} (Balance: $${user.balance})`);
  }

  // Manejar desconexión
  handleUserDisconnect(socket) {
    const userConnection = this.connectedUsers.get(socket.id);
    if (userConnection) {
      console.log(`[GameEngine] Usuario ${userConnection.username} se desconectó`);
      this.connectedUsers.delete(socket.id);
      this.broadcastUsersList();
    }
  }

  // Broadcast lista de usuarios conectados
  broadcastUsersList() {
    const usersList = Array.from(this.connectedUsers.values()).map(user => ({
      username: user.username,
      balance: user.balance,
      betting: user.betting,
    }));
    
    this.io.emit('users:list', usersList);
  }

  // Obtener multiplicador actual durante vuelo
  getCurrentMultiplier() {
    if (this.state === 'in_flight' && this.round) {
      // Estimación aproximada del multiplicador actual
      return 1.0; // Se actualizará en tiempo real durante el vuelo
    }
    return 1.0;
  }


  // Siempre pasar por waiting antes de betting_open
  startCycle() {
    this.state = 'waiting';
    this.emitState();
    if (this.timers.waiting) clearTimeout(this.timers.waiting);
    this.timers.waiting = setTimeout(() => this.openBets(), 2000);
  }

  async openBets() {
    try {
      console.log('[GameEngine] Abriendo apuestas (betting_open)...');
      this.state = 'betting_open';
      this.round = await Round.create({
        roundId: uuidv4(),
        state: this.state,
        startTime: new Date(),
        seed: uuidv4(),
      });
      console.log('[GameEngine] Ronda creada:', this.round.roundId);
      // Notificar al backend el roundId actual
      this.emit('roundChanged', this.round.roundId);
      this.emitState();
      // Apuestas abiertas por 5s
      if (this.timers.betting) clearTimeout(this.timers.betting);
      this.timers.betting = setTimeout(() => this.closeBets(), 5000);
    } catch (err) {
      console.error('[GameEngine] Error al abrir apuestas:', err);
      // Intentar reintentar tras 2s si falla
      setTimeout(() => this.openBets(), 2000);
    }
  }

  // El método start ya no se usa para iniciar el ciclo

  // nextRound ya no se usa, todo inicia desde openBets()

  async closeBets() {
    this.state = 'betting_closed';
    await Round.findByIdAndUpdate(this.round._id, { state: this.state });
    this.emitState();
    // Espera breve antes de despegar
    if (this.timers.closed) clearTimeout(this.timers.closed);
    this.timers.closed = setTimeout(() => this.inFlight(), 1000);
  }

  async inFlight() {
    this.state = 'in_flight';
    await Round.findByIdAndUpdate(this.round._id, { state: this.state });
    this.emitState();
    // Simula el crashPoint en milésimas (ej: 1.000x a 11.000x)
    const crashPoint = Math.floor(Math.random() * 10000) + 1000; // 1000 - 11000
    this.round.crashPoint = crashPoint;
    console.log(`[GameEngine] Vuelo iniciado - Crash point: ${(crashPoint / 1000).toFixed(3)}x`);
    
    // Ticks de multiplicador (cada 100ms, aumenta 10 milésimas por tick)
    let multiplier = 1000; // 1.000x
    if (this.timers.flight) clearInterval(this.timers.flight);
    this.timers.flight = setInterval(() => {
      multiplier += 10; // 0.010x por tick
      // Emitir como flotante para el frontend, pero internamente es entero
      const payload = { 
        state: this.state, 
        multiplier: multiplier / 1000,
        roundId: this.round.roundId 
      };
      this.io.emit('round:update', payload);
      redis.publish('round:update', JSON.stringify(payload));
      
      if (multiplier >= crashPoint) {
        clearInterval(this.timers.flight);
        this.crash();
      }
    }, 100);
  }

  async crash() {
    this.state = 'crash';
    await Round.findByIdAndUpdate(this.round._id, { state: this.state, crashPoint: this.round.crashPoint });
    this.emitState();
    // Emitir crashPoint como flotante para el frontend
    this.io.emit('round:crash', { crashPoint: this.round.crashPoint / 1000 });
    redis.publish('round:crash', JSON.stringify({ crashPoint: this.round.crashPoint / 1000 }));
    // Settlement tras 2s
    if (this.timers.settle) clearTimeout(this.timers.settle);
    this.timers.settle = setTimeout(() => this.settlement(), 2000);
  }

  async settlement() {
    this.state = 'settlement';
    await Round.findByIdAndUpdate(this.round._id, { state: this.state, endTime: new Date() });
    this.emitState();
    
    // Procesar apuestas perdedoras (las que no hicieron cashout)
    await this.processLosingBets();
    
    // Limpiar apuestas actuales para la próxima ronda
    this.currentBets.clear();
    
    // Actualizar estado de usuarios (ya no están apostando)
    for (const [socketId, userConnection] of this.connectedUsers) {
      userConnection.betting = false;
    }
    
    // Broadcast lista actualizada
    this.broadcastUsersList();
    
    console.log(`[GameEngine] Settlement completado para ronda ${this.round.roundId}`);
    
    // Después de settlement, iniciar ciclo: waiting -> betting_open
    this.startCycle();
  }

  // Procesar apuestas que perdieron (no hicieron cashout)
  async processLosingBets() {
    try {
      for (const [userId, userBet] of this.currentBets) {
        // Actualizar la apuesta como perdida
        await Bet.findByIdAndUpdate(userBet.betId, {
          multiplier: this.round.crashPoint, // Multiplier del crash
          profit: -(userBet.amount), // Pérdida completa en centavos
          cashedOut: false,
        });
        
        // Actualizar estadísticas del usuario
        const user = await User.findById(userId);
        if (user) {
          user.totalFlights += 1;
          user.totalProfit -= (userBet.amount / 100); // Convertir de centavos a dólares
          await user.save();
          
          // Actualizar usuario conectado si existe
          for (const [socketId, userConnection] of this.connectedUsers) {
            if (userConnection.userId.toString() === userId) {
              userConnection.balance = user.balance;
              break;
            }
          }
        }
      }
    } catch (error) {
      console.error('[GameEngine] Error procesando apuestas perdedoras:', error);
    }
  }

  emitState() {
    const payload = {
      state: this.state,
      roundId: this.round?.roundId,
      multiplier: this.getCurrentMultiplier(),
      // crashPoint como flotante para el frontend, pero internamente es entero
      crashPoint: this.round?.crashPoint ? this.round.crashPoint / 1000 : undefined,
    };
    this.io.emit('round:update', payload);
    redis.publish('round:update', JSON.stringify(payload));
    console.log(`[GameEngine] Estado emitido: ${this.state} - Round: ${this.round?.roundId}`);
  }
}
