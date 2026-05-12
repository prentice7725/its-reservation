import React from 'react';
import {
  Alert,
  Box,
  Typography,
  TextField,
  Button,
  Chip,
  FormControlLabel,
  Switch,
  MenuItem,
  Radio,
  RadioGroup,
  FormControl,
  FormLabel,
  Grid,
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
  Tooltip,
} from '@mui/material';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import AddIcon from '@mui/icons-material/Add';
import AllInclusiveIcon from '@mui/icons-material/AllInclusive';
import RemoveIcon from '@mui/icons-material/Remove';
import SearchIcon from '@mui/icons-material/Search';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import { useTasks } from '../contexts/TaskContext';
import { apiClient } from '../api/client';
import { v4 as uuidv4 } from 'uuid';

function getScheduledParts(value) {
  if (!value) {
    return { date: '', time: '' };
  }

  const [date = '', rawTime = ''] = String(value).split('T');
  return {
    date,
    time: rawTime.slice(0, 8),
  };
}

function normalizeScheduledTime(value) {
  if (!value) return '';
  return /^\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
}

function buildScheduledDateTime(date, time) {
  if (!date) return null;
  return `${date}T${normalizeScheduledTime(time) || '00:00:00'}`;
}

// 날짜문자열(YYYY-MM-DD)이 어느 시즌에 해당하는지 반환
// 여름: 7/1 ~ 9/30  /  겨울: 12/20 ~ 3/31
function getDateSeason(dateStr) {
  if (!dateStr) return null;
  const [, monthStr, dayStr] = dateStr.split('-');
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  // 여름 (7월 1일 ~ 9월 30일)
  if (month === 7 || month === 8 || (month === 9 && day <= 30)) {
    return 'summer';
  }
  // 겨울 (12월 20일 ~ 3월 31일)
  if ((month === 12 && day >= 20) || month === 1 || month === 2 || month === 3) {
    return 'winter';
  }
  return 'other'; // 연중 전용이지만 summer/winter에 해당하지 않는 시절
}

// 날짜 목록에서 활성화된 시즌 Set 반환
function getActiveSeasons(dates) {
  const seasons = new Set();
  (dates || []).forEach((d) => {
    const s = getDateSeason(d);
    if (s) seasons.add(s);
  });
  return seasons;
}

// season 값을 항상 배열로 정규화 (기존 문자열도 호환)
function normalizeSeason(season) {
  if (!season) return ['all'];
  if (Array.isArray(season)) return season.length > 0 ? season : ['all'];
  return [season];
}

// 장소가 주어진 시즌 Set에서 이용 가능한지 판별
function isPlaceAvailable(placeSeason, activeSeasons) {
  if (activeSeasons.size === 0) return true; // 날짜 미선택시 모두 표시
  const seasons = normalizeSeason(placeSeason);
  if (seasons.includes('all')) return true;
  if (seasons.includes('summer') && activeSeasons.has('summer')) return true;
  if (seasons.includes('winter') && activeSeasons.has('winter')) return true;
  return false;
}

const SEASON_LABEL = {
  all: '연중',
  summer: '여름한정',
  winter: '겨울한정',
};

