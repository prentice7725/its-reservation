import React from 'react';
import {
  Alert,
  IconButton,
  Typography,
  Button,
  Box,
  Chip,
  Divider,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AlarmIcon from '@mui/icons-material/Alarm';
import SearchIcon from '@mui/icons-material/Search';
import { v4 as uuidv4 } from 'uuid';
import { useTasks } from '../contexts/TaskContext';

function getCombinationCount(task) {
  const dateCount = task?.dates?.length || 0;
  const placeCount = task?.placeMode === 'all' ? 1 : task?.places?.length || 0;
  return dateCount * placeCount;
}

function getTaskState(task) {
  if (!task.name || !task.dates?.length || ((task.placeMode || 'selected') === 'selected' && !task.places?.length)) {
    return { label: '설정 오류', color: 'error' };
  }
  if (task.startMode?.type === 'scheduled' && task.startMode.scheduledTime) {
    const scheduled = new Date(task.startMode.scheduledTime).getTime();
    if (Number.isFinite(scheduled) && scheduled < Date.now()) {
      return { label: '과거 스케줄', color: 'warning' };
    }
  }
  if (getCombinationCount(task) > 100) {
    return { label: '조합 초과', color: 'warning' };
  }
  if (task.enabled) return { label: '준비 가능', color: 'success' };
  return { label: '비활성', color: 'default' };
}

function TaskList() {
  const { tasks, selectedTask, setSelectedTask, saveTask, deleteTask } = useTasks();
  const [query, setQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [methodFilter, setMethodFilter] = React.useState('all');

  const handleNewTask = () => {
    setSelectedTask({
      id: null,
      name: '새 태스크',
      enabled: true,
      method: 'http',
      email: null,
      numRooms: 2,
      peoplePerRoom: [3, 3],
      dates: [],
      places: [],
      placeMode: 'selected',
      startMode: {
        type: 'manual',
        scheduledTime: null,
      },
      runMode: {
        type: 'once',
        interval: 60,
        maxRuns: 10,
        cronExpression: '0 9 * * *',
      },
      burstRetry: {
        enabled: false,
        maxAttempts: 10,
        intervalMs: 300,
        maxDurationMs: 10000,
        retryNoRooms: false,
      },
    });
  };

  const handleDelete = async (id, event) => {
    event.stopPropagation();
    if (confirm('정말 이 태스크를 삭제하시겠습니까?')) {
      await deleteTask(id);
    }
  };

  const handleCopyTask = async (task, event) => {
    event.stopPropagation();

    const copiedTask = {
      ...JSON.parse(JSON.stringify(task)),
      id: uuidv4(),
      name: `${task.name || '태스크'} 복사본`,
      createdAt: undefined,
      updatedAt: undefined,
    };

    const success = await saveTask(copiedTask);
    if (success) {
      setSelectedTask(copiedTask);
    } else {
      alert('태스크 복사 실패');
    }
  };

  const filteredTasks = tasks.filter((task) => {
    const keyword = query.trim().toLowerCase();
    const state = getTaskState(task);
    const matchesQuery = !keyword
      || (task.name || '').toLowerCase().includes(keyword)
      || (task.email || '').toLowerCase().includes(keyword);
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'enabled' && task.enabled)
      || (statusFilter === 'disabled' && !task.enabled)
      || state.color === statusFilter;
    const matchesMethod = methodFilter === 'all' || task.method === methodFilter;

    return matchesQuery && matchesStatus && matchesMethod;
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
        <Box>
          <Typography variant="h6">태스크</Typography>
          <Typography variant="caption" color="text.secondary">
            예약 후보와 실행 준비 상태
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={handleNewTask}
        >
          새 태스크
        </Button>
      </Box>

      <TextField
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="태스크명 또는 이메일 검색"
        size="small"
        fullWidth
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
      />

      <Stack direction="row" spacing={1}>
        <TextField
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          select
          size="small"
          fullWidth
        >
          <MenuItem value="all">전체 상태</MenuItem>
          <MenuItem value="enabled">활성</MenuItem>
          <MenuItem value="disabled">비활성</MenuItem>
          <MenuItem value="success">준비 가능</MenuItem>
          <MenuItem value="warning">주의 필요</MenuItem>
          <MenuItem value="error">설정 오류</MenuItem>
        </TextField>
        <TextField
          value={methodFilter}
          onChange={(event) => setMethodFilter(event.target.value)}
          select
          size="small"
          fullWidth
        >
          <MenuItem value="all">전체 방식</MenuItem>
          <MenuItem value="http">HTTP</MenuItem>
          <MenuItem value="playwright">Playwright</MenuItem>
        </TextField>
      </Stack>

      {tasks.length === 0 ? (
        <Alert severity="info">아직 예약 태스크가 없습니다.</Alert>
      ) : filteredTasks.length === 0 ? (
        <Alert severity="warning">조건에 맞는 태스크가 없습니다.</Alert>
      ) : (
        <Stack spacing={1}>
          {filteredTasks.map((task) => {
            const state = getTaskState(task);
            const combinationCount = getCombinationCount(task);

            return (
              <Paper
                key={task.id}
                variant="outlined"
                onClick={() => setSelectedTask(task)}
                sx={{
                  p: 1.25,
                  cursor: 'pointer',
                  borderColor: selectedTask?.id === task.id ? 'primary.main' : 'divider',
                  bgcolor: selectedTask?.id === task.id ? '#eef6fc' : 'background.paper',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Stack spacing={0.75}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={800} noWrap>
                        {task.enabled ? '● ' : '○ '}
                        {task.name || '이름 없음'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {task.email || '이메일 미설정'}
                      </Typography>
                    </Box>
                    <Chip label={state.label} size="small" color={state.color} />
                  </Box>

                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="caption" color="text.secondary">
                      {task.method?.toUpperCase()} · 날짜 {task.dates?.length || 0} · {task.placeMode === 'all' ? '장소 전체' : `장소 ${task.places?.length || 0}`} · 조합 {combinationCount}
                    </Typography>
                    {task.startMode?.type === 'scheduled' && (
                      <Chip
                        icon={<AlarmIcon />}
                        label={task.startMode.scheduledTime
                          ? new Date(task.startMode.scheduledTime).toLocaleString('ko-KR', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                          : '예약'}
                        size="small"
                        color="warning"
                        variant="outlined"
                      />
                    )}
                  </Stack>

                  <Divider sx={{ my: 0.25 }} />

                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <Tooltip title="태스크 복사">
                      <IconButton size="small" onClick={(e) => handleCopyTask(task, e)} aria-label="태스크 복사">
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="태스크 삭제">
                      <IconButton size="small" color="error" onClick={(e) => handleDelete(task.id, e)} aria-label="태스크 삭제">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}

export default TaskList;
