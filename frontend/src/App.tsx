import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import ConnectionsPage from './pages/ConnectionsPage';
import InboxPage from './pages/InboxPage';
import UsageAnalyticsPage from './pages/UsageAnalyticsPage';
import BillingPage from './pages/BillingPage';
import BillingSuccessPage from './pages/BillingSuccessPage';
import BillingCancelPage from './pages/BillingCancelPage';
import EntitlementTestPage from './pages/EntitlementTestPage';
import './App.css';
import AdminLimitsPage from './pages/AdminLimitsPage';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="app-loading-container">
        <div className="app-loading-content">
          <div className="app-loading-spinner"></div>
          <div className="app-loading-text">Loading...</div>
        </div>
      </div>
    );
  }
  
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/onboarding"
        element={
          <PrivateRoute>
            <OnboardingPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/connections"
        element={
          <PrivateRoute>
            <ConnectionsPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/inbox"
        element={
          <PrivateRoute>
            <InboxPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <PrivateRoute>
            <UsageAnalyticsPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/settings/billing"
        element={
          <PrivateRoute>
            <BillingPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/limits"
        element={
          <PrivateRoute>
            <AdminLimitsPage />
          </PrivateRoute>
        }
      />
      <Route path="/billing/success" element={<BillingSuccessPage />} />
      <Route path="/billing/cancel" element={<BillingCancelPage />} />
      <Route path="/test/entitlements" element={<EntitlementTestPage />} />
      <Route path="/" element={<Navigate to="/connections" />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}

export default App;

