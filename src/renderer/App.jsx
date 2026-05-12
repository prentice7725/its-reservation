import React from 'react';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  CssBaseline,
  Divider,
  Grid,
  LinearProgress,
  Paper,
  Stack,
  Tab,
  Tabs,
  ThemeProvider,
  Toolbar,
  Typography,
  createTheme,
} from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { TaskProvider, useTasks } from './contexts/TaskContext';
import TaskList from './components/TaskList';
import TaskEditor from './components/TaskEditor';
import ExecutionPanel from './components/ExecutionPanel';
import LogViewer from './components/LogViewer';
import HistoryViewer from './components/HistoryViewer';
import PlaceManager from './components/PlaceManager';

const theme = createTheme({
  palette: {
    mode: 'light',
    background: {
      default: '#f6f8fb',
      paper: '#ffffff',
    },
    primary: {
      main: '#1d5f8f',
    },
    success: {
      main: '#11845b',
    },
    warning: {
      main: '#b76b00',
    },
    error: {
      main: '#c83532',
    },
    text: {
      primary: '#17202a',
      secondary: '#667085',
    },
    divider: '#d8e0ea',
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'system-ui',
      'sans-serif',
    ].join(','),
    h5: {
      fontWeight: 800,
      letterSpacing: 0,
    },
    h6: {
      fontWeight: 800,
    },
    button: {
      fontWeight: 800,
      textTransform: 'none',
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 700,
        },
      },
    },
  },
});

function formatClock(date) {
  return date.toLocaleTimeString('en-GB', { hour12: false });
}

function getCombinationCount(task) {
  const dateCount = task?.dates?.length || 0;
  const placeCount = task?.placeMode === 'all' ? 1 : task?.places?.length || 0;
  return dateCount * placeCount;
}

function isPastSchedule(task) {
  if (task?.startMode?.type !== 'scheduled' || !task.startMode.scheduledTime) return false;
  const scheduled = new Date(task.startMode.scheduledTime).getTime();
  return Number.isFinite(scheduled) && scheduled < Date.now();
}

function getRiskItems(tasks) {
  return tasks.flatMap((task) => {
    const items = [];
    if (!task.name) items.push(`${task.id}: 태스크 이름 누락`);
    if (!task.email) items.push(`${task.name || task.id}: 이메일 미설정`);
    if (!task.dates?.length) items.push(`${task.name || task.id}: 날짜 없음`);
    if ((task.placeMode || 'selected') === 'selected' && !task.places?.length) {
      items.push(`${task.name || task.id}: 장소 없음`);
    }
    if (isPastSchedule(task)) items.push(`${task.name || task.id}: 과거 스케줄`);
    if (getCombinationCount(task) > 100) items.push(`${task.name || task.id}: 조합 100개 초과`);
    return items;
  });
}

