import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiClient } from '../api/client';

const TaskContext = createContext();

export function TaskProvider({ children }) {
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [loading, setLoading] = useState(false);

  // 태스크 로드
  const loadTasks = async () => {
    setLoading(true);
    try {
      const loadedTasks = await apiClient.getTasks();
      setTasks(loadedTasks);
    } catch (error) {
      console.error('태스크 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  // 태스크 저장
  const saveTask = async (task) => {
    try {
      await apiClient.saveTask(task);
      await loadTasks();
      return true;
    } catch (error) {
      console.error('태스크 저장 실패:', error);
      return false;
    }
  };

  // 태스크 삭제
  const deleteTask = async (id) => {
    try {
      await apiClient.deleteTask(id);
      await loadTasks();
      if (selectedTask?.id === id) {
        setSelectedTask(null);
      }
      return true;
    } catch (error) {
      console.error('태스크 삭제 실패:', error);
      return false;
    }
  };

  // 컴포넌트 마운트 시 태스크 로드
  useEffect(() => {
    loadTasks();
  }, []);

  const value = {
    tasks,
    selectedTask,
    setSelectedTask,
    loading,
    loadTasks,
    saveTask,
    deleteTask,
  };

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

export function useTasks() {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTasks must be used within a TaskProvider');
  }
  return context;
}
