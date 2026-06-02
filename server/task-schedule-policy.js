export function shouldRegisterSchedule(task) {
  if (!task?.enabled || !task.startMode || !task.runMode) {
    return false;
  }

  return task.startMode.type === 'scheduled'
    || (task.startMode.type === 'manual' && ['repeat', 'cron'].includes(task.runMode.type));
}
