import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  FormLabel,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import AddIcon from '@mui/icons-material/Add';
import AllInclusiveIcon from '@mui/icons-material/AllInclusive';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import { apiClient } from '../api/client';
import { useTasks } from '../contexts/TaskContext';

// season 값을 항상 배열로 정규화 (기존 문자열 값도 호환)
function normalizeSeason(season) {
  if (!season) return ['all'];
  if (Array.isArray(season)) return season.length > 0 ? season : ['all'];
  return [season];
}

const SEASON_CHIPS = [
  { value: 'all', label: '연중', color: 'default', icon: <AllInclusiveIcon fontSize="inherit" /> },
  { value: 'summer', label: '여름', color: 'warning', icon: <WbSunnyIcon fontSize="inherit" /> },
  { value: 'winter', label: '겨울', color: 'info', icon: <AcUnitIcon fontSize="inherit" /> },
];

const REGION_OPTIONS = [
  '東北',
  '関東',
  '中部',
  '近畿',
  '九州',
  '北海道',
  '四国',
  '沖縄',
];

function SeasonChips({ season }) {
  const seasons = normalizeSeason(season);
  if (seasons.includes('all')) {
    return <Chip icon={<AllInclusiveIcon fontSize="inherit" />} label="연중" size="small" color="default" variant="outlined" />;
  }
  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
      {seasons.includes('summer') && (
        <Chip icon={<WbSunnyIcon fontSize="inherit" />} label="여름" size="small" color="warning" variant="outlined" />
      )}
      {seasons.includes('winter') && (
        <Chip icon={<AcUnitIcon fontSize="inherit" />} label="겨울" size="small" color="info" variant="outlined" />
      )}
    </Box>
  );
}

const emptyForm = {
  id: '',
  name: '',
  region: '',
  queryString: '',
  season: ['all'],
};

