import { useRef } from 'react';
import { AR } from '../constants/arabicTerms';
import { exportBackup, importBackup } from '../database/queries';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Download, Upload, Database } from 'lucide-react';
import { toast } from 'sonner';

export default function DataEngine() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onExport = async () => {
    try {
      const blob = await exportBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `نسخة_احتياطية_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('تم تنزيل النسخة الاحتياطية');
    } catch (e: any) {
      toast.error(e.message || AR.common.error);
    }
  };

  const onImportClick = () => fileInputRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('سيتم استبدال كل البيانات الحالية بمحتوى الملف. متابعة؟')) {
      e.target.value = '';
      return;
    }
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const text = String(reader.result);
        const result = await importBackup(text);
        if (result.ok) toast.success(result.message);
        else toast.error(result.message);
      };
      reader.onerror = () => toast.error('تعذّر قراءة الملف');
      reader.readAsText(file);
    } catch (err: any) {
      toast.error(err.message || AR.common.error);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-4" data-testid="data-engine-page">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Database className="h-6 w-6" /> {AR.nav.backup}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{AR.settings.backupDesc}</p>
      </div>
      <Card className="glass border-0" data-testid="data-engine-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4" /> {AR.settings.backupTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{AR.settings.backupDesc}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onExport} className="gap-1.5" data-testid="export-backup-button">
              <Download className="h-4 w-4" /> {AR.actions.exportJson}
            </Button>
            <Button variant="outline" onClick={onImportClick} className="gap-1.5" data-testid="import-backup-button">
              <Upload className="h-4 w-4" /> {AR.actions.importJson}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onFileChange}
              data-testid="import-backup-file-input"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
