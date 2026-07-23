import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import Properties from './pages/Properties';
import Customers from './pages/Customers';
import Contracts from './pages/Contracts';
import Payments from './pages/Payments';
import Settings from './pages/Settings';
import Maintenance from './pages/Maintenance';
import Tasks from './pages/Tasks';
import Calendar from './pages/Calendar';
import Documents from './pages/Documents';
import ActivityLog from './pages/ActivityLog';
import FinancialReport from './reports/FinancialReport';
import VacancyTracker from './reports/VacancyTracker';
import DataEngine from './backup/DataEngine';
import NotFound from './pages/not-found';

const base = import.meta.env.BASE_URL;

export default function App() {
  return (
    <BrowserRouter basename={base}>
      <Toaster
        position="top-center"
        richColors
        dir="rtl"
        toastOptions={{ style: { fontFamily: 'Cairo, sans-serif' } }}
      />
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="properties" element={<Properties />} />
          <Route path="customers" element={<Customers />} />
          <Route path="contracts" element={<Contracts />} />
          <Route path="payments" element={<Payments />} />
          <Route path="maintenance" element={<Maintenance />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="documents" element={<Documents />} />
          <Route path="activity" element={<ActivityLog />} />
          <Route path="reports/financial" element={<FinancialReport />} />
          <Route path="reports/vacancy" element={<VacancyTracker />} />
          <Route path="backup" element={<DataEngine />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
