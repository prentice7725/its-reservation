import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';
import { loadTasks, saveTasks, deleteTask, loadHistory, saveHistory, loadPlaces, savePlaces } from './storage.js';
import { ReservationExecutor } from './reservation-executor.js';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// HTTP 서버 생성
const server = http.createServer(app);

// WebSocket 서버 생성 (실시간 로그용)
const wss = new WebSocketServer({ server });

// WebSocket 연결 관리
const clients = new Set();

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  clients.add(ws);

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// 모든 클라이언트에게 메시지 브로드캐스트
function broadcast(type, data) {
  const message = JSON.stringify({ type, data });
  clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  });
}

// ReservationExecutor는 WebSocket을 통해 로그를 전송
class WebExecutor extends ReservationExecutor {
  constructor() {
    super(null); // mainWindow는 null
  }

  sendLog(level, message) {
    const log = {
      timestamp: new Date().toISOString(),
      level,
      message
    };
    broadcast('execution:log', log);
  }

  sendStatus(taskId, status) {
    broadcast('execution:status', { taskId, status });
  }
}

const executor = new WebExecutor();

// ============ API 엔드포인트 ============

// 태스크 관리
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await loadTasks();
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const task = req.body;
    const tasks = await loadTasks();

    let savedTask;

    if (task.id) {
      // 기존 태스크 업데이트
      const index = tasks.findIndex(t => t.id === task.id);
      if (index !== -1) {
        savedTask = { ...task, updatedAt: new Date().toISOString() };
        tasks[index] = savedTask;
      } else {
        savedTask = { ...task, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        tasks.push(savedTask);
      }
    } else {
      // 새 태스크
      savedTask = {
        ...task,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      tasks.push(savedTask);
    }

    await saveTasks(tasks);

    // 스케줄 재등록
    const shouldSchedule = savedTask.enabled && savedTask.startMode && savedTask.runMode && (
      savedTask.startMode.type === 'scheduled' ||
      (savedTask.startMode.type === 'manual' && (savedTask.runMode.type === 'repeat' || savedTask.runMode.type === 'cron'))
    );

    if (shouldSchedule) {
      executor.startSchedule(savedTask);
    } else {
      executor.stopSchedule(savedTask.id);
    }

    res.json(savedTask);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const taskId = req.params.id;

    // 스케줄 중단
    executor.stopSchedule(taskId);

    await deleteTask(taskId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 실행 제어
app.post('/api/execution/start/:taskId', async (req, res) => {
  try {
    const result = await executor.executeTask(req.params.taskId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/execution/start-all', async (req, res) => {
  try {
    const result = await executor.executeAll();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/execution/stop/:taskId', async (req, res) => {
  try {
    const stopped = executor.stopTask(req.params.taskId);
    res.json({
      success: stopped,
      message: stopped ? '중단 요청이 전송되었습니다' : '실행 중인 태스크가 아닙니다'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/execution/dry-run/:taskId', async (req, res) => {
  try {
    const result = await executor.dryRunTask(req.params.taskId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 히스토리
app.get('/api/history', async (req, res) => {
  try {
    const history = await loadHistory();
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 장소 관리
app.get('/api/places', async (req, res) => {
  try {
    const places = await loadPlaces();
    res.json(places);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/places', async (req, res) => {
  try {
    const places = req.body;
    await savePlaces(places);
    res.json(places);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 스케줄 상태 조회
app.get('/api/schedule/status', (_req, res) => {
  try {
    const status = executor.getScheduleStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reservation/server-time', async (_req, res) => {
  try {
    const result = await executor.getServerTimeStatus();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 서버 시작
server.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket server running on ws://localhost:${PORT}`);

  // 스케줄 초기화
  await executor.initializeSchedules();
  console.log('Schedules initialized');
});