function AppShell() {
  const { tasks, selectedTask, setSelectedTask } = useTasks();
  const [view, setView] = React.useState('dashboard');
  const [placesVersion, setPlacesVersion] = React.useState(0);
  const [serverTime, setServerTime] = React.useState(new Date());

  React.useEffect(() => {
    const timer = setInterval(() => setServerTime(new Date()), 100);
    return () => clearInterval(timer);
  }, []);

  const handlePlacesChanged = React.useCallback(() => {
    setPlacesVersion((version) => version + 1);
  }, []);

  const scheduleCount = tasks.filter((task) => task.startMode?.type === 'scheduled').length;
  const activeCount = tasks.filter((task) => task.enabled).length;
  const showExecutionPanel = Boolean(selectedTask) && view === 'tasks';

  const handleViewChange = React.useCallback((nextView) => {
    setView(nextView);
    if (nextView !== 'tasks') {
      setSelectedTask(null);
    }
  }, [setSelectedTask]);

  return (
    <Box sx={{ height: '100vh', minWidth: 0, display: 'grid', gridTemplateRows: '64px minmax(0, 1fr)' }}>
      <AppBar
        position="static"
        color="inherit"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: 'divider', zIndex: 2 }}
      >
        <Toolbar sx={{ minHeight: '64px !important', gap: 2 }}>
          <Box sx={{ width: { xs: 'auto', lg: 320 }, flexShrink: 0 }}>
            <Typography variant="h6" component="div" sx={{ lineHeight: 1.1 }}>
              ITS 예약 관리 시스템
            </Typography>
          </Box>

          <Stack
            direction="row"
            spacing={2}
            alignItems="center"
            sx={{ flex: 1, minWidth: 0, display: { xs: 'none', md: 'flex' } }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'primary.main' }}>
              <AccessTimeIcon fontSize="small" />
              <Typography variant="body2" fontWeight={800}>
                서버 {formatClock(serverTime)}.{String(serverTime.getMilliseconds()).padStart(3, '0')}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">오프셋 +124ms</Typography>
            <Typography variant="body2" color="text.secondary">RTT 42ms</Typography>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <Chip size="small" label="실시간 연결" color="success" variant="outlined" />
            <Chip size="small" label={`스케줄 ${scheduleCount}`} variant="outlined" />
            <Chip size="small" label="실행 0" variant="outlined" />
            <Button variant="contained" startIcon={<PlayArrowIcon />}>
              전체 실행
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Box
        sx={{
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            lg: showExecutionPanel ? '340px minmax(0, 1fr) 420px' : '340px minmax(0, 1fr)',
          },
          overflow: 'hidden',
        }}
      >
        <Paper
          square
          elevation={0}
          sx={{
            minHeight: 0,
            borderRight: { lg: 1 },
            borderColor: 'divider',
            display: { xs: view === 'tasks' ? 'flex' : 'none', lg: 'flex' },
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Tabs
            value={view}
            onChange={(_, value) => handleViewChange(value)}
            variant="fullWidth"
            sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 46 }}
          >
            <Tab value="dashboard" label="대시보드" />
            <Tab value="tasks" label="태스크" />
            <Tab value="history" label="히스토리" />
            <Tab value="places" label="장소" />
          </Tabs>
          <Box sx={{ minHeight: 0, flex: 1, overflow: 'auto', p: 1.5 }}>
            <TaskList />
          </Box>
          <Divider />
          <Box sx={{ p: 1.5 }}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" label={`활성 ${activeCount}`} color="success" variant="outlined" />
              <Chip size="small" label={`전체 ${tasks.length}`} variant="outlined" />
              <Chip size="small" label={`선택 ${selectedTask?.name || '-'}`} color={selectedTask ? 'primary' : 'default'} />
            </Stack>
          </Box>
        </Paper>

        <Box sx={{ minHeight: 0, overflow: 'auto', p: { xs: 2, md: 3 }, bgcolor: '#f7f9fc' }}>
          <MobileTabs view={view} setView={handleViewChange} />
          {view === 'dashboard' && <Dashboard tasks={tasks} setView={handleViewChange} />}
          {(view === 'tasks' || view === 'editor') && (
            <WorkspacePaper>
              <TaskEditor placesVersion={placesVersion} />
            </WorkspacePaper>
          )}
          {view === 'history' && (
            <WorkspacePaper>
              <HistoryViewer />
            </WorkspacePaper>
          )}
          {view === 'places' && (
            <WorkspacePaper>
              <PlaceManager onPlacesChanged={handlePlacesChanged} />
            </WorkspacePaper>
          )}
        </Box>

        {showExecutionPanel && (
          <Paper
            square
            elevation={0}
            sx={{
              minHeight: 0,
              borderLeft: { lg: 1 },
              borderTop: { xs: 1, lg: 0 },
              borderColor: 'divider',
              display: 'grid',
              gridTemplateRows: 'auto minmax(0, 1fr)',
              overflow: 'hidden',
            }}
          >
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
              <ExecutionPanel />
            </Box>
            <Box sx={{ minHeight: 0, overflow: 'hidden' }}>
              <LogViewer />
            </Box>
          </Paper>
        )}
      </Box>
    </Box>
  );
}

function MobileTabs({ view, setView }) {
  return (
    <Tabs
      value={view}
      onChange={(_, value) => setView(value)}
      variant="scrollable"
      sx={{ display: { xs: 'flex', lg: 'none' }, mb: 2, borderBottom: 1, borderColor: 'divider' }}
    >
      <Tab value="dashboard" label="대시보드" />
      <Tab value="tasks" label="태스크" />
      <Tab value="history" label="히스토리" />
      <Tab value="places" label="장소" />
    </Tabs>
  );
}

function WorkspacePaper({ children }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 2 }}>
      {children}
    </Paper>
  );
}

