import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout           from './components/Layout';
import Landing          from './pages/Landing';
import ProtectedRoute   from './components/ProtectedRoute';
import { getSessionUser } from './hooks/useAuth';
import { TempAccessProvider } from './hooks/useTempAccess';

// Pages
import Overview         from './pages/euc/Overview';
import Fixes            from './pages/euc/Fixes';
import HipChecks        from './pages/euc/HipChecks';
import Security         from './pages/euc/Security';
import SystemInfo       from './pages/euc/SystemInfo';
import Pins             from './pages/euc/EucPins';
import ExecutiveDevices from './pages/euc/ExecutiveDevices';
import AdminSettings    from './pages/euc/AdminSettings';

// Defined outside App so its identity is stable across re-renders.
// Defining it inside App causes React to treat it as a new component type
// on every render, which unmounts and remounts the entire subtree (including
// Layout) — resetting all timers and state.
function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = getSessionUser();
  return user ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('hexa-theme') === 'dark' ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches && !localStorage.getItem('hexa-theme'));
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('hexa-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Stable reference — does not change between renders, so Layout never remounts
  const toggleDark = useCallback(() => setDarkMode(p => !p), []);

  return (
    <BrowserRouter>
      <Routes>
        {/* Landing / Login */}
        <Route path="/" element={<Landing />} />

        {/* Dashboard — requires login, wrapped in TempAccessProvider */}
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <TempAccessProvider>
                <Layout darkMode={darkMode} toggleDark={toggleDark} />
              </TempAccessProvider>
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview"    element={<ProtectedRoute page="overview"><Overview /></ProtectedRoute>} />
          <Route path="system"      element={<ProtectedRoute page="system"><SystemInfo /></ProtectedRoute>} />
          <Route path="executive"   element={<ProtectedRoute page="executive"><ExecutiveDevices /></ProtectedRoute>} />
          <Route path="fixes"       element={<ProtectedRoute page="fixes"><Fixes /></ProtectedRoute>} />
          <Route path="hip"         element={<ProtectedRoute page="hip"><HipChecks /></ProtectedRoute>} />
          <Route path="pins"        element={<ProtectedRoute page="pins"><Pins /></ProtectedRoute>} />
          <Route path="security"    element={<ProtectedRoute page="security"><Security /></ProtectedRoute>} />
          <Route path="admin"       element={<ProtectedRoute page="admin"><AdminSettings /></ProtectedRoute>} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