function TaskEditor({ placesVersion = 0 }) {
  const { selectedTask, setSelectedTask, saveTask } = useTasks();
  const [formData, setFormData] = React.useState(null);
  const [rawPlaceOptions, setRawPlaceOptions] = React.useState([]);
  const [dateInput, setDateInput] = React.useState('');
  const [placeSearch, setPlaceSearch] = React.useState('');

  // 장소 목록 로드
  React.useEffect(() => {
    const loadPlaces = async () => {
      try {
        const loadedPlaces = await apiClient.getPlaces();
        const options = Object.entries(loadedPlaces).map(([id, data]) => ({
          id,
          label: data.name || id,
          region: data.region || '',
          season: data.season,  // 로우값 그대로, isPlaceAvailable에서 normalizeSeason 실행
        }));
        setRawPlaceOptions(options);
      } catch (error) {
        console.error('장소 로드 실패:', error);
      }
    };
    loadPlaces();
  }, [placesVersion]);

  React.useEffect(() => {
    if (selectedTask) {
      const legacyUsesAllPlaces = !selectedTask.placeMode && (selectedTask.places || []).length === 0;
      setFormData({
        ...selectedTask,
        placeMode: selectedTask.placeMode || (legacyUsesAllPlaces ? 'all' : 'selected'),
      });
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
        placeMode: 'selected',
        startMode: {
          type: 'manual',
          scheduledTime: null
        },
        runMode: {
          type: 'once',
          interval: 60,
          maxRuns: 10,
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
  const placeMode = formData?.placeMode || 'selected';
  const usesAllPlaces = placeMode === 'all';
  const scheduledParts = getScheduledParts(formData?.startMode?.scheduledTime);

  // 선택된 날짜들에서 활성 시즌 계산
  const activeSeasons = React.useMemo(
    () => getActiveSeasons(formData?.dates),
    [formData?.dates]
  );

  // 시즌에 맞는 장소만 필터링
  const placeOptions = React.useMemo(
    () => rawPlaceOptions.filter((opt) => isPlaceAvailable(opt.season, activeSeasons)),
    [rawPlaceOptions, activeSeasons]
  );

  const filteredPlaceOptions = placeOptions.filter((option) => {
    const keyword = placeSearch.trim().toLowerCase();
    if (!keyword) return true;
    return (
      option.id.toLowerCase().includes(keyword) ||
      option.label.toLowerCase().includes(keyword)
    );
  });

  const selectedPlaceCount = usesAllPlaces ? placeOptions.length : selectedPlaceIds.length;
  const combinationCount = (formData?.dates?.length || 0) * selectedPlaceCount;
  const isScheduledInPast = (() => {
    if (formData?.startMode?.type !== 'scheduled' || !formData?.startMode?.scheduledTime) return false;
    const scheduled = new Date(formData.startMode.scheduledTime).getTime();
    return Number.isFinite(scheduled) && scheduled < Date.now();
  })();
  const missingRequired = [
    !formData?.name && '태스크 이름',
    !formData?.email && '이메일',
    (formData?.dates || []).length === 0 && '예약 날짜',
    !usesAllPlaces && selectedPlaceIds.length === 0 && '장소',
  ].filter(Boolean);

  const getSelectedPlaceLabel = (placeId) => {
    const option = rawPlaceOptions.find((opt) => opt.id === placeId);
    if (!option) return placeId;
    return `${option.label}${option.region ? ` (${option.region})` : ''}`;
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
      setFormData({
        ...formData,
        placeMode: 'selected',
        places: placeOptions.map((option) => option.id).filter((id) => id !== placeId),
      });
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

  const handleScheduledPartChange = (field, value) => {
    const nextDate = field === 'date' ? value : scheduledParts.date;
    const nextTime = field === 'time' ? value : scheduledParts.time;

    handleChange('startMode', {
      ...(formData?.startMode || {}),
      scheduledTime: buildScheduledDateTime(nextDate, nextTime),
    });
  };

  const handleSave = async () => {
    if (!formData) return;

    const taskToSave = {
      ...formData,
      id: formData.id || uuidv4(),
      places: usesAllPlaces ? [] : selectedPlaceIds,
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

      <Stack spacing={1.5} sx={{ mb: 2 }}>
        {missingRequired.length > 0 && (
          <Alert severity="warning">
            필수 입력이 필요합니다: {missingRequired.join(', ')}
          </Alert>
        )}
        {isScheduledInPast && (
          <Alert severity="error">
            현재보다 과거 시각은 스케줄로 등록할 수 없습니다.
          </Alert>
        )}
        {combinationCount > 100 && (
          <Alert severity="warning">
            실행 조합이 100개를 초과합니다. 실제 실행은 최대 100개까지만 처리됩니다.
          </Alert>
        )}
        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#fbfcfe' }}>
          <Grid container spacing={1.5}>
            <Grid item xs={6} md={2.4}>
              <Typography variant="caption" color="text.secondary">예약 방식</Typography>
              <Typography variant="body2" fontWeight={800}>{formData?.method || 'http'}</Typography>
            </Grid>
            <Grid item xs={6} md={2.4}>
              <Typography variant="caption" color="text.secondary">날짜</Typography>
              <Typography variant="body2" fontWeight={800}>{formData?.dates?.length || 0}개</Typography>
            </Grid>
            <Grid item xs={6} md={2.4}>
              <Typography variant="caption" color="text.secondary">장소</Typography>
              <Typography variant="body2" fontWeight={800}>{usesAllPlaces ? `전체 ${selectedPlaceCount}` : `선택 ${selectedPlaceCount}`}</Typography>
            </Grid>
            <Grid item xs={6} md={2.4}>
              <Typography variant="caption" color="text.secondary">예상 조합</Typography>
              <Typography variant="body2" fontWeight={800} color={combinationCount > 100 ? 'warning.main' : 'text.primary'}>
                {combinationCount}개
              </Typography>
            </Grid>
            <Grid item xs={6} md={2.4}>
              <Typography variant="caption" color="text.secondary">실행</Typography>
              <Typography variant="body2" fontWeight={800}>
                {formData?.startMode?.type === 'scheduled' ? '스케줄' : '수동'}
              </Typography>
            </Grid>
          </Grid>
        </Paper>
      </Stack>

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

              {activeSeasons.size > 0 && (
                <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, alignItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary">선택된 날짜 시즌:</Typography>
                  {activeSeasons.has('summer') && (
                    <Chip icon={<WbSunnyIcon fontSize="inherit" />} label="여름" size="small" color="warning" variant="outlined" />
                  )}
                  {activeSeasons.has('winter') && (
                    <Chip icon={<AcUnitIcon fontSize="inherit" />} label="겨울" size="small" color="info" variant="outlined" />
                  )}
                  {activeSeasons.has('other') && (
                    <Chip icon={<AllInclusiveIcon fontSize="inherit" />} label="일반" size="small" color="default" variant="outlined" />
                  )}
                </Box>
              )}
            </Box>
          </Grid>

          <Grid item xs={12}>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="caption" color="text.secondary">장소</Typography>
                  {activeSeasons.size > 0 && placeOptions.length < rawPlaceOptions.length && (
                    <Tooltip title={`날짜에 맞는 시즌(${Array.from(activeSeasons).map((s) => SEASON_LABEL[s] || s).join(', ')})의 장소만 표시됩니다`}>
                      <Chip
                        label={`${placeOptions.length}/${rawPlaceOptions.length} 장소`}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    </Tooltip>
                  )}
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    onClick={() => setFormData({ ...formData, placeMode: 'all', places: [] })}
                  >
                    전체 장소
                  </Button>
                  <Button
                    size="small"
                    onClick={() => setFormData({
                      ...formData,
                      placeMode: 'selected',
                      places: placeOptions.map((option) => option.id),
                    })}
                  >
                    모두 선택
                  </Button>
                  <Button
                    size="small"
                    onClick={() => setFormData({ ...formData, placeMode: 'selected', places: [] })}
                  >
                    선택 해제
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
                              primary={
                                <span>
                                  {option.label} {option.region && `(${option.region})`}
                                </span>
                              }
                              secondary={
                                <span>
                                  {option.id}
                                  {option.season && !normalizeSeason(option.season).includes('all') && (
                                    <span style={{ marginLeft: 6, fontSize: '0.75em', fontWeight: 600 }}>
                                      {normalizeSeason(option.season).map((s) =>
                                        s === 'summer' ? <span key={s} style={{ color: '#ed6c02' }}>☀️여름</span>
                                        : s === 'winter' ? <span key={s} style={{ color: '#0288d1' }}>❄️겨울</span>
                                        : null
                                      ).reduce((acc, el, i) => i === 0 ? [el] : [...acc, <span key={`sep-${i}`}>·</span>, el], [])}
                                    </span>
                                  )}
                                </span>
                              }
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
                ) : selectedPlaceIds.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    선택된 장소가 없습니다
                  </Typography>
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
              <Grid container spacing={1} sx={{ mt: 0.5 }}>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="실행 시작 날짜"
                    type="date"
                    value={scheduledParts.date}
                    onChange={(e) => handleScheduledPartChange('date', e.target.value)}
                    fullWidth
                    InputLabelProps={{
                      shrink: true,
                    }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="실행 시작 시간"
                    value={scheduledParts.time}
                    onChange={(e) => handleScheduledPartChange('time', e.target.value)}
                    fullWidth
                    placeholder="09:00:00"
                    helperText="24시간 형식: HH:mm:ss"
                    inputProps={{
                      inputMode: 'numeric',
                      pattern: '^([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?$',
                    }}
                  />
                </Grid>
              </Grid>
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
              <Grid container spacing={1} sx={{ mt: 0.5 }}>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="반복 간격 (초)"
                    type="number"
                    value={formData?.runMode?.interval || 60}
                    onChange={(e) => {
                      handleChange('runMode', {
                        ...(formData?.runMode || {}),
                        interval: Math.max(1, parseInt(e.target.value, 10) || 1)
                      });
                    }}
                    fullWidth
                    inputProps={{ min: 1 }}
                    helperText="N초마다 반복 실행"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="최대 실행횟수"
                    type="number"
                    value={formData?.runMode?.maxRuns || 10}
                    onChange={(e) => {
                      handleChange('runMode', {
                        ...(formData?.runMode || {}),
                        maxRuns: Math.max(1, Math.min(parseInt(e.target.value, 10) || 1, 10000))
                      });
                    }}
                    fullWidth
                    inputProps={{ min: 1, max: 10000 }}
                    helperText="이 횟수만큼 실행 후 자동 중단"
                  />
                </Grid>
              </Grid>
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
