import { loadTasks, saveHistory, loadPlaces } from './storage.js';
import {
  dryRunHTTPReservation,
  getReservationServerTime,
  runHTTPReservation,
  Semaphore
} from '../src/reservation/http-reservation.js';
import { runPlaywrightReservation } from '../src/reservation/playwright-reservation.js';
import { v4 as uuidv4 } from 'uuid';
import schedule from 'node-schedule';
import { shouldRegisterSchedule } from './task-schedule-policy.js';

export class ReservationExecutor {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.runningTasks = new Map();
    this.scheduledJobs = new Map(); // 스케줄된 작업들
    this.repeatIntervals = new Map(); // 반복 실행 인터벌들
  }

  // 조합 생성 (places × dates)
  async generateCombinations(task) {
    const combinations = [];
    const allPlaces = await loadPlaces();
    const legacyUsesAllPlaces = !task.placeMode && (!task.places || task.places.length === 0);
    const usesAllPlaces = task.placeMode === 'all' || legacyUsesAllPlaces;
    const places = usesAllPlaces ? Object.keys(allPlaces) : (task.places || []);

    for (const place of places) {
      for (const date of task.dates) {
        combinations.push({ place, date });
      }
    }

    return combinations;
  }

  createReservationConfig(task, allPlaces, place, date, signal = null) {
    const placeInfo = allPlaces[place];

    return {
      place,
      date,
      numPeople: (task.peoplePerRoom || []).reduce((a, b) => a + b, 0),
      emailAddr: task.email || 'default@example.com',
      numRooms: task.numRooms,
      peoplePerRoom: task.peoplePerRoom || [],
      nightCount: 1,
      queryStringing: placeInfo?.queryString || placeInfo?.s || '',
      signal,
      burstRetry: task.burstRetry || null,
    };
  }

  // 단일 태스크 실행
  async executeTask(taskId) {
    if (this.runningTasks.has(taskId)) {
      this.sendLog('warning', `태스크 ${taskId}는 이미 실행 중입니다`);
      return { success: false, message: '이미 실행 중입니다', status: 'already_running' };
    }

    const tasks = await loadTasks();
    const task = tasks.find(t => t.id === taskId);

    if (!task) {
      this.sendLog('error', `태스크 ${taskId}를 찾을 수 없습니다`);
      return { success: false, message: '태스크를 찾을 수 없습니다' };
    }

    this.sendLog('info', `태스크 "${task.name}" 실행 시작`);
    this.sendStatus(taskId, 'running');

    const controller = new AbortController();
    this.runningTasks.set(taskId, {
      controller,
      startedAt: new Date().toISOString()
    });

    const combinations = await this.generateCombinations(task);
    const maxConcurrency = this.getTaskConcurrency(combinations.length);
    const semaphore = new Semaphore(maxConcurrency);
    const startTime = Date.now();

    const historyEntry = {
      id: uuidv4(),
      taskId: task.id,
      taskName: task.name,
      status: 'running',
      startedAt: new Date().toISOString(),
      completedAt: null,
      results: [],
      logs: []
    };

    this.sendLog('info', `${combinations.length}개 조합 실행 (동시 실행 ${maxConcurrency})`);

    // places 정보 가져오기 (queryString 필요)
    const allPlaces = await loadPlaces();

    // 실행 함수
    const executeReservation = async ({ place, date }) => {
      const acquired = await semaphore.acquire(controller.signal);
      if (!acquired) {
        return { place, date, result: 'cancelled' };
      }

      try {
        if (controller.signal.aborted) {
          return { place, date, result: 'cancelled' };
        }

        const config = this.createReservationConfig(task, allPlaces, place, date, controller.signal);

        const onLog = (level, message) => {
          this.sendLog(level, message);
          historyEntry.logs.push({
            timestamp: new Date().toISOString(),
            level,
            message
          });
        };

        let result;
        if (task.method === 'http') {
          result = await runHTTPReservation(config, onLog);
        } else {
          result = await runPlaywrightReservation(config, onLog);
        }

        historyEntry.results.push({
          place,
          date,
          result,
          message: this.getResultMessage(result),
          timestamp: new Date().toISOString()
        });

        return { place, date, result };
      } finally {
        semaphore.release();
      }
    };

    try {
      // 병렬 실행
      const promises = combinations.map(({ place, date }) => executeReservation({ place, date }));
      const results = await Promise.allSettled(promises);

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

      const successCount = results.filter(r =>
        r.status === 'fulfilled' && r.value.result === 'success'
      ).length;

      const cancelledCount = results.filter(r =>
        r.status === 'fulfilled' && r.value.result === 'cancelled'
      ).length;

      const failedCount = results.length - successCount - cancelledCount;
      const wasCancelled = controller.signal.aborted;

      const completionMessage = wasCancelled
        ? `중단됨: ${totalTime}초 | 성공 ${successCount} | 실패 ${failedCount} | 중단 ${cancelledCount}`
        : `완료: ${totalTime}초 | 성공 ${successCount} | 실패 ${failedCount}`;

      this.sendLog(wasCancelled ? 'warning' : 'info', completionMessage);

      // 히스토리 저장
      historyEntry.completedAt = new Date().toISOString();
      historyEntry.status = wasCancelled
        ? 'cancelled'
        : successCount > 0 ? (failedCount > 0 ? 'partial' : 'success') : 'failed';
      await saveHistory(historyEntry);

      this.sendStatus(taskId, wasCancelled ? 'cancelled' : 'completed');

      return {
        success: !wasCancelled,
        status: historyEntry.status,
        successCount,
        failedCount,
        cancelledCount,
        totalTime
      };
    } finally {
      this.runningTasks.delete(taskId);
    }
  }

  // 전체 태스크 동시 실행
  async executeAll() {
    const tasks = await loadTasks();
    const enabledTasks = tasks.filter(t => t.enabled);

    this.sendLog('info', `전체 실행: ${enabledTasks.length}개 태스크 동시 실행`);

    // 모든 태스크를 동시에 실행
    const promises = enabledTasks.map(task => this.executeTask(task.id));
    const results = await Promise.allSettled(promises);

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failedCount = results.length - successCount;

    this.sendLog('info', `전체 실행 완료: 성공 ${successCount}, 실패 ${failedCount}`);

    return {
      success: true,
      count: enabledTasks.length,
      successCount,
      failedCount,
      results: results.map((r, i) => ({
        taskId: enabledTasks[i].id,
        taskName: enabledTasks[i].name,
        status: r.status,
        result: r.status === 'fulfilled' ? r.value : { error: r.reason?.message }
      }))
    };
  }

  async dryRunTask(taskId) {
    const tasks = await loadTasks();
    const task = tasks.find(t => t.id === taskId);

    if (!task) {
      return { success: false, message: '태스크를 찾을 수 없습니다', results: [] };
    }

    if (task.method !== 'http') {
      return {
        success: false,
        message: 'Dry Run은 HTTP 방식 태스크에서만 지원됩니다',
        results: []
      };
    }

    const allPlaces = await loadPlaces();
    const combinations = await this.generateCombinations(task);
    const limitedCombinations = combinations.slice(0, 10);
    const results = [];

    this.sendLog('info', `[점검] "${task.name}" 사전 점검 시작 (${limitedCombinations.length}/${combinations.length}개 조합)`);

    for (const { place, date } of limitedCombinations) {
      const config = this.createReservationConfig(task, allPlaces, place, date);
      const result = await dryRunHTTPReservation(config, (level, message) => this.sendLog(level, message));
      results.push({ place, date, ...result });
    }

    const success = results.length > 0 && results.every((result) => result.success);
    this.sendLog(success ? 'info' : 'warning', `[점검] "${task.name}" ${success ? '통과' : '확인 필요'}`);

    return {
      success,
      message: success ? '사전 점검 통과' : '확인이 필요한 항목이 있습니다',
      checkedCount: limitedCombinations.length,
      totalCount: combinations.length,
      results,
    };
  }

  async getServerTimeStatus() {
    return getReservationServerTime();
  }

  // 태스크 중단
  stopTask(taskId) {
    const runningTask = this.runningTasks.get(taskId);

    if (!runningTask) {
      this.sendLog('warning', `태스크 ${taskId}는 실행 중이 아닙니다`);
      return false;
    }

    runningTask.controller.abort();
    this.sendLog('warning', `태스크 ${taskId} 중단 요청`);
    this.sendStatus(taskId, 'stopping');

    return true;
  }

  // 결과 메시지 변환
  getResultMessage(result) {
    const messages = {
      'success': '예약 성공',
      'no_rooms': '방 없음',
      'insufficient_rooms': '방 부족',
      'date_not_available': '날짜 불가',
      'empty': '만실',
      'error': '오류 발생',
      'cancelled': '중단됨'
    };
    return messages[result] || result;
  }

  getTaskConcurrency(combinationCount) {
    return Math.max(1, Math.min(combinationCount, 100));
  }

  getRepeatMaxRuns(runMode) {
    const maxRuns = Number.parseInt(runMode?.maxRuns ?? 10, 10);

    if (!Number.isFinite(maxRuns)) {
      return 10;
    }

    return Math.max(1, Math.min(maxRuns, 10000));
  }

  sendLog(level, message) {
    const log = {
      timestamp: new Date().toISOString(),
      level,
      message
    };

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('execution:log', log);
    }
  }

  sendStatus(taskId, status) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('execution:status', { taskId, status });
    }
  }

  // ============ 스케줄 관리 ============

  // 태스크의 스케줄 시작
  startSchedule(task) {
    // 이미 스케줄이 있으면 먼저 제거
    this.stopSchedule(task.id);

    if (!task.enabled || !task.startMode || !task.runMode) {
      return;
    }

    const { startMode, runMode } = task;

    // 실행 함수 정의 (runMode에 따라)
    const executeFunction = async () => {
      this.sendLog('info', `[자동] 태스크 "${task.name}" 실행`);
      await this.executeTask(task.id);
    };

    const startRepeat = (runImmediately = false) => {
      const intervalSeconds = Number.parseInt(runMode.interval, 10) || 60;
      const intervalMs = intervalSeconds * 1000;
      const maxRuns = this.getRepeatMaxRuns(runMode);
      let runCount = 0;
      let intervalId = null;

      const executeRepeat = async () => {
        runCount += 1;

        if (runCount >= maxRuns && intervalId) {
          clearInterval(intervalId);
          this.repeatIntervals.delete(task.id);
        }

        this.sendLog('info', `태스크 "${task.name}" 반복 실행 ${runCount}/${maxRuns}`);
        await executeFunction();

        if (runCount >= maxRuns) {
          this.sendLog('info', `태스크 "${task.name}" 반복 실행 완료 (${maxRuns}회)`);
        }
      };

      this.sendLog('info', `태스크 "${task.name}" 반복 실행 시작 (${intervalSeconds}초 간격, 최대 ${maxRuns}회)`);

      if (runImmediately) {
        executeRepeat();
      }

      if (runCount < maxRuns) {
        intervalId = setInterval(executeRepeat, intervalMs);
        this.repeatIntervals.set(task.id, intervalId);
      }
    };

    // startMode에 따라 시작 시점 결정
    if (startMode.type === 'scheduled') {
      // 특정 시간에 시작
      if (!startMode.scheduledTime) {
        this.sendLog('error', `태스크 "${task.name}" 실행 시간이 설정되지 않았습니다`);
        return;
      }

      const startTime = new Date(startMode.scheduledTime);
      const now = new Date();

      if (startTime <= now) {
        this.sendLog('warning', `태스크 "${task.name}" 실행 시간이 과거입니다 (${startMode.scheduledTime})`);
        return;
      }

      const timeUntilStart = startTime - now;
      const hours = Math.floor(timeUntilStart / 3600000);
      const minutes = Math.floor((timeUntilStart % 3600000) / 60000);

      this.sendLog('info', `태스크 "${task.name}" 예약 등록 (${startMode.scheduledTime}) - ${hours}시간 ${minutes}분 후 시작`);

      // 특정 시간에 실행을 시작하는 작업 예약
      const startJob = schedule.scheduleJob(startTime, () => {
        this.sendLog('info', `[예약시작] 태스크 "${task.name}" 실행 시작`);

        // runMode에 따라 동작
        if (runMode.type === 'once') {
          // 한 번만 실행
          executeFunction();
          this.scheduledJobs.delete(task.id);
        } else if (runMode.type === 'repeat') {
          // 간격 반복 시작
          startRepeat(true);
          this.scheduledJobs.delete(task.id); // 시작 작업은 제거
        } else if (runMode.type === 'cron') {
          // Cron 스케줄 시작
          const cronExpr = runMode.cronExpression || '0 9 * * *';
          this.sendLog('info', `태스크 "${task.name}" Cron 스케줄 시작 (${cronExpr})`);

          const cronJob = schedule.scheduleJob(cronExpr, executeFunction);
          this.scheduledJobs.set(task.id, cronJob);
        }
      });

      this.scheduledJobs.set(task.id, startJob);

    } else if (startMode.type === 'manual') {
      // 수동 실행이지만 runMode가 repeat 또는 cron이면 활성화 시 바로 시작
      if (runMode.type === 'repeat') {
        startRepeat(false);

      } else if (runMode.type === 'cron') {
        const cronExpr = runMode.cronExpression || '0 9 * * *';
        this.sendLog('info', `태스크 "${task.name}" Cron 스케줄 등록 (${cronExpr})`);

        const cronJob = schedule.scheduleJob(cronExpr, executeFunction);
        this.scheduledJobs.set(task.id, cronJob);
      }
      // runMode가 'once'이면 아무것도 하지 않음 (완전 수동)
    }
  }

  // 태스크의 스케줄 중단
  stopSchedule(taskId) {
    // 반복 인터벌 제거
    if (this.repeatIntervals.has(taskId)) {
      clearInterval(this.repeatIntervals.get(taskId));
      this.repeatIntervals.delete(taskId);
      this.sendLog('info', `태스크 ${taskId} 반복 실행 중단`);
    }

    // Cron 작업 제거
    if (this.scheduledJobs.has(taskId)) {
      this.scheduledJobs.get(taskId).cancel();
      this.scheduledJobs.delete(taskId);
      this.sendLog('info', `태스크 ${taskId} 스케줄 중단`);
    }
  }

  // 모든 활성화된 태스크의 스케줄 초기화
  async initializeSchedules() {
    const tasks = await loadTasks();
    const schedulableTasks = tasks.filter(shouldRegisterSchedule);

    this.sendLog('info', `스케줄 초기화: ${schedulableTasks.length}개 태스크`);

    for (const task of schedulableTasks) {
      this.startSchedule(task);
    }
  }

  // 모든 스케줄 중단
  stopAllSchedules() {
    this.repeatIntervals.forEach((intervalId, taskId) => {
      clearInterval(intervalId);
    });
    this.repeatIntervals.clear();

    this.scheduledJobs.forEach((job, taskId) => {
      job.cancel();
    });
    this.scheduledJobs.clear();

    this.sendLog('info', '모든 스케줄 중단');
  }

  // 스케줄 상태 조회
  getScheduleStatus() {
    const repeatTasks = Array.from(this.repeatIntervals.keys());
    const scheduledTasks = Array.from(this.scheduledJobs.keys());

    return {
      repeat: repeatTasks,
      schedule: scheduledTasks,
      total: repeatTasks.length + scheduledTasks.length
    };
  }
}
