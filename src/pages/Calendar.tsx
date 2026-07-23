import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../database/db';
import { AR } from '../constants/arabicTerms';
import { fmtMoney } from '../utils/dateHelpers';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { CalendarDays, ChevronRight, ChevronLeft } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, isToday, getDay } from 'date-fns';
import { ar } from 'date-fns/locale';

interface CalEvent {
  date: Date;
  label: string;
  type: 'invoice' | 'contract_end' | 'maintenance' | 'task';
  amount?: number;
  status?: string;
}

export default function Calendar() {
  const [current, setCurrent] = useState(new Date());

  const invoices     = useLiveQuery(() => db.invoices.toArray(), []) || [];
  const contracts    = useLiveQuery(() => db.contracts.toArray(), []) || [];
  const maintenance  = useLiveQuery(() => db.maintenance.toArray(), []) || [];
  const tasks        = useLiveQuery(() => db.tasks.toArray(), []) || [];
  const properties   = useLiveQuery(() => db.properties.toArray(), []) || [];

  const propName = (id: string) => properties.find((p) => p.id === id)?.name || '—';

  const events = useMemo((): CalEvent[] => {
    const list: CalEvent[] = [];
    // Invoice due dates
    invoices.filter((i) => i.status !== 'paid').forEach((i) => {
      list.push({ date: new Date(i.dueDate), label: `فاتورة ${i.invoiceNumber}`, type: 'invoice', amount: i.amountDue - i.amountPaid, status: i.status });
    });
    // Contract end dates
    contracts.filter((c) => c.status === 'active' || c.status === 'extended').forEach((c) => {
      list.push({ date: new Date(c.endDate), label: `انتهاء عقد: ${propName(c.propertyId)}`, type: 'contract_end' });
    });
    // Maintenance
    maintenance.filter((m) => m.scheduledDate && m.status !== 'completed').forEach((m) => {
      list.push({ date: new Date(m.scheduledDate!), label: `صيانة: ${m.title}`, type: 'maintenance' });
    });
    // Tasks
    tasks.filter((t) => t.dueDate && t.status !== 'done').forEach((t) => {
      list.push({ date: new Date(t.dueDate!), label: t.title, type: 'task' });
    });
    return list;
  }, [invoices, contracts, maintenance, tasks, properties]);

  const monthStart = startOfMonth(current);
  const monthEnd   = endOfMonth(current);
  const days       = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Pad start (RTL: week starts Sunday=0; in Arabic calendar Saturday is often first, but we use Sunday)
  const startPad = getDay(monthStart); // 0=Sun, 6=Sat
  const paddedDays = [...Array(startPad).fill(null), ...days];

  const eventsByDay = (day: Date) => events.filter((e) => isSameDay(e.date, day));

  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const selectedEvents = selectedDay ? events.filter((e) => isSameDay(e.date, selectedDay)) : [];

  const TYPE_COLOR: Record<string, string> = {
    invoice:      'bg-warning/20 text-warning',
    contract_end: 'bg-destructive/20 text-destructive',
    maintenance:  'bg-accent/20 text-accent',
    task:         'bg-success/20 text-success',
  };

  const TYPE_LABEL: Record<string, string> = {
    invoice:      'فاتورة',
    contract_end: 'انتهاء عقد',
    maintenance:  'صيانة',
    task:         'مهمة',
  };

  const weekDays = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

  return (
    <div className="space-y-4" data-testid="calendar-page">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2"><CalendarDays className="h-6 w-6" /> {AR.nav.calendar}</h2>
        <p className="text-sm text-muted-foreground mt-1">الاستحقاقات والمواعيد المجدولة على تقويم شهري.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="glass border-0 lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{format(current, 'MMMM yyyy', { locale: ar })}</CardTitle>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCurrent(addMonths(current, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCurrent(new Date())}>اليوم</Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCurrent(subMonths(current, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 pb-3">
            <div className="grid grid-cols-7 border-b border-border/30">
              {weekDays.map((d) => (
                <div key={d} className="text-center text-xs text-muted-foreground font-medium py-2">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {paddedDays.map((day, idx) => {
                if (!day) return <div key={`pad-${idx}`} />;
                const dayEvents = eventsByDay(day);
                const isSelected = selectedDay && isSameDay(day, selectedDay);
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDay(isSameDay(day, selectedDay as Date) ? null : day)}
                    className={`relative p-1 min-h-14 flex flex-col items-center gap-0.5 border-b border-r border-border/20 transition-colors hover:bg-muted/50
                      ${isSelected ? 'bg-primary/10' : ''}
                      ${!isSameMonth(day, current) ? 'opacity-30' : ''}
                    `}
                  >
                    <span className={`text-xs w-6 h-6 flex items-center justify-center rounded-full font-medium
                      ${isToday(day) ? 'bg-primary text-primary-foreground' : ''}
                    `}>{format(day, 'd')}</span>
                    <div className="flex flex-wrap gap-0.5 justify-center">
                      {dayEvents.slice(0, 3).map((e, i) => (
                        <span key={i} className={`h-1.5 w-1.5 rounded-full ${TYPE_COLOR[e.type].split(' ')[0]}`} />
                      ))}
                      {dayEvents.length > 3 && <span className="text-[10px] text-muted-foreground">+{dayEvents.length - 3}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {/* Legend */}
          <Card className="glass border-0">
            <CardHeader className="pb-2"><CardTitle className="text-sm">الأنواع</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 pt-0">
              {Object.entries(TYPE_LABEL).map(([type, label]) => (
                <div key={type} className="flex items-center gap-2 text-xs">
                  <span className={`h-2.5 w-2.5 rounded-full ${TYPE_COLOR[type].split(' ')[0]}`} />
                  {label}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Selected day events */}
          <Card className="glass border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {selectedDay ? format(selectedDay, 'd MMMM yyyy', { locale: ar }) : 'اختر يوماً'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {!selectedDay && <p className="text-xs text-muted-foreground">اضغط على يوم للاطلاع على أحداثه</p>}
              {selectedDay && selectedEvents.length === 0 && <p className="text-xs text-muted-foreground">لا توجد أحداث في هذا اليوم</p>}
              {selectedEvents.map((e, i) => (
                <div key={i} className={`rounded-lg p-2.5 text-xs ${TYPE_COLOR[e.type]}`}>
                  <Badge variant="outline" className={`text-[10px] mb-1 ${TYPE_COLOR[e.type]}`}>{TYPE_LABEL[e.type]}</Badge>
                  <div className="font-medium">{e.label}</div>
                  {e.amount !== undefined && <div className="num mt-0.5">{fmtMoney(e.amount)}</div>}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Upcoming (next 7 days) */}
          <Card className="glass border-0">
            <CardHeader className="pb-2"><CardTitle className="text-sm">الأسبوع القادم</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 pt-0">
              {(() => {
                const now = new Date();
                const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                const upcoming = events.filter((e) => e.date >= now && e.date <= in7).sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 6);
                if (upcoming.length === 0) return <p className="text-xs text-muted-foreground">{AR.dashboard.noUpcoming}</p>;
                return upcoming.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${TYPE_COLOR[e.type].split(' ')[0]}`} />
                    <span className="flex-1 truncate">{e.label}</span>
                    <span className="text-muted-foreground shrink-0">{format(e.date, 'd/M')}</span>
                  </div>
                ));
              })()}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