function Dashboard({ tasks, setView }) {
  const activeTasks = tasks.filter((task) => task.enabled);
  const scheduleTasks = tasks.filter((task) => task.startMode?.type === 'scheduled');
  const risks = getRiskItems(tasks);
  const totalCombinations = activeTasks.reduce((sum, task) => sum + getCombinationCount(task), 0);
  const dryRunReady = tasks.filter((task) => task.method === 'http' && task.dates?.length && (task.placeMode === 'all' || task.places?.length)).length;

  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'flex-end' }}>
        <Box>
          <Typography variant="h5">준비 상태</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            예약 오픈 전에 봐야 할 태스크, 스케줄, 조합 수, 위험 항목을 한 화면에 모았습니다.
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<FactCheckIcon />} onClick={() => setView('tasks')}>
          태스크 점검
        </Button>
      </Box>

      <Grid container spacing={1.5}>
        <MetricCard title="활성 태스크" value={`${activeTasks.length}개`} caption={`전체 ${tasks.length}개 중 실행 대상`} />
        <MetricCard title="예상 조합" value={`${totalCombinations}개`} caption="활성 태스크 날짜 × 장소 합계" color={totalCombinations > 100 ? 'warning.main' : 'text.primary'} />
        <MetricCard title="Dry-run 후보" value={`${dryRunReady}개`} caption="HTTP 방식 사전 점검 가능" color="success.main" />
        <MetricCard title="스케줄" value={`${scheduleTasks.length}개`} caption="자동 실행 등록 대상" color="primary.main" />
      </Grid>

      {risks.length > 0 ? (
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          <Typography fontWeight={800} sx={{ mb: 0.5 }}>주의 필요</Typography>
          {risks.slice(0, 4).join(' / ')}
        </Alert>
      ) : (
        <Alert severity="success">현재 저장된 태스크에서 즉시 보이는 위험 항목은 없습니다.</Alert>
      )}

      <Grid container spacing={1.5}>
        <Grid item xs={12} md={7}>
          <Paper variant="outlined" sx={{ p: 2, height: '100%', borderRadius: 2 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>다가오는 스케줄</Typography>
            <Stack spacing={1}>
              {scheduleTasks.length === 0 ? (
                <Typography variant="body2" color="text.secondary">등록된 스케줄 태스크가 없습니다.</Typography>
              ) : (
                scheduleTasks.slice(0, 5).map((task) => (
                  <Box
                    key={task.id}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 2,
                      p: 1.25,
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 1,
                      bgcolor: '#fbfcfe',
                    }}
                  >
                    <Box>
                      <Typography variant="body2" fontWeight={800}>{task.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {task.method?.toUpperCase()} · 조합 {getCombinationCount(task)}
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      color={isPastSchedule(task) ? 'warning' : 'primary'}
                      label={task.startMode?.scheduledTime || '-'}
                    />
                  </Box>
                ))
              )}
            </Stack>
          </Paper>
        </Grid>
        <Grid item xs={12} md={5}>
          <Paper variant="outlined" sx={{ p: 2, height: '100%', borderRadius: 2 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>예약 준비율</Typography>
            <Stack spacing={1.5}>
              <Readiness label="필수 조건" value={tasks.length ? Math.round(((tasks.length - risks.length) / tasks.length) * 100) : 0} />
              <Readiness label="활성화" value={tasks.length ? Math.round((activeTasks.length / tasks.length) * 100) : 0} />
              <Readiness label="스케줄 등록" value={tasks.length ? Math.round((scheduleTasks.length / tasks.length) * 100) : 0} />
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
}

function MetricCard({ title, value, caption, color = 'text.primary' }) {
  return (
    <Grid item xs={12} sm={6} xl={3}>
      <Paper variant="outlined" sx={{ p: 2, height: '100%', borderRadius: 2 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={800}>
          {title}
        </Typography>
        <Typography variant="h5" sx={{ mt: 0.75, color }}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {caption}
        </Typography>
      </Paper>
    </Grid>
  );
}

function Readiness({ label, value }) {
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2" fontWeight={700}>{label}</Typography>
        <Typography variant="body2" color="text.secondary">{value}%</Typography>
      </Box>
      <LinearProgress variant="determinate" value={Math.max(0, Math.min(value, 100))} sx={{ height: 8, borderRadius: 99 }} />
    </Box>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <TaskProvider>
        <AppShell />
      </TaskProvider>
    </ThemeProvider>
  );
}

export default App;
