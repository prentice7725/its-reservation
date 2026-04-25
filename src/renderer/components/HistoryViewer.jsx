import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import RefreshIcon from '@mui/icons-material/Refresh';
import { apiClient } from '../api/client';

const statusMeta = {
  success: { label: '성공', color: 'success' },
  partial: { label: '부분 성공', color: 'warning' },
  failed: { label: '실패', color: 'error' },
  running: { label: '실행 중', color: 'info' },
  cancelled: { label: '중단됨', color: 'default' },
};

function formatDateTime(value) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(startedAt, completedAt) {
  if (!startedAt || !completedAt) return '-';

  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '-';

  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}초`;

  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  return `${minutes}분 ${restSeconds}초`;
}

function getResultCounts(results = []) {
  const success = results.filter(item => item.result === 'success').length;
  const cancelled = results.filter(item => item.result === 'cancelled').length;
  return {
    success,
    cancelled,
    failed: results.length - success - cancelled,
    total: results.length,
  };
}

function HistoryRow({ entry }) {
  const [open, setOpen] = React.useState(false);
  const meta = statusMeta[entry.status] || { label: entry.status || '알 수 없음', color: 'default' };
  const counts = getResultCounts(entry.results);

  return (
    <>
      <TableRow hover>
        <TableCell padding="checkbox">
          <IconButton size="small" onClick={() => setOpen(!open)} aria-label="상세 보기">
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        <TableCell>
          <Typography variant="body2" fontWeight={700}>
            {entry.taskName || '-'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {entry.taskId || '-'}
          </Typography>
        </TableCell>
        <TableCell>
          <Chip label={meta.label} color={meta.color} size="small" />
        </TableCell>
        <TableCell>{formatDateTime(entry.startedAt)}</TableCell>
        <TableCell>{formatDuration(entry.startedAt, entry.completedAt)}</TableCell>
        <TableCell align="right">
          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
            <Chip label={`성공 ${counts.success}`} color="success" size="small" variant="outlined" />
            <Chip label={`실패 ${counts.failed}`} color={counts.failed > 0 ? 'error' : 'default'} size="small" variant="outlined" />
            {counts.cancelled > 0 && (
              <Chip label={`중단 ${counts.cancelled}`} size="small" variant="outlined" />
            )}
          </Stack>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={6} sx={{ p: 0, borderBottom: open ? 1 : 0, borderColor: 'divider' }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ p: 2, backgroundColor: '#fafafa' }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                실행 결과
              </Typography>

              {entry.results?.length ? (
                <Stack spacing={1}>
                  {entry.results.map((result, index) => (
                    <Paper key={`${result.place}-${result.date}-${index}`} variant="outlined" sx={{ p: 1.25 }}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Chip
                          label={result.result === 'success' ? '성공' : result.result === 'cancelled' ? '중단' : '실패'}
                          color={result.result === 'success' ? 'success' : result.result === 'cancelled' ? 'default' : 'error'}
                          size="small"
                        />
                        <Typography variant="body2" fontWeight={700}>
                          {result.place} / {result.date}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {result.message || result.result}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatDateTime(result.timestamp)}
                        </Typography>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  저장된 결과가 없습니다
                </Typography>
              )}

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                로그
              </Typography>
              <Paper
                variant="outlined"
                sx={{
                  p: 1.25,
                  maxHeight: 180,
                  overflow: 'auto',
                  backgroundColor: '#fff',
                  fontFamily: 'monospace',
                  fontSize: '0.8125rem',
                }}
              >
                {entry.logs?.length ? (
                  entry.logs.map((log, index) => (
                    <Box key={`${log.timestamp}-${index}`} sx={{ mb: 0.5 }}>
                      <Box component="span" sx={{ color: 'text.disabled' }}>
                        [{formatDateTime(log.timestamp)}]
                      </Box>{' '}
                      <Box component="span" sx={{ color: log.level === 'error' ? 'error.main' : 'text.primary' }}>
                        {log.message}
                      </Box>
                    </Box>
                  ))
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    저장된 로그가 없습니다
                  </Typography>
                )}
              </Paper>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

function HistoryViewer() {
  const [history, setHistory] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const loadHistory = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await apiClient.getHistory();
      setHistory([...data].reverse());
    } catch (loadError) {
      console.error('히스토리 로드 실패:', loadError);
      setError(loadError.message || '히스토리를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          실행 히스토리
        </Typography>

        <Tooltip title="새로고침">
          <span>
            <Button
              size="small"
              startIcon={<RefreshIcon />}
              onClick={loadHistory}
              disabled={loading}
            >
              새로고침
            </Button>
          </span>
        </Tooltip>
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!loading && !error && history.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
          실행 히스토리가 없습니다
        </Typography>
      )}

      {!loading && !error && history.length > 0 && (
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              <TableCell>태스크</TableCell>
              <TableCell>상태</TableCell>
              <TableCell>시작</TableCell>
              <TableCell>소요</TableCell>
              <TableCell align="right">결과</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {history.map((entry) => (
              <HistoryRow key={entry.id} entry={entry} />
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}

export default HistoryViewer;
