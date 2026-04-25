import React from 'react';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  AppBar,
  Toolbar,
  Typography,
  Container,
  Grid,
  Paper,
  Tab,
  Tabs,
} from '@mui/material';
import { TaskProvider } from './contexts/TaskContext';
import TaskList from './components/TaskList';
import TaskEditor from './components/TaskEditor';
import ExecutionPanel from './components/ExecutionPanel';
import LogViewer from './components/LogViewer';
import HistoryViewer from './components/HistoryViewer';
import PlaceManager from './components/PlaceManager';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

function App() {
  const [selectedTab, setSelectedTab] = React.useState(0);
  const [editorTab, setEditorTab] = React.useState(0);
  const [placesVersion, setPlacesVersion] = React.useState(0);

  const handlePlacesChanged = React.useCallback(() => {
    setPlacesVersion((version) => version + 1);
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <TaskProvider>
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          {/* 상단 앱바 */}
          <AppBar position="static">
            <Toolbar>
              <Typography variant="h6" component="div">
                ITS 예약 관리 시스템
              </Typography>
            </Toolbar>
          </AppBar>

          {/* 메인 콘텐츠 */}
          <Container maxWidth={false} sx={{ flex: 1, mt: 2, mb: 2, overflow: 'hidden' }}>
            <Grid container spacing={2} sx={{ height: '100%' }}>
              {/* 좌측: 태스크 목록 */}
              <Grid item xs={12} md={3} sx={{ height: '100%', overflow: 'auto' }}>
                <Paper elevation={3} sx={{ p: 2, height: '100%' }}>
                  <TaskList />
                </Paper>
              </Grid>

              {/* 우측: 편집기, 실행 패널, 로그/히스토리 */}
              <Grid item xs={12} md={9} sx={{ height: '100%', overflow: 'auto' }}>
                <Grid container spacing={2}>
                  {/* 상단: 실행 패널 */}
                  <Grid item xs={12}>
                    <Paper elevation={3} sx={{ p: 2 }}>
                      <ExecutionPanel />
                    </Paper>
                  </Grid>

                  {/* 중앙: 태스크 편집기 */}
                  <Grid item xs={12}>
                    <Paper elevation={3} sx={{ maxHeight: '650px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      <Tabs
                        value={editorTab}
                        onChange={(_, value) => setEditorTab(value)}
                        sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}
                      >
                        <Tab label="태스크 편집" />
                        <Tab label="장소 관리" />
                      </Tabs>
                      <Box sx={{ p: 2, overflow: 'auto' }}>
                        {editorTab === 0 ? (
                          <TaskEditor placesVersion={placesVersion} />
                        ) : (
                          <PlaceManager onPlacesChanged={handlePlacesChanged} />
                        )}
                      </Box>
                    </Paper>
                  </Grid>

                  {/* 하단: 로그/히스토리 */}
                  <Grid item xs={12}>
                    <Paper elevation={3} sx={{ height: '360px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      <Tabs
                        value={selectedTab}
                        onChange={(_, value) => setSelectedTab(value)}
                        sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}
                      >
                        <Tab label="로그" />
                        <Tab label="히스토리" />
                      </Tabs>
                      <Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
                        {selectedTab === 0 ? <LogViewer /> : <HistoryViewer />}
                      </Box>
                    </Paper>
                  </Grid>
                </Grid>
              </Grid>
            </Grid>
          </Container>
        </Box>
      </TaskProvider>
    </ThemeProvider>
  );
}

export default App;
