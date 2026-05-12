import 'dotenv/config';
import dns from 'node:dns';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import todosRouter from './routes/todos.js';

// MongoDB Atlas(`mongodb+srv://`)는 SRV 조회를 사용하는데,
// Windows + Node 18+ 환경에서 c-ares가 시스템 DNS 서버를 못 찾는 이슈가 있음.
// Heroku 등 Linux는 직접 공용 DNS로 바꾸면 SRV 조회가 실패하는 경우가 있어 Windows에서만 적용.
if (process.platform === 'win32') {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
}

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/todo';

function maskMongoUri(uri) {
  return uri.replace(/(:\/\/[^:]+:)([^@]+)(@)/, '$1****$3');
}

console.log(
  `[env] MONGODB_URI ${process.env.MONGODB_URI ? '로드됨' : '미설정 → 기본값 사용'}: ${maskMongoUri(MONGODB_URI)}`
);

const corsOptions = {
  origin: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Todo backend is running' });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

app.use('/api/todos', todosRouter);
// 단수 경로 별칭 (기존 클라이언트·문서와 호환)
app.use('/api/todo', todosRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

async function start() {
  // Heroku는 앱이 PORT에 바인딩될 때까지 헬스 체크를 보냄. DB 연결이 늦어도 먼저 리슨해야 503/H20을 피함.
  await new Promise((resolve) => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`HTTP 리슨 시작 - port: ${PORT} (NODE_ENV=${process.env.NODE_ENV ?? 'undefined'})`);
      resolve();
    });
  });

  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 30_000 });
    const { host, port, name } = mongoose.connection;
    console.log(
      `몽고디비 연결 성공 (host: ${host}, port: ${port}, db: ${name})`
    );
  } catch (err) {
    console.error('몽고디비 연결 실패:', err.message);
    process.exit(1);
  }
}

start();
