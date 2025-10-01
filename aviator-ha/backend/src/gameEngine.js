// gameEngine.js
// Lógica de rondas tipo Aviator con máquina de estados, scheduler y publicación de eventos
// Integra Socket.IO, Redis y MongoDB

import EventEmitter from 'events';
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';
import Redis from 'ioredis';

// --- Configuración Redis (ajusta si es necesario) ---
const redis = new Redis();

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
    // Solo iniciar el ciclo de rondas si es coordinador
  if (isCoordinator) this.startCycle();
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
    // Ticks de multiplicador (cada 100ms, aumenta 10 milésimas por tick)
    let multiplier = 1000; // 1.000x
    if (this.timers.flight) clearInterval(this.timers.flight);
    this.timers.flight = setInterval(() => {
      multiplier += 10; // 0.010x por tick
      // Emitir como flotante para el frontend, pero internamente es entero
      this.io.emit('round:update', { state: this.state, multiplier: multiplier / 1000 });
      redis.publish('round:update', JSON.stringify({ state: this.state, multiplier: multiplier / 1000 }));
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
    // Después de settlement, iniciar ciclo: waiting -> betting_open
    this.startCycle();
  }

  emitState() {
    const payload = {
      state: this.state,
      roundId: this.round?.roundId,
      // crashPoint como flotante para el frontend, pero internamente es entero
      crashPoint: this.round?.crashPoint ? this.round.crashPoint / 1000 : undefined,
    };
    this.io.emit('round:update', payload);
    redis.publish('round:update', JSON.stringify(payload));
  }
}
