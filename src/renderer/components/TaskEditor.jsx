import React from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  FormControlLabel,
  Switch,
  MenuItem,
  Radio,
  RadioGroup,
  FormControl,
  FormLabel,
  Grid,
  Chip,
  Checkbox,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import SearchIcon from '@mui/icons-material/Search';
import { useTasks } from '../contexts/TaskContext';
import { apiClient } from '../api/client';
import { v4 as uuidv4 } from 'uuid';

function TaskEditor({ placesVersion = 0 }) {
  const { selectedTask, setSelectedTask, saveTask } = useTasks();
  const [formData, setFormData] = React.useState(null);
  const [placeOptions, setPlaceOptions] = React.useState([]);
  const [dateInput, setDateInput] = React.useState('');
  const [placeSearch, setPlaceSearch] = React.useState('');

  // 장소 목록 로드
  React.useEffect(() => {
    const loadPlaces = async () => {
      try {
        const loadedPlaces = await apiClient.getPlaces();

        // Autocomplete 옵션 생성 (id와 name 포함)
        const options = Object.entries(loadedPlaces).map(([id, data]) => ({
          id,
          label: data.name || id,
        }));
        setPlaceOptions(options);
      } catch (error) {
        console.error('장소 로드 실패:', error);
      }
    };
    loadPlaces();
  }, [placesVersion]);

  React.useEffect(() => {
    if (selectedTask) {
      setFormData({ ...selectedTask });
    } else {
      setFormData({
        name: '',
        enabled: true,
        method: 'http',
        email: '',
        numRooms: 2,
        peoplePerRoom: [3, 3],
        concurrent: 1,
        dates: [],
        places: [],
        startMode: {
          type: 'manual',
          scheduledTime: null
        },
        runMode: {
          type: 'once',
          interval: 60,
          cronExpression: '0 9 * * *'
        },
        burstRetry: {
          enabled: false,
          maxAttempts: 10,
          intervalMs: 300,
          maxDurationMs: 10000,
          retryNoRooms: false
        }
      });
    }
  }, [selectedTask]);

  const handleChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleRoomCountChange = (nextCount) => {
    const numRooms = Math.max(1, Math.min(nextCount, 10));
    const currentPeoplePerRoom = formData?.peoplePerRoom || [3, 3];
    const newPeoplePerRoom = [...currentPeoplePerRoom];

    while (newPeoplePerRoom.length < numRooms) {
      newPeoplePerRoom.push(3);
    }

    setFormData({
      ...formData,
      numRooms,
      peoplePerRoom: newPeoplePerRoom.slice(0, numRooms),
    });
  };

  const selectedPlaceIds = formData?.places || [];
  const usesAllPlaces = selectedPlaceIds.length === 0;
  const filteredPlaceOptions = placeOptions.filter((option) => {
    const keyword = placeSearch.trim().toLowerCase();
    if (!keyword) return true;

    return (
      option.id.toLowerCase().includes(keyword) ||
      option.label.toLowerCase().includes(keyword)
    );
  });

  const getSelectedPlaceLabel = (placeId) => {
    return placeOptions.find((option) => option.id === placeId)?.label || placeId;
  };

  const handleAddDate = () => {
    if (!dateInput) return;

    const dates = formData?.dates || [];
    if (!dates.includes(dateInput)) {
      handleChange('dates', [...dates, dateInput].sort());
    }
    setDateInput('');
  };

  const handleRemoveDate = (date) => {
    handleChange('dates', (formData?.dates || []).filter((item) => item !== date));
  };

  const handleTogglePlace = (placeId) => {
    if (usesAllPlaces) {
      handleChange('places', placeOptions.map((option) => option.id).filter((id) => id !== placeId));
      return;
    }

    if (selectedPlaceIds.includes(placeId)) {
      handleChange('places', selectedPlaceIds.filter((id) => id !== placeId));
    } else {
      handleChange('places', [...selectedPlaceIds, placeId]);
    }
  };

  const handleBurstRetryChange = (field, value) => {
    handleChange('burstRetry', {
      enabled: false,
      maxAttempts: 10,
      intervalMs: 300,
      maxDurationMs: 10000,
      retryNoRooms: false,
      ...(formData?.burstRetry || {}),
      [field]: value,
    });
  };

  const handleSave = async () => {
    if (!formData) return;

    const taskToSave = {
      ...formData,
      id: formData.id || uuidv4(),
    };

    const success = await saveTask(taskToSave);
    if (success) {
      alert('저장되었습니다');
      setSelectedTask(null);
    } else {
      alert('저장 실패');
    }
  };

  const handleCancel = () => {
    setSelectedTask(null);
  };

  if (!formData) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
        <Typography variant="body1" color="text.secondary">
          태스크를 선택하거나 새로 만드세요
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>
        태스크 편집
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField
              label="태스크 이름"
              value={formData?.name || ''}
              onChange={(e) => handleChange('name', e.target.value)}
              fullWidth
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={formData?.enabled || false}
                  onChange={(e) => handleChange('enabled', e.target.checked)}
                />
              }
              label="활성화"
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              label="예약 방식"
              value={formData?.method || 'http'}
              onChange={(e) => handleChange('method', e.target.value)}
              select
              fullWidth
            >
              <MenuItem value="http">HTTP</MenuItem>
              <MenuItem value="playwright">Playwright</MenuItem>
            </TextField>
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              label="이메일"
              value={formData?.email || ''}
              onChange={(e) => handleChange('email', e.target.value)}
              fullWidth
              placeholder="기본값 사용"
              helperText="비워두면 기본 이메일 사용"
            />
          </Grid>

          <Grid item xs={12} md={4}>
            <Box>
              <Typography variant="caption" color="text.secondary">방 수</Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                <IconButton
                  color="primary"
                  onClick={() => handleRoomCountChange((formData?.numRooms || 1) - 1)}
                  disabled={(formData?.numRooms || 1) <= 1}
                  aria-label="방 수 줄이기"
                  sx={{ border: 1, borderColor: 'divider' }}
                >
                  <RemoveIcon />
                </IconButton>

                <Box
                  sx={{
                    minWidth: 72,
                    height: 40,
                    px: 2,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Typography variant="body1" fontWeight={700}>
                    {formData?.numRooms || 1}
                  </Typography>
                </Box>

                <IconButton
                  color="primary"
                  onClick={() => handleRoomCountChange((formData?.numRooms || 1) + 1)}
                  disabled={(formData?.numRooms || 1) >= 10}
                  aria-label="방 수 늘리기"
                  sx={{ border: 1, borderColor: 'divider' }}
                >
                  <AddIcon />
                </IconButton>
              </Stack>
            </Box>
          </Grid>

          <Grid item xs={12} md={8}>
            <Box>
              <Typography variant="caption" color="text.secondary">방별 인원수</Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                {(formData?.peoplePerRoom || []).map((people, index) => (
                  <TextField
                    key={index}
                    label={`방 ${index + 1}`}
                    type="number"
                    value={people}
                    onChange={(e) => {
                      const newPeoplePerRoom = [...(formData?.peoplePerRoom || [])];
                      newPeoplePerRoom[index] = parseInt(e.target.value) || 1;
                      handleChange('peoplePerRoom', newPeoplePerRoom);
                    }}
                    size="small"
                    inputProps={{ min: 1, max: 10 }}
                    sx={{ width: '80px' }}
                  />
                ))}
              </Box>
            </Box>
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField
              label="동시 실행 수"
              type="number"
              value={formData?.concurrent || 1}
              onChange={(e) => {
                const concurrent = parseInt(e.target.value, 10) || 1;
                handleChange('concurrent', Math.max(1, Math.min(concurrent, 100)));
              }}
              fullWidth
              inputProps={{ min: 1, max: 100 }}
              helperText="장소/날짜 조합을 동시에 처리할 개수"
            />
          </Grid>

          <Grid item xs={12}>
            <Box>
              <Typography variant="caption" color="text.secondary">예약 날짜</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
                <TextField
                  type="date"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddDate();
                    }
                  }}
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                />
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={handleAddDate}
                  disabled={!dateInput}
                  sx={{ minWidth: 100 }}
                >
                  추가
                </Button>
              </Stack>

              <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap', minHeight: 32 }}>
                {(formData?.dates || []).length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    선택된 날짜가 없습니다
                  </Typography>
                ) : (
                  (formData?.dates || []).map((date) => (
                    <Chip
                      key={date}
                      label={date}
                      onDelete={() => handleRemoveDate(date)}
                      size="small"
                    />
                  ))
                )}
              </Box>
            </Box>
          </Grid>

          <Grid item xs={12}>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                <Typography variant="caption" color="text.secondary">장소</Typography>
                <Stack direction="row" spacing={1}>
                  <Button size="small" onClick={() => handleChange('places', [])}>
                    전체 장소
                  </Button>
                  <Button size="small" onClick={() => handleChange('places', placeOptions.map((option) => option.id))}>
                    모두 선택
                  </Button>
                </Stack>
              </Box>

              <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                <Box sx={{ p: 1.5 }}>
                  <TextField
                    value={placeSearch}
                    onChange={(e) => setPlaceSearch(e.target.value)}
                    placeholder="장소 검색"
                    fullWidth
                    size="small"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" />
                        </InputAdornment>
                      ),
                    }}
                  />
                </Box>

                <Divider />

                <List dense sx={{ maxHeight: 240, overflow: 'auto', py: 0 }}>
                  {filteredPlaceOptions.length === 0 ? (
                    <ListItem>
                      <ListItemText
                        primary="검색 결과가 없습니다"
                        primaryTypographyProps={{ color: 'text.secondary', variant: 'body2' }}
                      />
                    </ListItem>
                  ) : (
                    filteredPlaceOptions.map((option) => {
                      const checked = usesAllPlaces || selectedPlaceIds.includes(option.id);

                      return (
                        <ListItem key={option.id} disablePadding>
                          <ListItemButton onClick={() => handleTogglePlace(option.id)}>
                            <ListItemIcon sx={{ minWidth: 36 }}>
                              <Checkbox edge="start" checked={checked} tabIndex={-1} disableRipple />
                            </ListItemIcon>
                            <ListItemText
                              primary={option.label}
                              secondary={option.id}
                              primaryTypographyProps={{ variant: 'body2' }}
                            />
                          </ListItemButton>
                        </ListItem>
                      );
                    })
                  )}
                </List>
              </Paper>

              <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap', minHeight: 32 }}>
                {usesAllPlaces ? (
                  <Chip label={`전체 장소 (${placeOptions.length})`} color="primary" size="small" variant="outlined" />
                ) : (
                  selectedPlaceIds.map((placeId) => (
                    <Chip
                      key={placeId}
                      label={getSelectedPlaceLabel(placeId)}
                      onDelete={() => handleTogglePlace(placeId)}
                      size="small"
                    />
                  ))
                )}
              </Box>
            </Box>
          </Grid>

          <Grid item xs={12}>
            <FormControl component="fieldset">
              <FormLabel component="legend">실행 방식 (언제 시작할지)</FormLabel>
              <RadioGroup
                row
                value={formData?.startMode?.type || 'manual'}
                onChange={(e) => {
                  handleChange('startMode', {
                    ...(formData?.startMode || {}),
                    type: e.target.value
                  });
                }}
              >
                <FormControlLabel value="manual" control={<Radio />} label="수동 실행 (버튼)" />
                <FormControlLabel value="scheduled" control={<Radio />} label="특정 시간 실행" />
              </RadioGroup>
            </FormControl>

            {formData?.startMode?.type === 'scheduled' && (
              <TextField
                label="실행 시작 시간"
                type="datetime-local"
                value={formData?.startMode?.scheduledTime || ''}
                onChange={(e) => {
                  handleChange('startMode', {
                    ...(formData?.startMode || {}),
                    scheduledTime: e.target.value
                  });
                }}
                fullWidth
                sx={{ mt: 1 }}
                helperText="초 단위까지 입력 가능"
                InputLabelProps={{
                  shrink: true,
                }}
                inputProps={{ step: 1 }}
              />
            )}
          </Grid>

          <Grid item xs={12}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(formData?.burstRetry?.enabled)}
                      onChange={(e) => handleBurstRetryChange('enabled', e.target.checked)}
                    />
                  }
                  label="정각 집중 재시도"
                />

                {formData?.burstRetry?.enabled && (
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={4}>
                      <TextField
                        label="최대 시도"
                        type="number"
                        value={formData?.burstRetry?.maxAttempts || 10}
                        onChange={(e) => handleBurstRetryChange('maxAttempts', Math.max(1, Math.min(parseInt(e.target.value, 10) || 1, 50)))}
                        fullWidth
                        size="small"
                        inputProps={{ min: 1, max: 50 }}
                      />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField
                        label="간격(ms)"
                        type="number"
                        value={formData?.burstRetry?.intervalMs || 300}
                        onChange={(e) => handleBurstRetryChange('intervalMs', Math.max(100, Math.min(parseInt(e.target.value, 10) || 100, 5000)))}
                        fullWidth
                        size="small"
                        inputProps={{ min: 100, max: 5000, step: 50 }}
                      />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField
                        label="최대 시간(ms)"
                        type="number"
                        value={formData?.burstRetry?.maxDurationMs || 10000}
                        onChange={(e) => handleBurstRetryChange('maxDurationMs', Math.max(500, Math.min(parseInt(e.target.value, 10) || 500, 60000)))}
                        fullWidth
                        size="small"
                        inputProps={{ min: 500, max: 60000, step: 500 }}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={Boolean(formData?.burstRetry?.retryNoRooms)}
                            onChange={(e) => handleBurstRetryChange('retryNoRooms', e.target.checked)}
                          />
                        }
                        label="방 없음도 짧게 재시도"
                      />
                    </Grid>
                  </Grid>
                )}
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <FormControl component="fieldset">
              <FormLabel component="legend">동작 방식 (어떻게 실행할지)</FormLabel>
              <RadioGroup
                row
                value={formData?.runMode?.type || 'once'}
                onChange={(e) => {
                  handleChange('runMode', {
                    ...(formData?.runMode || {}),
                    type: e.target.value
                  });
                }}
              >
                <FormControlLabel value="once" control={<Radio />} label="한 번만 실행" />
                <FormControlLabel value="repeat" control={<Radio />} label="간격 반복" />
                <FormControlLabel value="cron" control={<Radio />} label="정기 스케줄" />
              </RadioGroup>
            </FormControl>

            {formData?.runMode?.type === 'repeat' && (
              <TextField
                label="반복 간격 (초)"
                type="number"
                value={formData?.runMode?.interval || 60}
                onChange={(e) => {
                  handleChange('runMode', {
                    ...(formData?.runMode || {}),
                    interval: parseInt(e.target.value) || 1
                  });
                }}
                fullWidth
                sx={{ mt: 1 }}
                inputProps={{ min: 1 }}
                helperText="N초마다 반복 실행"
              />
            )}

            {formData?.runMode?.type === 'cron' && (
              <TextField
                label="Cron 표현식"
                value={formData?.runMode?.cronExpression || '0 9 * * *'}
                onChange={(e) => {
                  handleChange('runMode', {
                    ...(formData?.runMode || {}),
                    cronExpression: e.target.value
                  });
                }}
                fullWidth
                sx={{ mt: 1 }}
                placeholder="0 9 * * *"
                helperText="예: 0 9 * * * (매일 오전 9시)"
              />
            )}
          </Grid>
        </Grid>

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 2 }}>
          <Button variant="outlined" onClick={handleCancel}>
            취소
          </Button>
          <Button variant="contained" onClick={handleSave}>
            저장
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

export default TaskEditor;
