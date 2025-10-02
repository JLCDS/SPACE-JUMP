import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { MongoClient, ReadPreference } from 'mongodb';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { cfg } from './config.js';
import mongoose from 'mongoose';
import GameEngine from './gameEngine.js';

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);

// Socket.IO
const io = new Server(httpServer, {
  path: '/socket.io/',
  serveClient: false,
  cors: { origin: "*", methods: ["GET","POST"] }
});

// Redis adapter (opcional)
let pub, sub;
try {
  pub = new Redis({ host: cfg.REDIS_HOST, port: cfg.REDIS_PORT });
  sub = pub.duplicate();
  io.adapter(createAdapter(pub, sub));
  console.log('[Server] Redis adapter configurado');
} catch (error) {
  console.log('[Server] Redis no disponible, funcionando sin adapter distribuido');
}

// Mongo: write (PRIMARY) / read (secondaryPreferred)
const writeClient = new MongoClient(cfg.MONGO_URI);
const readClient = new MongoClient(cfg.MONGO_URI, { readPreference: ReadPreference.secondaryPreferred });

let betsWrite, betsRead;

async function initDb() {
  await writeClient.connect();
  await readClient.connect();
  const dbW = writeClient.db('aviator');
  const dbR = readClient.db('aviator');
  betsWrite = dbW.collection('bets');
  betsRead = dbR.collection('bets');
  await betsWrite.createIndex({ createdAt: -1 });
}

// Health
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: cfg.SERVICE_NAME, when: new Date().toISOString() });
});

// POST crear apuesta
app.post('/api/bets', async (req, res) => {
  try {
    const { user, amount } = req.body || {};
    if (!user || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Datos inválidos (user, amount)' });
    }
    const bet = { user, amount, createdAt: new Date() };
    const r = await betsWrite.insertOne(bet);
    const doc = { ...bet, _id: r.insertedId, backend: cfg.SERVICE_NAME };
    io.emit('bet:new', doc);
    res.status(201).json({ ok: true, betId: r.insertedId });
  } catch (e) {
    console.error('POST /api/bets', e);
    res.status(500).json({ error: 'Error creando apuesta' });
  }
});

// GET listar apuestas
app.get('/api/bets', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const items = await betsRead.find({}, { sort: { createdAt: -1 }, limit }).toArray();
    res.json({ ok: true, items, backend: cfg.SERVICE_NAME });
  } catch (e) {
    console.error('GET /api/bets', e);
    res.status(500).json({ error: 'Error listando apuestas' });
  }
});

// POST cashout (debe ir después de la inicialización de app)
// POST cashout (debe ir después de la inicialización de app y junto a los otros endpoints)
app.post('/api/cashout', async (req, res) => {
  try {
    const { user, roundId } = req.body || {};
    if (!user || !roundId) {
      return res.status(400).json({ error: 'Datos inválidos (user, roundId)' });
    }
    // Buscar la apuesta activa del usuario en la ronda
    const bet = await betsWrite.findOne({ user, roundId });
    if (!bet) {
      return res.status(404).json({ error: 'Apuesta no encontrada para este usuario y ronda' });
    }
    if (bet.cashoutMultiplier) {
      return res.status(400).json({ error: 'Ya realizaste cashout en esta apuesta' });
    }
    // Validar que la ronda sigue en vuelo (no crash)
    const Round = mongoose.models.Round || mongoose.model('Round');
    const round = await Round.findOne({ roundId });
    if (!round || round.state !== 'in_flight') {
      return res.status(400).json({ error: 'No se puede hacer cashout en este momento' });
    }
    // Obtener el multiplicador actual (del GameEngine)
    // NOTA: Para máxima precisión, deberías guardar el tiempo de inicio de in_flight y calcular el multiplicador según el tiempo transcurrido.
    // Aquí se usa un valor fijo como ejemplo.
    const multiplier = 1000; // Valor fijo (1.000x) por ahora
    await betsWrite.updateOne(
      { _id: bet._id },
      { $set: { cashoutMultiplier: multiplier, cashoutAt: new Date() } }
    );
    const updatedBet = { ...bet, cashoutMultiplier: multiplier, cashoutAt: new Date() };
    io.emit('bet:cashout', updatedBet);
    res.json({ ok: true, betId: bet._id, cashoutMultiplier: multiplier });
  } catch (e) {
    console.error('POST /api/cashout', e);
    res.status(500).json({ error: 'Error en cashout' });
  }
});

io.on('connection', (socket) => {
  console.log(`[${cfg.SERVICE_NAME}] WS conectado ${socket.id}`);
  socket.emit('hello', { msg: `Conectado a ${cfg.SERVICE_NAME}`, when: new Date().toISOString() });
  // Enviar estado actual de la ronda al conectar
  const gameEngine = global.__gameEngine;
  if (gameEngine && gameEngine.round) {
    const payload = {
      state: gameEngine.state,
      roundId: gameEngine.round.roundId,
      crashPoint: gameEngine.round.crashPoint ? gameEngine.round.crashPoint / 1000 : undefined,
    };
    socket.emit('round:update', payload);
  }
  socket.on('disconnect', (reason) => {
    console.log(`[${cfg.SERVICE_NAME}] WS desconectado ${socket.id} (${reason})`);
  });
});

async function startServer() {
  await initDb();
  // Conexión de mongoose para gameEngine (usa la misma URI)
  await mongoose.connect(cfg.MONGO_URI, { readPreference: 'primary' });
  // Inicializar GameEngine solo en el coordinador (ejemplo: backend1)
  let gameEngine;
  if (cfg.SERVICE_NAME === 'backend1') {
    gameEngine = new GameEngine(io, true); // Coordinador
    console.log('GameEngine iniciado como coordinador');
  } else {
    gameEngine = new GameEngine(io, false); // Solo escucha eventos
    console.log('GameEngine iniciado como seguidor');
  }
  
  // Hacer GameEngine global para acceso desde sockets
  global.__gameEngine = gameEngine;
  
  httpServer.listen(cfg.PORT, () => {
    console.log(`[${cfg.SERVICE_NAME}] escuchando en ${cfg.PORT}`);
  });
}

startServer().catch((err) => {
  console.error('DB init failed', err);
  process.exit(1);
});
