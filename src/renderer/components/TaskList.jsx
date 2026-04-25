import React from 'react';
import {
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  IconButton,
  Typography,
  Button,
  Box,
  Chip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import ScheduleIcon from '@mui/icons-material/Schedule';
import RepeatIcon from '@mui/icons-material/Repeat';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import AlarmIcon from '@mui/icons-material/Alarm';
import { useTasks } from '../contexts/TaskContext';

function TaskList() {
  const { tasks, selectedTask, setSelectedTask, deleteTask } = useTasks();

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
      startMode: {
        type: 'manual',
        scheduledTime: null,
      },
      runMode: {
        type: 'once',
        interval: 60,
        cronExpression: '0 9 * * *',
      },
    });
  };

  const handleDelete = async (id, event) => {
    event.stopPropagation();
    if (confirm('정말 이 태스크를 삭제하시겠습니까?')) {
      await deleteTask(id);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">태스크 목록</Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={handleNewTask}
        >
          새 태스크
        </Button>
      </Box>

      <List>
        {tasks.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
            태스크가 없습니다
          </Typography>
        ) : (
          tasks.map((task) => (
            <ListItem
              key={task.id}
              disablePadding
              secondaryAction={
                <IconButton edge="end" onClick={(e) => handleDelete(task.id, e)}>
                  <DeleteIcon />
                </IconButton>
              }
            >
              <ListItemButton
                selected={selectedTask?.id === task.id}
                onClick={() => setSelectedTask(task)}
              >
                <ListItemText
                  primary={task.name}
                  secondary={
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                      <Chip label={task.method} size="small" />
                      <Chip
                        label={task.enabled ? '활성' : '비활성'}
                        size="small"
                        color={task.enabled ? 'success' : 'default'}
                      />
                      <Chip
                        label={`동시 ${task.concurrent || 50}`}
                        size="small"
                        variant="outlined"
                      />
                      {/* 실행 방식 */}
                      {task.startMode?.type === 'scheduled' && (
                        <Chip
                          icon={<AlarmIcon />}
                          label={task.startMode.scheduledTime ?
                            new Date(task.startMode.scheduledTime).toLocaleString('ko-KR', {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            }) : '예약'}
                          size="small"
                          color="warning"
                          variant="outlined"
                        />
                      )}
                      {task.startMode?.type === 'manual' && (
                        <Chip
                          icon={<PlayCircleOutlineIcon />}
                          label="수동"
                          size="small"
                          variant="outlined"
                        />
                      )}
                      {/* 동작 방식 */}
                      {task.runMode?.type === 'repeat' && (
                        <Chip
                          icon={<RepeatIcon />}
                          label={`${task.runMode.interval}초 반복`}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      )}
                      {task.runMode?.type === 'cron' && (
                        <Chip
                          icon={<ScheduleIcon />}
                          label="정기"
                          size="small"
                          color="secondary"
                          variant="outlined"
                        />
                      )}
                    </Box>
                  }
                />
              </ListItemButton>
            </ListItem>
          ))
        )}
      </List>
    </Box>
  );
}

export default TaskList;
