import React from 'react';
import { Alert, Box, Button, Chip, Divider, Stack, Typography } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import ScheduleIcon from '@mui/icons-material/Schedule';
import RepeatIcon from '@mui/icons-material/Repeat';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { useTasks } from '../contexts/TaskContext';
import { apiClient } from '../api/client';

function formatDateTime24(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '-';

  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function ExecutionPanel() {
  const { selectedTask } = useTasks();
  const [scheduleStatus, setScheduleStatus] = React.useState(null);
  const [serverTime, setServerTime] = React.useState(null);
  const [dryRunResult, setDryRunResult] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  // 스케줄 상태 주기적으로 업데이트
  React.useEffect(() => {
    const fetchScheduleStatus = async () => {
      try {
        const data = await apiClient.getScheduleStatus();
        setScheduleStatus(data);
      } catch (error) {
        console.error('스케줄 상태 조회 실패:', error);
      }
    };

    fetchScheduleStatus();
    const interval = setInterval(fetchScheduleStatus, 5000); // 5초마다 업데이트

    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    const fetchServerTime = async () => {
      try {
        const data = await apiClient.getReservationServerTime();
        setServerTime(data);
      } catch (error) {
        console.error('서버 시간 조회 실패:', error);
      }
    };

    fetchServerTime();
    const interval = setInterval(fetchServerTime, 30000);

    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    if (!selectedTask) {
      alert('태스크를 선택하세요');
      return;
    }

    try {
      const result = await apiClient.startExecution(selectedTask.id);
      console.log('실행 결과:', result);
      alert('실행이 시작되었습니다');
    } catch (error) {
      console.error('실행 실패:', error);
      alert('실행 실패: ' + error.message);
    }
  };

  const handleStartAll = async () => {
    try {
      const result = await apiClient.startAll();
      console.log('전체 실행 결과:', result);
      alert('전체 실행이 시작되었습니다');
    } catch (error) {
      console.error('전체 실행 실패:', error);
      alert('전체 실행 실패: ' + error.message);
    }
  };

  const handleStop = async () => {
    if (!selectedTask) return;

    try {
      await apiClient.stopExecution(selectedTask.id);
      alert('중단 요청이 전송되었습니다');
    } catch (error) {
      console.error('중단 실패:', error);
    }
  };

  const handleDryRun = async () => {
    if (!selectedTask) {
      alert('태스크를 선택하세요');
      return;
    }

    setBusy(true);
    setDryRunResult(null);

    try {
      const result = await apiClient.dryRun(selectedTask.id);
      setDryRunResult(result);
    } catch (error) {
      console.error('사전 점검 실패:', error);
      setDryRunResult({
        success: false,
        message: error.message,
        results: []
      });
    } finally {
      setBusy(false);
    }
  };

  const formatServerOffset = () => {
    if (!serverTime || serverTime.offsetMs === null || serverTime.offsetMs === undefined) {
      return '서버 시간 확인 불가';
    }

    const offsetMs = Math.round(serverTime.offsetMs);
    const sign = offsetMs >= 0 ? '+' : '';
    return `서버 ${sign}${offsetMs}ms / 왕복 ${serverTime.roundTripMs}ms`;
  };

  const getTaskScheduleInfo = () => {
    if (!selectedTask || !selectedTask.enabled) {
      return null;
    }

    const startMode = selectedTask.startMode;
    const runMode = selectedTask.runMode;

    if (!startMode || !runMode) {
      return null;
    }

    const parts = [];

    // 실행 방식
    if (startMode.type === 'scheduled' && startMode.scheduledTime) {
      const timeStr = formatDateTime24(startMode.scheduledTime);
      parts.push(`${timeStr}에 시작`);
    } else if (startMode.type === 'manual') {
      parts.push('수동 실행');
    }

    // 동작 방식
    if (runMode.type === 'repeat') {
      parts.push(`${runMode.interval || 60}초 반복, 최대 ${runMode.maxRuns || 10}회`);
    } else if (runMode.type === 'cron') {
      parts.push(`정기: ${runMode.cronExpression || '0 9 * * *'}`);
    } else if (runMode.type === 'once') {
      parts.push('한 번만');
    }

    if (parts.length === 0) {
      return null;
    }

    return {
      icon: startMode.type === 'scheduled' ? <ScheduleIcon fontSize="small" /> : <RepeatIcon fontSize="small" />,
      label: parts.join(' / '),
      color: startMode.type === 'scheduled' ? 'warning' : 'primary'
    };
  };

  const scheduleInfo = getTaskScheduleInfo();

  return (
    <Box>
      <Stack spacing={1.5}>
        <Box>
          <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
            실행 제어
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {selectedTask ? selectedTask.name : '태스크를 선택하세요'}
          </Typography>
        </Box>

        {scheduleStatus && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip
              icon={<AccessTimeIcon />}
              label={formatServerOffset()}
              size="small"
              color={serverTime?.offsetMs === null ? 'default' : 'info'}
              variant="outlined"
            />
            <Chip
              icon={<ScheduleIcon />}
              label={`스케줄 ${scheduleStatus.total}`}
              size="small"
              color={scheduleStatus.total > 0 ? 'success' : 'default'}
              variant="outlined"
            />
          </Stack>
        )}

        {scheduleInfo && (
          <Typography variant="caption" color="text.secondary">
            {scheduleInfo.label}
          </Typography>
        )}

        <Divider />

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
        <Button
          variant="contained"
          startIcon={<PlayArrowIcon />}
          onClick={handleStart}
          disabled={!selectedTask}
        >
          즉시 실행
        </Button>

        <Button
          variant="outlined"
          startIcon={<PlayArrowIcon />}
          onClick={handleStartAll}
        >
          전체 실행
        </Button>

        <Button
          variant="outlined"
          startIcon={<FactCheckIcon />}
          onClick={handleDryRun}
          disabled={!selectedTask || busy}
        >
          Dry-run
        </Button>

        <Button
          variant="outlined"
          color="error"
          startIcon={<StopIcon />}
          onClick={handleStop}
          disabled={!selectedTask}
        >
          중단
        </Button>
      </Box>

      {dryRunResult && (
        <Alert severity={dryRunResult.success ? 'success' : 'warning'}>
          {dryRunResult.message}
          {typeof dryRunResult.checkedCount === 'number' && (
            <> ({dryRunResult.checkedCount}/{dryRunResult.totalCount}개 조합 확인)</>
          )}
        </Alert>
      )}
      </Stack>
    </Box>
  );
}

export default ExecutionPanel;
