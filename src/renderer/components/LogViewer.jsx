import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Button,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SearchIcon from '@mui/icons-material/Search';
import { apiClient } from '../api/client';

const MAX_VISIBLE_LOGS = 1000;

function formatLogTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '-';

  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function normalizeLevel(level) {
  if (level === 'warn') return 'warning';
  return level || 'info';
}

function getLogColor(level) {
  switch (normalizeLevel(level)) {
    case 'error':
      return '#ff8a87';
    case 'warning':
      return '#ffc96b';
    case 'success':
      return '#64dea5';
    default:
      return '#85b8ff';
  }
}

function LogViewer() {
  const [logs, setLogs] = useState([]);
  const [levelFilter, setLevelFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const logEndRef = useRef(null);

  useEffect(() => {
    const unsubscribe = apiClient.onLog((log) => {
      setLogs((prevLogs) => {
        const nextLogs = [...prevLogs, log];
        return nextLogs.length > MAX_VISIBLE_LOGS ? nextLogs.slice(-MAX_VISIBLE_LOGS) : nextLogs;
      });
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (autoScroll) {
      const frameId = requestAnimationFrame(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'auto' });
      });

      return () => cancelAnimationFrame(frameId);
    }
  }, [logs, autoScroll]);

  const filteredLogs = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return logs.filter((log) => {
      const level = normalizeLevel(log.level);
      const matchesLevel = levelFilter === 'all' || level === levelFilter;
      const matchesKeyword = !normalizedKeyword
        || (log.message || '').toLowerCase().includes(normalizedKeyword);
      return matchesLevel && matchesKeyword;
    });
  }, [keyword, levelFilter, logs]);

  const handleCopy = async () => {
    const text = filteredLogs
      .map((log) => `[${formatLogTime(log.timestamp)}] ${normalizeLevel(log.level).toUpperCase()} ${log.message}`)
      .join('\n');

    await navigator.clipboard?.writeText(text);
  };

  return (
    <Box sx={{ height: '100%', minHeight: 0, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', bgcolor: '#101418' }}>
      <Box sx={{ p: 1.5, borderBottom: '1px solid #28313b', bgcolor: '#151b21' }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="subtitle2" sx={{ color: '#eef3f8', fontWeight: 900, flex: 1 }}>
            실시간 로그
          </Typography>
          <Chip size="small" label={`${filteredLogs.length}/${logs.length}`} sx={{ color: '#d6dde6', borderColor: '#3a4654' }} variant="outlined" />
          <Button
            size="small"
            startIcon={autoScroll ? <PauseIcon /> : <PlayArrowIcon />}
            onClick={() => setAutoScroll((value) => !value)}
            sx={{ color: '#d6dde6', borderColor: '#3a4654' }}
            variant="outlined"
          >
            {autoScroll ? '정지' : '재개'}
          </Button>
          <Button
            size="small"
            startIcon={<ContentCopyIcon />}
            onClick={handleCopy}
            sx={{ color: '#d6dde6', borderColor: '#3a4654' }}
            variant="outlined"
          >
            복사
          </Button>
        </Stack>

        <Stack direction="row" spacing={1}>
          <TextField
            value={levelFilter}
            onChange={(event) => setLevelFilter(event.target.value)}
            select
            size="small"
            sx={{
              width: 124,
              '& .MuiInputBase-root': { color: '#d6dde6', bgcolor: '#0f1419' },
              '& fieldset': { borderColor: '#2f3b48' },
            }}
          >
            <MenuItem value="all">전체</MenuItem>
            <MenuItem value="info">정보</MenuItem>
            <MenuItem value="success">성공</MenuItem>
            <MenuItem value="warning">경고</MenuItem>
            <MenuItem value="error">오류</MenuItem>
          </TextField>
          <TextField
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="로그 검색"
            size="small"
            fullWidth
            InputProps={{
              startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: '#7f8a96' }} />,
            }}
            sx={{
              '& .MuiInputBase-root': { color: '#d6dde6', bgcolor: '#0f1419' },
              '& fieldset': { borderColor: '#2f3b48' },
            }}
          />
        </Stack>
      </Box>

      <Box
        sx={{
          minHeight: 0,
          overflow: 'auto',
          p: 1.5,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 12,
          lineHeight: 1.7,
          color: '#d6dde6',
        }}
      >
        {filteredLogs.length === 0 ? (
          <Typography variant="body2" sx={{ color: '#7f8a96' }}>
            실행을 시작하면 로그가 표시됩니다.
          </Typography>
        ) : (
          filteredLogs.map((log, index) => {
            const level = normalizeLevel(log.level);
            return (
              <Box
                key={`${log.timestamp}-${index}`}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '78px 70px 1fr',
                  gap: 1,
                  mb: 0.25,
                  whiteSpace: 'pre-wrap',
                }}
              >
                <Box component="span" sx={{ color: '#7f8a96' }}>
                  {formatLogTime(log.timestamp)}
                </Box>
                <Box component="span" sx={{ color: getLogColor(level), fontWeight: 900 }}>
                  {level.toUpperCase()}
                </Box>
                <Box component="span">{log.message}</Box>
              </Box>
            );
          })
        )}
        <div ref={logEndRef} />
      </Box>
    </Box>
  );
}

export default LogViewer;