function normalizePlaces(places) {
  return Object.entries(places || {})
    .map(([id, data]) => ({
      id,
      name: data?.name || '',
      region: data?.region || '',
      queryString: data?.queryString || data?.s || '',
      season: normalizeSeason(data?.season),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function PlaceManager({ onPlacesChanged }) {
  const { tasks, loadTasks } = useTasks();
  const [places, setPlaces] = React.useState({});
  const [formData, setFormData] = React.useState(emptyForm);
  const [editingId, setEditingId] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [message, setMessage] = React.useState(null);
  const [deleteTarget, setDeleteTarget] = React.useState(null);

  const placeRows = React.useMemo(() => normalizePlaces(places), [places]);

  const usageByPlace = React.useMemo(() => {
    const usage = new Map();
    const addUsage = (placeId, taskName) => {
      const current = usage.get(placeId) || [];
      usage.set(placeId, [...current, taskName]);
    };

    tasks.forEach((task) => {
      const taskName = task.name || task.id;
      const legacyUsesAllPlaces = !task.placeMode && (task.places || []).length === 0;

      if (task.placeMode === 'all' || legacyUsesAllPlaces) {
        placeRows.forEach((place) => addUsage(place.id, taskName));
        return;
      }

      (task.places || []).forEach((placeId) => addUsage(placeId, taskName));
    });

    return usage;
  }, [tasks, placeRows]);

  const loadPlaces = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const loadedPlaces = await apiClient.getPlaces();
      setPlaces(loadedPlaces);
    } catch (loadError) {
      console.error('장소 로드 실패:', loadError);
      setError(loadError.message || '장소를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadPlaces();
  }, [loadPlaces]);

  const resetForm = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setMessage(null);
    setError(null);
  };

  const handleEdit = (place) => {
    setEditingId(place.id);
    setFormData({ ...emptyForm, ...place });
    setMessage(null);
    setError(null);
  };

  const handleChange = (field, value) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const validateForm = () => {
    const id = formData.id.trim();

    if (!id) return '장소 ID를 입력하세요';
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) return '장소 ID는 영문, 숫자, _, -만 사용할 수 있습니다';
    if (!formData.name.trim()) return '장소 이름을 입력하세요';
    if (!formData.queryString.trim()) return 'Query String을 입력하세요';
    if (!editingId && places[id]) return '이미 존재하는 장소 ID입니다';

    return null;
  };

  const handleSave = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    const id = formData.id.trim();
    const seasonValue = normalizeSeason(formData.season);
    const nextPlaces = {
      ...places,
      [id]: {
        name: formData.name.trim(),
        region: formData.region.trim(),
        queryString: formData.queryString.trim(),
        season: seasonValue,
      },
    };

    setSaving(true);
    setError(null);

    try {
      const savedPlaces = await apiClient.savePlaces(nextPlaces);
      setPlaces(savedPlaces);
      setEditingId(id);
      setFormData({
        id,
        name: savedPlaces[id]?.name || '',
        region: savedPlaces[id]?.region || '',
        queryString: savedPlaces[id]?.queryString || '',
        season: normalizeSeason(savedPlaces[id]?.season),
      });
      setMessage('저장되었습니다');
      onPlacesChanged?.();
    } catch (saveError) {
      console.error('장소 저장 실패:', saveError);
      setError(saveError.message || '장소를 저장하지 못했습니다');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    const nextPlaces = { ...places };
    delete nextPlaces[deleteTarget.id];

    setSaving(true);
    setError(null);

    try {
      const savedPlaces = await apiClient.savePlaces(nextPlaces);
      const affectedTasks = tasks.filter((task) => (task.places || []).includes(deleteTarget.id));

      if (affectedTasks.length > 0) {
        await Promise.all(
          affectedTasks.map((task) => apiClient.saveTask({
            ...task,
            places: (task.places || []).filter((placeId) => placeId !== deleteTarget.id),
          }))
        );
        await loadTasks();
      }

      setPlaces(savedPlaces);
      setDeleteTarget(null);
      if (editingId === deleteTarget.id) {
        resetForm();
      }
      setMessage('삭제되었습니다');
      onPlacesChanged?.();
    } catch (deleteError) {
      console.error('장소 삭제 실패:', deleteError);
      setError(deleteError.message || '장소를 삭제하지 못했습니다');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          장소 관리
        </Typography>

        <Stack direction="row" spacing={1}>
          <Button size="small" startIcon={<AddIcon />} onClick={resetForm}>
            새 장소
          </Button>
          <Tooltip title="새로고침">
            <span>
              <IconButton size="small" onClick={loadPlaces} disabled={loading || saving}>
                <RefreshIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {message && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} md={5}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
              <TextField
                label="장소 ID"
                value={formData.id}
                onChange={(event) => handleChange('id', event.target.value)}
                disabled={Boolean(editingId)}
                fullWidth
                size="small"
              />
              <TextField
                label="장소 이름"
                value={formData.name}
                onChange={(event) => handleChange('name', event.target.value)}
                fullWidth
                size="small"
              />
              <TextField
                label="지역"
                value={formData.region}
                onChange={(event) => handleChange('region', event.target.value)}
                fullWidth
                size="small"
                select
              >
                {REGION_OPTIONS.map((region) => (
                  <MenuItem key={region} value={region}>
                    {region}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Query String"
                value={formData.queryString}
                onChange={(event) => handleChange('queryString', event.target.value)}
                fullWidth
                multiline
                minRows={4}
              />

              <Box>
                <FormLabel sx={{ fontSize: '0.75rem' }}>운영 시즌</FormLabel>
                <FormGroup row sx={{ mt: 0.5 }}>
                  {(() => {
                    const seasons = normalizeSeason(formData.season);
                    const isAll = seasons.includes('all');
                    const isSummer = seasons.includes('summer');
                    const isWinter = seasons.includes('winter');

                    const toggleAll = () => handleChange('season', ['all']);
                    const toggleSummer = () => {
                      if (isAll) {
                        handleChange('season', ['summer']);
                      } else {
                        const next = isSummer
                          ? seasons.filter((s) => s !== 'summer')
                          : [...seasons, 'summer'];
                        handleChange('season', next.length === 0 ? ['all'] : next);
                      }
                    };
                    const toggleWinter = () => {
                      if (isAll) {
                        handleChange('season', ['winter']);
                      } else {
                        const next = isWinter
                          ? seasons.filter((s) => s !== 'winter')
                          : [...seasons, 'winter'];
                        handleChange('season', next.length === 0 ? ['all'] : next);
                      }
                    };

                    return (
                      <>
                        <FormControlLabel
                          control={<Checkbox checked={isAll} onChange={toggleAll} size="small" />}
                          label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><AllInclusiveIcon fontSize="small" />연중</Box>}
                        />
                        <FormControlLabel
                          control={<Checkbox checked={!isAll && isSummer} onChange={toggleSummer} size="small" color="warning" />}
                          label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: (!isAll && isSummer) ? 'warning.main' : 'text.secondary' }}><WbSunnyIcon fontSize="small" />여름</Box>}
                        />
                        <FormControlLabel
                          control={<Checkbox checked={!isAll && isWinter} onChange={toggleWinter} size="small" color="info" />}
                          label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: (!isAll && isWinter) ? 'info.main' : 'text.secondary' }}><AcUnitIcon fontSize="small" />겨울</Box>}
                        />
                      </>
                    );
                  })()}
                </FormGroup>
                <Typography variant="caption" color="text.secondary">여름: 7/1~9/30 · 겨울: 12/20~3/31</Typography>
              </Box>

              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSave}
                disabled={saving}
              >
                저장
              </Button>
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} md={7}>
          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
                <CircularProgress size={28} />
              </Box>
            ) : (
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>장소</TableCell>
                    <TableCell>시즌</TableCell>
                    <TableCell>사용</TableCell>
                    <TableCell align="right">작업</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {placeRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                          장소가 없습니다
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    placeRows.map((place) => {
                      const usedTasks = usageByPlace.get(place.id) || [];
                      return (
                        <TableRow key={place.id} hover selected={editingId === place.id}>
                          <TableCell>
                            <Typography variant="body2" fontWeight={700}>
                              {place.name} {place.region && `(${place.region})`}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {place.id}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <SeasonChips season={place.season} />
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={`${usedTasks.length}개 태스크`}
                              size="small"
                              color={usedTasks.length > 0 ? 'primary' : 'default'}
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Tooltip title="편집">
                              <IconButton size="small" onClick={() => handleEdit(place)}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="삭제">
                              <IconButton size="small" color="error" onClick={() => setDeleteTarget(place)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            )}
          </Paper>
        </Grid>
      </Grid>

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>장소 삭제</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleteTarget?.name}을 삭제합니다.
            {(usageByPlace.get(deleteTarget?.id) || []).length > 0
              ? ' 이 장소는 사용 중인 태스크에서도 제거됩니다.'
              : ''}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>취소</Button>
          <Button color="error" onClick={handleDelete} disabled={saving}>
            삭제
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default PlaceManager;
