import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 데이터 디렉토리 경로 (프로젝트 루트의 data 폴더)
const getDataPath = () => {
  return path.join(__dirname, '..', 'data');
};

const TASKS_FILE = 'tasks.json';
const HISTORY_FILE = 'history.json';
const PLACES_FILE = 'places.json';

// 데이터 디렉토리 초기화
async function ensureDataDirectory() {
  const dataPath = getDataPath();
  try {
    await fs.access(dataPath);
  } catch {
    await fs.mkdir(dataPath, { recursive: true });
  }
}

// 태스크 로드
export async function loadTasks() {
  await ensureDataDirectory();
  const filePath = path.join(getDataPath(), TASKS_FILE);

  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // 파일이 없으면 빈 배열 반환
    return [];
  }
}

// 태스크 저장 (전체 목록 저장)
export async function saveTasks(tasks) {
  await ensureDataDirectory();
  const filePath = path.join(getDataPath(), TASKS_FILE);

  // 원자적 쓰기 (임시 파일 + rename)
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(tasks, null, 2), 'utf-8');
  await fs.rename(tempPath, filePath);

  return tasks;
}

// 태스크 삭제
export async function deleteTask(id) {
  await ensureDataDirectory();
  const filePath = path.join(getDataPath(), TASKS_FILE);

  const tasks = await loadTasks();
  const filtered = tasks.filter(t => t.id !== id);

  await fs.writeFile(filePath, JSON.stringify(filtered, null, 2), 'utf-8');
  return true;
}

// 히스토리 로드
export async function loadHistory() {
  await ensureDataDirectory();
  const filePath = path.join(getDataPath(), HISTORY_FILE);

  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// 히스토리 저장
export async function saveHistory(entry) {
  await ensureDataDirectory();
  const filePath = path.join(getDataPath(), HISTORY_FILE);

  const history = await loadHistory();
  history.push(entry);

  // 최근 100개만 유지
  const trimmed = history.slice(-100);

  await fs.writeFile(filePath, JSON.stringify(trimmed, null, 2), 'utf-8');
  return entry;
}

// 장소 로드
export async function loadPlaces() {
  await ensureDataDirectory();
  const filePath = path.join(getDataPath(), PLACES_FILE);

  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    // 기본 장소 목록 (객체 형태)
    return {};
  }
}

// 장소 저장
export async function savePlaces(places) {
  await ensureDataDirectory();
  const filePath = path.join(getDataPath(), PLACES_FILE);

  await fs.writeFile(filePath, JSON.stringify(places, null, 2), 'utf-8');
  return places;
}
