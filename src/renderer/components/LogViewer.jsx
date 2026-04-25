import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { apiClient } from '../api/client';

function LogViewer() {
  const [logs, setLogs] = useState([]);
  const logEndRef = useRef(null);

  useEffect(() => {
    // 로그 구독
    const unsubscribe = apiClient.onLog((log) => {
      setLogs((prevLogs) => [...prevLogs, log]);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    // 자동 스크롤
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getLogColor = (level) => {
    switch (level) {
      case 'error':
        return '#f44336';
      case 'warn':
      case 'warning':
        return '#ff9800';
      case 'success':
        return '#4caf50';
      default:
        return '#757575';
    }
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>
        실행 로그
      </Typography>

      <Paper
        elevation={0}
        sx={{
          p: 2,
          height: '200px',
          overflow: 'auto',
          backgroundColor: '#f5f5f5',
          fontFamily: 'monospace',
          fontSize: '0.875rem',
        }}
      >
        {logs.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            로그가 없습니다
          </Typography>
        ) : (
          logs.map((log, index) => (
            <Box key={index} sx={{ mb: 0.5 }}>
              <span style={{ color: '#9e9e9e' }}>
                [{new Date(log.timestamp).toLocaleTimeString()}]
              </span>{' '}
              <span style={{ color: getLogColor(log.level) }}>{log.message}</span>
            </Box>
          ))
        )}
        <div ref={logEndRef} />
      </Paper>
    </Box>
  );
}

export default LogViewer;
