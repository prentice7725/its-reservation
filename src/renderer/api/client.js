const API_BASE = 'http://localhost:3001/api';
const WS_URL = 'ws://localhost:3001';

class APIClient {
  constructor() {
    this.ws = null;
    this.listeners = {
      log: [],
      status: []
    };
  }

  // WebSocket 연결
  connectWebSocket() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const { type, data } = JSON.parse(event.data);

        if (type === 'execution:log') {
          this.listeners.log.forEach(callback => callback(data));
        } else if (type === 'execution:status') {
          this.listeners.status.forEach(callback => callback(data));
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket closed, reconnecting...');
      setTimeout(() => this.connectWebSocket(), 3000);
    };
  }

  // 이벤트 리스너 등록
  onLog(callback) {
    this.listeners.log.push(callback);
    this.connectWebSocket();

    return () => {
      this.listeners.log = this.listeners.log.filter(cb => cb !== callback);
    };
  }

  onStatusChange(callback) {
    this.listeners.status.push(callback);
    this.connectWebSocket();

    return () => {
      this.listeners.status = this.listeners.status.filter(cb => cb !== callback);
    };
  }

  // 태스크 API
  async getTasks() {
    const response = await fetch(`${API_BASE}/tasks`);
    if (!response.ok) throw new Error('Failed to fetch tasks');
    return response.json();
  }

  async saveTask(task) {
    const response = await fetch(`${API_BASE}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(task)
    });
    if (!response.ok) throw new Error('Failed to save task');
    return response.json();
  }

  async deleteTask(id) {
    const response = await fetch(`${API_BASE}/tasks/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete task');
    return response.json();
  }

  // 실행 API
  async startExecution(taskId) {
    const response = await fetch(`${API_BASE}/execution/start/${taskId}`, {
      method: 'POST'
    });
    if (!response.ok) throw new Error('Failed to start execution');
    return response.json();
  }

  async startAll() {
    const response = await fetch(`${API_BASE}/execution/start-all`, {
      method: 'POST'
    });
    if (!response.ok) throw new Error('Failed to start all executions');
    return response.json();
  }

  async stopExecution(taskId) {
    const response = await fetch(`${API_BASE}/execution/stop/${taskId}`, {
      method: 'POST'
    });
    if (!response.ok) throw new Error('Failed to stop execution');
    return response.json();
  }

  async dryRun(taskId) {
    const response = await fetch(`${API_BASE}/execution/dry-run/${taskId}`, {
      method: 'POST'
    });
    if (!response.ok) throw new Error('Failed to run dry run');
    return response.json();
  }

  // 히스토리 API
  async getHistory() {
    const response = await fetch(`${API_BASE}/history`);
    if (!response.ok) throw new Error('Failed to fetch history');
    return response.json();
  }

  async getScheduleStatus() {
    const response = await fetch(`${API_BASE}/schedule/status`);
    if (!response.ok) throw new Error('Failed to fetch schedule status');
    return response.json();
  }

  async getReservationServerTime() {
    const response = await fetch(`${API_BASE}/reservation/server-time`);
    if (!response.ok) throw new Error('Failed to fetch reservation server time');
    return response.json();
  }

  // 장소 API
  async getPlaces() {
    const response = await fetch(`${API_BASE}/places`);
    if (!response.ok) throw new Error('Failed to fetch places');
    return response.json();
  }

  async savePlaces(places) {
    const response = await fetch(`${API_BASE}/places`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(places)
    });
    if (!response.ok) throw new Error('Failed to save places');
    return response.json();
  }
}

export const apiClient = new APIClient();
