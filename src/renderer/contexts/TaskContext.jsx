import React, { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';
import { apiClient } from '../api/client';

const TaskContext = createContext();

export function TaskProvider({ children }) {
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [loading, setLoading] = useState(false);

  // 태스크 로드
  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const loadedTasks = await apiClient.getTasks();
      setTasks(loadedTasks);
    } catch (error) {
      console.error('태스크 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 태스크 저장
  const saveTask = useCallback(async (task) => {
    try {
      const savedTask = await apiClient.saveTask(task);
      setTasks((currentTasks) => {
        const index = currentTasks.findIndex((item) => item.id === savedTask.id);
        if (index === -1) {
          return [...currentTasks, savedTask];
        }

        const nextTasks = [...currentTasks];
        nextTasks[index] = savedTask;
        return nextTasks;
      });
      setSelectedTask((currentTask) => (
        currentTask?.id === savedTask.id ? savedTask : currentTask
      ));
      return true;
    } catch (error) {
      console.error('태스크 저장 실패:', error);
      return false;
    }
  }, []);

  // 태스크 삭제
  const deleteTask = useCallback(async (id) => {
    try {
      await apiClient.deleteTask(id);
      setTasks((currentTasks) => currentTasks.filter((task) => task.id !== id));
      setSelectedTask((currentTask) => (currentTask?.id === id ? null : currentTask));
      return true;
    } catch (error) {
      console.error('태스크 삭제 실패:', error);
      return false;
    }
  }, []);

  // 컴포넌트 마운트 시 태스크 로드
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const value = useMemo(() => ({
    tasks,
    selectedTask,
    setSelectedTask,
    loading,
    loadTasks,
    saveTask,
    deleteTask,
  }), [deleteTask, loadTasks, loading, saveTask, selectedTask, tasks]);

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

export function useTasks() {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTasks must be used within a TaskProvider');
  }
  return context;
}
