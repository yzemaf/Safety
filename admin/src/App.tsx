import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { AuthProvider } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { ProtectedRoute } from './components/ProtectedRoute';

import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { RadarPage } from './pages/admin/RadarPage';
import { IncidentsPage } from './pages/admin/IncidentsPage';
import { ReportDetailPage } from './pages/admin/ReportDetailPage';
import { StaffPage } from './pages/admin/StaffPage';

export const App: React.FC = () => {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#10B981',
          colorSuccess: '#10B981',
          colorWarning: '#F59E0B',
          colorError: '#EF4444',
          colorLink: '#10B981',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          borderRadius: 8,
          fontSize: 13,
          controlHeight: 34,
          controlHeightSM: 28,
        },
        components: {
          Select: {
            fontSize: 12,
            optionFontSize: 12,
            colorBorder: '#E2E8F0',
          },
          Input: {
            fontSize: 13,
            colorBorder: '#E2E8F0',
          },
        },
      }}
    >
      <BrowserRouter>
        <AuthProvider>
          <DataProvider>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />

              {/* Protected Admin Routes */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute>
                    <AdminLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/admin/radar" replace />} />
                <Route path="radar" element={<RadarPage />} />
                <Route path="incidents" element={<IncidentsPage />} />
                <Route path="incidents/:id" element={<ReportDetailPage />} />
                <Route path="staff" element={<StaffPage />} />
              </Route>

              {/* Fallback Catch-all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </DataProvider>
        </AuthProvider>
      </BrowserRouter>
    </ConfigProvider>
  );
};

export default App;

