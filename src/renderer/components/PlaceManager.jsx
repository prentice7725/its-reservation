import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grid,
  IconButton,
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
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
import { apiClient } from '../api/client';
import { useTasks } from '../contexts/TaskContext';

const emptyForm = {
  id: '',
  name: '',
  queryString: '',
};

function normalizePlaces(places) {
  return Object.entries(places || {})
    .map(([id, data]) => ({
      id,
      name: data?.name || '',
      queryString: data?.queryString || data?.s || '',
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

    tasks.forEach((task) => {
      (task.places || []).forEach((placeId) => {
        const current = usage.get(placeId) || [];
        usage.set(placeId, [...current, task.name || task.id]);
      });
    });

    return usage;
  }, [tasks]);

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
    setFormData(place);
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
    const nextPlaces = {
      ...places,
      [id]: {
        name: formData.name.trim(),
        queryString: formData.queryString.trim(),
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
        queryString: savedPlaces[id]?.queryString || '',
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
                label="Query String"
                value={formData.queryString}
                onChange={(event) => handleChange('queryString', event.target.value)}
                fullWidth
                multiline
                minRows={4}
              />

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
                    <TableCell>사용</TableCell>
                    <TableCell align="right">작업</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {placeRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3}>
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
                              {place.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {place.id}
                            </Typography>
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
