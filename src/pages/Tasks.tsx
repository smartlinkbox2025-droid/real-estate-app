import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../database/db';
import { AR } from '../constants/arabicTerms';
import type { Task, TaskStatus, TaskPriority } from '../models/types';
import { createTask, updateTask, deleteTask } from '../database/queries';
import { fmtDate, toISODate } from '../utils/dateHelpers';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Plus, Pencil, Trash2, CheckSquare, Circle, CheckCircle2, Clock, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { generateArabicPDF } from '../utils/pdfGenerator';

const STATUS_ICON: Record<TaskStatus, React.ReactNode> = {
  todo:        <Circle className="h-4 w-4 text-muted-foreground" />,
  in_progress: <Clock className="h-4 w-4 text-accent" />,
  done:        <CheckCircle2 className="h-4 w-4 text-success" />,
};

const PRIORITY_TONE: Record<TaskPriority, string> = {
  low:    'bg-muted text-muted-foreground border-border',
  medium: 'bg-accent/10 text-accent border-accent/20',
  high:   'bg-warning/15 text-warning border-warning/30',
};

export default function Tasks() {
  const tasks = useLiveQuery(() => db.tasks.toArray(), []) || [];
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const filtered = useMemo(() =>
    statusFilter === 'all' ? tasks : tasks.filter((t) => t.status === statusFilter),
    [tasks, statusFilter]);

  const grouped = useMemo(() => {
    const todo        = filtered.filter((t) => t.status === 'todo');
    const in_progress = filtered.filter((t) => t.status === 'in_progress');
    const done        = filtered.filter((t) => t.status === 'done');
    return { todo, in_progress, done };
  }, [filtered]);

  const onDelete = async (id: string, title: string) => {
    if (!confirm(`${AR.common.confirmDelete}\n${title}`)) return;
    try { await deleteTask(id); toast.success('تم حذف المهمة'); }
    catch (e: any) { toast.error(e.message || AR.common.error); }
  };

  const cycleStatus = async (task: Task) => {
    const next: Record<TaskStatus, TaskStatus> = { todo: 'in_progress', in_progress: 'done', done: 'todo' };
    await updateTask(task.id!, { status: next[task.status] });
  };

  const exportPdf = async () => {
    try {
      await generateArabicPDF({
        title: AR.tasks.title,
        subtitle: `قيد الانتظار: ${grouped.todo.length} · قيد التنفيذ: ${grouped.in_progress.length} · منتهية: ${grouped.done.length}`,
        filename: `المهام_${new Date().toISOString().slice(0, 10)}.pdf`,
        sections: [
          { heading: 'قيد الانتظار', table: { headers: ['العنوان', 'الأولوية', 'تاريخ الاستحقاق', 'الوصف'], rows: grouped.todo.map((t) => [t.title, AR.tasks.priorities[t.priority], t.dueDate ? fmtDate(t.dueDate) : '—', t.description || '—']) } },
          { heading: 'قيد التنفيذ',  table: { headers: ['العنوان', 'الأولوية', 'تاريخ الاستحقاق', 'الوصف'], rows: grouped.in_progress.map((t) => [t.title, AR.tasks.priorities[t.priority], t.dueDate ? fmtDate(t.dueDate) : '—', t.description || '—']) } },
          { heading: 'منتهية',        table: { headers: ['العنوان', 'الأولوية', 'تاريخ الاستحقاق', 'الوصف'], rows: grouped.done.map((t) => [t.title, AR.tasks.priorities[t.priority], t.dueDate ? fmtDate(t.dueDate) : '—', t.description || '—']) } },
        ],
      });
      toast.success('تم تنزيل ملف PDF بنجاح');
    } catch (e: any) {
      toast.error('تعذّر إنشاء PDF: ' + (e.message || ''));
    }
  };

  return (
    <div className="space-y-4" data-testid="tasks-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><CheckSquare className="h-6 w-6" /> {AR.tasks.title}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            قيد الانتظار: <span className="font-bold">{grouped.todo.length}</span> ·
            قيد التنفيذ: <span className="font-bold">{grouped.in_progress.length}</span> ·
            منتهية: <span className="font-bold">{grouped.done.length}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="الحالة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{AR.actions.all}</SelectItem>
              {(Object.keys(AR.tasks.statuses) as TaskStatus[]).map((k) => <SelectItem key={k} value={k}>{AR.tasks.statuses[k]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportPdf} className="gap-1.5" data-testid="export-pdf-button">
            <FileDown className="h-4 w-4" /> PDF
          </Button>
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-1.5">
            <Plus className="h-4 w-4" /> {AR.tasks.addNew}
          </Button>
        </div>
      </div>

      {/* Board columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {([['todo', 'قيد الانتظار', grouped.todo], ['in_progress', 'قيد التنفيذ', grouped.in_progress], ['done', 'منتهية', grouped.done]] as [TaskStatus, string, Task[]][]).map(([status, label, group]) => (
          <div key={status} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              {STATUS_ICON[status]}
              <span className="text-sm font-semibold">{label}</span>
              <span className="text-xs text-muted-foreground ml-auto">({group.length})</span>
            </div>
            <div className="space-y-2 min-h-24">
              {group.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-6 rounded-xl border border-dashed border-border">{AR.common.empty}</div>
              )}
              {group.map((task) => (
                <Card key={task.id} className="glass border-0 p-4 space-y-2" data-testid={`task-card-${task.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <button onClick={() => cycleStatus(task)} className="mt-0.5 shrink-0" title="تغيير الحالة">
                      {STATUS_ICON[task.status]}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium leading-tight ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>{task.title}</p>
                      {task.description && <p className="text-xs text-muted-foreground mt-1 truncate">{task.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className={PRIORITY_TONE[task.priority]}>{AR.tasks.priorities[task.priority]}</Badge>
                      {task.dueDate && <span className="text-[11px] text-muted-foreground">{fmtDate(task.dueDate)}</span>}
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditing(task); setDialogOpen(true); }}><Pencil className="h-3 w-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => onDelete(task.id!, task.title)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      <TaskDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  );
}

function TaskDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (v: boolean) => void; editing: Task | null }) {
  const [form, setForm] = useState<Partial<Task>>({});

  useEffect(() => {
    if (editing) setForm(editing);
    else setForm({ title: '', description: '', priority: 'medium', status: 'todo' });
  }, [editing, open]);

  const submit = async () => {
    if (!form.title) { toast.error('يرجى إدخال عنوان المهمة'); return; }
    try {
      if (editing?.id) { await updateTask(editing.id, form); toast.success('تم تحديث المهمة'); }
      else { await createTask({ title: form.title!, description: form.description, priority: form.priority as TaskPriority || 'medium', status: form.status as TaskStatus || 'todo', dueDate: form.dueDate }); toast.success('تمت إضافة المهمة'); }
      onOpenChange(false);
    } catch (e: any) { toast.error(e.message || AR.common.error); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? AR.tasks.editTitle : AR.tasks.addNew}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label={AR.common.title}><Input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus /></Field>
          <Field label={AR.common.description}><Textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={AR.common.priority}>
              <Select value={form.priority || 'medium'} onValueChange={(v) => setForm({ ...form, priority: v as TaskPriority })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(AR.tasks.priorities) as TaskPriority[]).map((k) => <SelectItem key={k} value={k}>{AR.tasks.priorities[k]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label={AR.tasks.dueDate}><Input type="date" value={form.dueDate ? toISODate(new Date(form.dueDate)) : ''} onChange={(e) => setForm({ ...form, dueDate: e.target.value ? new Date(e.target.value) : undefined })} /></Field>
          </div>
          <Field label={AR.common.status}>
            <Select value={form.status || 'todo'} onValueChange={(v) => setForm({ ...form, status: v as TaskStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(AR.tasks.statuses) as TaskStatus[]).map((k) => <SelectItem key={k} value={k}>{AR.tasks.statuses[k]}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{AR.actions.cancel}</Button>
          <Button onClick={submit}>{AR.actions.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
