import React from 'react';
import { Alert, Box, Button, Chip, Stack, Typography } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import ScheduleIcon from '@mui/icons-material/Schedule';
import RepeatIcon from '@mui/icons-material/Repeat';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { useTasks } from '../contexts/TaskContext';
import { apiClient } from '../api/client';

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
      const timeStr = new Date(startMode.scheduledTime).toLocaleString('ko-KR');
      parts.push(`${timeStr}에 시작`);
    } else if (startMode.type === 'manual') {
      parts.push('수동 실행');
    }

    // 동작 방식
    if (runMode.type === 'repeat') {
      parts.push(`${runMode.interval}초 반복`);
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          실행 제어
        </Typography>

        {scheduleStatus && (
          <Stack direction="row" spacing={1}>
            <Chip
              icon={<AccessTimeIcon />}
              label={formatServerOffset()}
              size="small"
              color={serverTime?.offsetMs === null ? 'default' : 'info'}
              variant="outlined"
            />
            <Chip
              icon={<ScheduleIcon />}
              label={`활성 스케줄: ${scheduleStatus.total}개`}
              size="small"
              color={scheduleStatus.total > 0 ? 'success' : 'default'}
            />
          </Stack>
        )}
      </Box>

      {scheduleInfo && (
        <Box sx={{ mb: 2 }}>
          <Chip
            icon={scheduleInfo.icon}
            label={`자동 실행: ${scheduleInfo.label}`}
            color={scheduleInfo.color}
            variant="outlined"
          />
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          startIcon={<PlayArrowIcon />}
          onClick={handleStart}
          disabled={!selectedTask}
        >
          즉시 실행
        </Button>

        <Button
          variant="contained"
          color="secondary"
          startIcon={<PlayArrowIcon />}
          onClick={handleStartAll}
        >
          전체 즉시 실행
        </Button>

        <Button
          variant="outlined"
          startIcon={<FactCheckIcon />}
          onClick={handleDryRun}
          disabled={!selectedTask || busy}
        >
          사전 점검
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
        <Alert severity={dryRunResult.success ? 'success' : 'warning'} sx={{ mt: 2 }}>
          {dryRunResult.message}
          {typeof dryRunResult.checkedCount === 'number' && (
            <> ({dryRunResult.checkedCount}/{dryRunResult.totalCount}개 조합 확인)</>
          )}
        </Alert>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        <strong>실행 방식:</strong> 수동 (버튼 클릭) / 특정 시간 (예: 사이트 오픈 시간)
        <br />
        <strong>동작 방식:</strong> 한 번만 / 간격 반복 (N초마다) / 정기 스케줄 (Cron)
        <br />
        <strong>전체 실행:</strong> 활성화된 모든 태스크를 동시에 실행
      </Typography>
    </Box>
  );
}

export default ExecutionPanel;
