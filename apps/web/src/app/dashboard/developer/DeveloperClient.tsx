'use client';

import React, { useState, useEffect } from 'react';

interface DevTask {
  id: string;
  title: string;
  description?: string | null;
  task_type: 'feature' | 'bug' | 'deployment' | 'refactor';
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'todo' | 'in_progress' | 'code_review' | 'done';
  deadline?: string | null;
  created_at: string;
}

export function DeveloperClient({ currentUserRole }: { currentUserRole: string }) {
  const [tasks, setTasks] = useState<DevTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  // New Task Modal State
  const [showModal, setShowModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskType, setTaskType] = useState<'feature' | 'bug' | 'deployment'>('feature');
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [taskDeadline, setTaskDeadline] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchTasks();
  }, []);

  async function fetchTasks() {
    setLoading(true);
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      if (data.success) {
        setTasks(data.tasks || []);
      } else {
        setNotice({ type: 'error', text: data.error || 'Failed to load developer tasks' });
      }
    } catch {
      setNotice({ type: 'error', text: 'Network error fetching tasks.' });
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateStatus(taskId: string, newStatus: string) {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setNotice({ type: 'success', text: `Task updated to ${newStatus.replace('_', ' ').toUpperCase()}` });
        fetchTasks();
      } else {
        setNotice({ type: 'error', text: data.error || 'Failed to update task' });
      }
    } catch {
      setNotice({ type: 'error', text: 'Network error updating task.' });
    }
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskTitle) return;

    setIsSubmitting(true);
    setNotice(null);

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: taskTitle,
          description: taskDesc,
          taskType,
          priority: taskPriority,
          deadline: taskDeadline || null,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setNotice({ type: 'success', text: 'Task / Deployment request logged successfully.' });
        setShowModal(false);
        setTaskTitle('');
        setTaskDesc('');
        fetchTasks();
      } else {
        setNotice({ type: 'error', text: data.error || 'Failed to create task' });
      }
    } catch {
      setNotice({ type: 'error', text: 'Network error creating task.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  const filteredTasks = tasks.filter((t) => {
    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    const matchesType = typeFilter === 'ALL' || t.task_type === typeFilter;
    return matchesStatus && matchesType;
  });

  const activeWork = tasks.filter((t) => t.status !== 'done').length;
  const openBugs = tasks.filter((t) => t.task_type === 'bug' && t.status !== 'done').length;
  const deployments = tasks.filter((t) => t.task_type === 'deployment').length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#FFFFFF] border border-[#E4E7EC] p-6 rounded-2xl shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-black text-[#151B2B] flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-600 animate-pulse" />
              Developer Workstation
            </h1>
            <span className="text-[11px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-[#ECEFF3] text-[#151B2B] border border-[#D0D5DD]">
              Engineering Workspace
            </span>
          </div>
          <p className="mt-1 text-xs text-[#525A6B]">
            Assigned development tasks, bug tracking, and deployment pipeline. Customer lead data & financial records are strictly isolated.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="px-4 py-2 text-xs font-bold bg-[#151B2B] hover:bg-[#2B313C] text-white rounded-xl transition-colors shadow-sm flex items-center gap-2 shrink-0 self-start sm:self-auto"
        >
          <span>+</span>
          <span>Log Task / Deploy Request</span>
        </button>
      </div>

      {/* Notice */}
      {notice && (
        <div
          className={`px-4 py-3 rounded-xl text-xs flex items-center justify-between shadow-sm border ${
            notice.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-red-50 text-red-900 border-red-200'
          }`}
        >
          <span className="font-semibold">{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-xs font-bold opacity-60 hover:opacity-100 ml-4"
          >
            &times;
          </button>
        </div>
      )}

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#FFFFFF] border border-[#E4E7EC] p-4 rounded-xl shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">Active Tasks</p>
          <p className="text-2xl font-black text-[#151B2B] mt-1">{activeWork}</p>
          <span className="text-[10px] text-[#525A6B]">Assigned to your queue</span>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E4E7EC] p-4 rounded-xl shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">Open Bugs</p>
          <p className="text-2xl font-black text-amber-600 mt-1">{openBugs}</p>
          <span className="text-[10px] text-[#525A6B]">Priority remediation</span>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E4E7EC] p-4 rounded-xl shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">Deployments</p>
          <p className="text-2xl font-black text-purple-600 mt-1">{deployments}</p>
          <span className="text-[10px] text-[#525A6B]">Worker builds tracked</span>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E4E7EC] p-4 rounded-xl shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">Build Health</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">100%</p>
          <span className="text-[10px] text-emerald-700 font-medium">OpenNext CF Passing</span>
        </div>
      </div>

      {/* Filter Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#FFFFFF] p-4 rounded-xl border border-[#E4E7EC]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[#525A6B]">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-[#D0D5DD] rounded-lg bg-[#F5F6F8]"
          >
            <option value="ALL">All Statuses</option>
            <option value="todo">Todo</option>
            <option value="in_progress">In Progress</option>
            <option value="code_review">Code Review</option>
            <option value="done">Done</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[#525A6B]">Type:</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-[#D0D5DD] rounded-lg bg-[#F5F6F8]"
          >
            <option value="ALL">All Types</option>
            <option value="feature">Feature</option>
            <option value="bug">Bug</option>
            <option value="deployment">Deployment</option>
            <option value="refactor">Refactor</option>
          </select>
        </div>
      </div>

      {/* Tasks Table */}
      <div className="bg-[#FFFFFF] border border-[#E4E7EC] rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-[#E4E7EC] flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#151B2B]">
            Engineering Backlog ({filteredTasks.length})
          </h2>
          <span className="text-xs text-[#525A6B]">
            {loading ? 'Refreshing...' : 'Durable Tasks'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#F5F6F8] border-b border-[#E4E7EC] text-[#525A6B] font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Work Item</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Deadline</th>
                <th className="py-3 px-4 text-right">Quick Transition</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EC]">
              {filteredTasks.map((t) => (
                <tr key={t.id} className="hover:bg-[#F9FAFB] transition-colors">
                  <td className="py-3.5 px-4">
                    <p className="font-bold text-[#151B2B]">{t.title}</p>
                    {t.description && <p className="text-[11px] text-[#525A6B] mt-0.5">{t.description}</p>}
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        t.task_type === 'bug'
                          ? 'bg-red-50 text-red-800'
                          : t.task_type === 'deployment'
                            ? 'bg-purple-50 text-purple-800'
                            : 'bg-blue-50 text-blue-800'
                      }`}
                    >
                      {t.task_type}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 capitalize font-semibold">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        t.priority === 'critical'
                          ? 'bg-red-100 text-red-900'
                          : t.priority === 'high'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {t.priority}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        t.status === 'done'
                          ? 'bg-emerald-50 text-emerald-800'
                          : t.status === 'in_progress'
                            ? 'bg-blue-50 text-blue-800'
                            : t.status === 'code_review'
                              ? 'bg-purple-50 text-purple-800'
                              : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {t.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-[#525A6B] font-mono">
                    {t.deadline ? new Date(t.deadline).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-3.5 px-4 text-right space-x-1.5">
                    {t.status !== 'in_progress' && t.status !== 'done' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(t.id, 'in_progress')}
                        className="px-2 py-1 rounded text-[10px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100"
                      >
                        Start
                      </button>
                    )}
                    {t.status === 'in_progress' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(t.id, 'code_review')}
                        className="px-2 py-1 rounded text-[10px] font-bold bg-purple-50 text-purple-700 hover:bg-purple-100"
                      >
                        Review
                      </button>
                    )}
                    {t.status !== 'done' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(t.id, 'done')}
                        className="px-2 py-1 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      >
                        Complete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredTasks.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#525A6B]">
                    No engineering tasks currently in your queue.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Task Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-[#FFFFFF] rounded-2xl p-6 max-w-md w-full shadow-xl border border-[#E4E7EC] space-y-4">
            <div className="flex items-center justify-between border-b border-[#E4E7EC] pb-3">
              <h3 className="text-base font-bold text-[#151B2B]">Log Engineering Task</h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-lg font-bold text-[#525A6B] hover:text-[#151B2B]"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-[#151B2B] mb-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Implement Webhook HMAC Verification"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#D0D5DD] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#151B2B]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#151B2B] mb-1">Description / Technical Notes</label>
                <textarea
                  rows={2}
                  placeholder="Technical scope, bug replication steps, or deployment target..."
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#D0D5DD] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#151B2B]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#151B2B] mb-1">Type</label>
                  <select
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-[#D0D5DD] rounded-xl bg-white"
                  >
                    <option value="feature">Feature</option>
                    <option value="bug">Bug</option>
                    <option value="deployment">Deployment</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#151B2B] mb-1">Priority</label>
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-[#D0D5DD] rounded-xl bg-white"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#151B2B] mb-1">Target Deadline</label>
                <input
                  type="date"
                  value={taskDeadline}
                  onChange={(e) => setTaskDeadline(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#D0D5DD] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#151B2B]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#525A6B] hover:text-[#151B2B]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-bold bg-[#151B2B] hover:bg-[#2B313C] text-white rounded-xl disabled:opacity-50"
                >
                  {isSubmitting ? 'Logging...' : 'Save Work Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

