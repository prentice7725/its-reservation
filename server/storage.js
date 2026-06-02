import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { randomUUID } from 'crypto';

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

export async function atomicWriteJson(filePath, value) {
  const tempPath = `${filePath}.${randomUUID()}.tmp`;

  try {
    await fs.writeFile(tempPath, JSON.stringify(value, null, 2), 'utf-8');
    await fs.rename(tempPath, filePath);
  } finally {
    await fs.rm(tempPath, { force: true });
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

  await atomicWriteJson(filePath, tasks);

  return tasks;
}

// 태스크 삭제
export async function deleteTask(id) {
  const tasks = await loadTasks();
  const filtered = tasks.filter(t => t.id !== id);

  await saveTasks(filtered);
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

  await atomicWriteJson(filePath, trimmed);
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

  await atomicWriteJson(filePath, places);
  return places;
}
