import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { MongoClient, ReadPreference } from 'mongodb';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { cfg } from './config.js';

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

// Redis adapter
const pub = new Redis({ host: cfg.REDIS_HOST, port: cfg.REDIS_PORT });
const sub = pub.duplicate();
io.adapter(createAdapter(pub, sub));

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

io.on('connection', (socket) => {
  console.log(`[${cfg.SERVICE_NAME}] WS conectado ${socket.id}`);
  socket.emit('hello', { msg: `Conectado a ${cfg.SERVICE_NAME}`, when: new Date().toISOString() });
  socket.on('disconnect', (reason) => {
    console.log(`[${cfg.SERVICE_NAME}] WS desconectado ${socket.id} (${reason})`);
  });
});

initDb().then(() => {
  httpServer.listen(cfg.PORT, () => {
    console.log(`[${cfg.SERVICE_NAME}] escuchando en ${cfg.PORT}`);
  });
}).catch((err) => {
  console.error('DB init failed', err);
  process.exit(1);
});
