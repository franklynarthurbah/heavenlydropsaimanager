import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { LoginPage } from './sections/LoginPage';
import { DashboardPage } from './sections/DashboardPage';
import { LeadsPage } from './sections/LeadsPage';
import { ConversationsPage } from './sections/ConversationsPage';
import { AppointmentsPage } from './sections/AppointmentsPage';
import { Layout } from './sections/Layout';
import EmailSystemPage from './sections/EmailSystemPage';
import './App.css';

function RequireAuth({ children }: { children: JSX.Element }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="conversations" element={<ConversationsPage />} />
          <Route path="appointments" element={<AppointmentsPage />} />
          <Route path="email-system" element={<EmailSystemPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
