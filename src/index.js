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
app.set('trust proxy', 1);
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
  if (req.accepts('html')) {
    const base = `${req.protocol}://${req.get('host')}`;
    res.type('html').send(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Todo API</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #111; }
    code { background: #f4f4f5; padding: 0.15rem 0.35rem; border-radius: 4px; font-size: 0.9em; }
    a { color: #2563eb; }
    .box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem 1.25rem; margin: 1rem 0; }
  </style>
</head>
<body>
  <h1>Todo 백엔드 API</h1>
  <p>이 사이트는 <strong>API 서버</strong>입니다. JSON 메시지(연결됨)만 보이는 것이 정상이며, <strong>할일 화면(React)은 별도 앱</strong>입니다.</p>
  <div class="box">
    <p><strong>로컬에서 할일 UI 쓰기</strong></p>
    <ol>
      <li>프로젝트 <code>todo_react</code>에서 <code>npm run dev</code></li>
      <li><code>.env</code>의 <code>VITE_API_BASE_URL</code>을 이 주소(<code>${base}</code>)로 설정</li>
      <li>브라우저에서 Vite 주소(보통 <code>http://localhost:5173</code>)로 접속</li>
    </ol>
  </div>
  <p><strong>API 링크</strong></p>
  <ul>
    <li><a href="${base}/health">/health</a></li>
    <li><a href="${base}/api/todos">/api/todos</a></li>
  </ul>
</body>
</html>`);
    return;
  }
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
