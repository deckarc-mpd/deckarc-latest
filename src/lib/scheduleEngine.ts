import { supabase, Task } from './supabase';

function addWorkingDays(startDate: Date, days: number, allowSaturday = false, allowSunday = false): Date {
  const result = new Date(startDate);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day === 0 && !allowSunday) continue;
    if (day === 6 && !allowSaturday) continue;
    added++;
  }
  return result;
}

export async function cascadeDelayFromTask(
  projectId: string,
  rootTaskId: string,
  delayDays: number,
  changeType: string,
  reason: string,
  responsibleParty: string,
  actorName = 'System',
  actorRole = 'System'
): Promise<{ updatedCount: number; newProjectFinish: string | null }> {
  const { data: allTasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', projectId);

  if (!allTasks || allTasks.length === 0) return { updatedCount: 0, newProjectFinish: null };

  const taskMap = new Map<string, Task>(allTasks.map((t: Task) => [t.id, t]));

  // BFS to find all dependent tasks
  const affected: string[] = [];
  const queue: string[] = [rootTaskId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    allTasks.forEach((t: Task) => {
      if (t.dependency_task_id === current && !t.schedule_locked) {
        affected.push(t.id);
        queue.push(t.id);
      }
    });
  }

  const { data: project } = await supabase
    .from('projects')
    .select('projected_finish_date, expected_finish_date')
    .eq('id', projectId)
    .maybeSingle();

  const oldProjectFinish = project?.projected_finish_date || project?.expected_finish_date;

  // Update root task projected dates
  const rootTask = taskMap.get(rootTaskId);
  const updates: Array<{ id: string; old: Task; newProjStart: string | null; newProjFinish: string | null }> = [];

  if (rootTask) {
    const baseFinish = rootTask.projected_finish_date || rootTask.planned_finish_date;
    const baseStart = rootTask.projected_start_date || rootTask.planned_start_date;
    if (baseFinish) {
      const newFinish = addWorkingDays(new Date(baseFinish), delayDays);
      const newStart = baseStart ? addWorkingDays(new Date(baseStart), delayDays) : null;
      updates.push({
        id: rootTaskId,
        old: rootTask,
        newProjStart: newStart ? newStart.toISOString().split('T')[0] : null,
        newProjFinish: newFinish.toISOString().split('T')[0],
      });
    }
  }

  // Push all dependent tasks
  for (const taskId of affected) {
    const task = taskMap.get(taskId);
    if (!task) continue;
    const baseFinish = task.projected_finish_date || task.planned_finish_date;
    const baseStart = task.projected_start_date || task.planned_start_date;
    if (baseFinish) {
      const newFinish = addWorkingDays(new Date(baseFinish), delayDays);
      const newStart = baseStart ? addWorkingDays(new Date(baseStart), delayDays) : null;
      updates.push({
        id: taskId,
        old: task,
        newProjStart: newStart ? newStart.toISOString().split('T')[0] : null,
        newProjFinish: newFinish.toISOString().split('T')[0],
      });
    }
  }

  // Apply updates and log
  let latestFinish: Date | null = null;
  for (const u of updates) {
    await supabase.from('tasks').update({
      projected_start_date: u.newProjStart,
      projected_finish_date: u.newProjFinish,
      delay_days: (u.old.delay_days || 0) + delayDays,
      delay_source: changeType,
      delay_reason: reason,
    }).eq('id', u.id);

    await supabase.from('schedule_change_log').insert({
      project_id: projectId,
      affected_task_id: u.id,
      change_type: changeType,
      old_start_date: u.old.projected_start_date || u.old.planned_start_date,
      new_start_date: u.newProjStart,
      old_finish_date: u.old.projected_finish_date || u.old.planned_finish_date,
      new_finish_date: u.newProjFinish,
      old_projected_finish_date: oldProjectFinish,
      reason,
      responsible_party: responsibleParty,
    });

    const taskName = u.old.task_name || u.id;
    await supabase.from('activity_log').insert({
      project_id: projectId,
      user_id: null,
      user_full_name: actorName,
      user_role: actorRole,
      action_type: `Schedule Cascaded: ${changeType}`,
      module: 'Schedule',
      related_record_id: u.id,
      related_record_type: 'task',
      old_value: u.old.projected_finish_date || u.old.planned_finish_date || '',
      new_value: u.newProjFinish || '',
      notes: `${taskName} pushed +${delayDays}d. Reason: ${reason}`,
    });

    if (u.newProjFinish) {
      const d = new Date(u.newProjFinish);
      if (!latestFinish || d > latestFinish) latestFinish = d;
    }
  }

  // Update project projected_finish_date if needed
  let newProjectFinish: string | null = null;
  if (latestFinish && oldProjectFinish) {
    const oldDate = new Date(oldProjectFinish);
    if (latestFinish > oldDate) {
      newProjectFinish = latestFinish.toISOString().split('T')[0];
      await supabase.from('projects').update({
        projected_finish_date: newProjectFinish,
        status: 'Delayed',
        alert_status: 'red',
      }).eq('id', projectId);

      // Update log entries with new project finish
      for (const u of updates) {
        await supabase.from('schedule_change_log')
          .update({ new_projected_finish_date: newProjectFinish })
          .eq('affected_task_id', u.id)
          .eq('project_id', projectId)
          .is('new_projected_finish_date', null);
      }
    }
  }

  return { updatedCount: updates.length, newProjectFinish };
}
