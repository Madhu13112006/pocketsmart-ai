import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, MonthProvider, useApp } from './lib/context.jsx';
import Layout from './components/Layout.jsx';
import Auth from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Ledger from './pages/Ledger.jsx';
import Budget from './pages/Budget.jsx';
import Goals from './pages/Goals.jsx';
import Afford from './pages/Afford.jsx';
import Planner from './pages/Planner.jsx';
import Account from './pages/Account.jsx';

function Gate({ children, guest = false }) {
  const { user, booting, bootError } = useApp();
  if (booting) return <div className="center-screen" role="status">Loading PocketSmart…</div>;
  if (bootError) {
    return (
      <div className="center-screen" style={{ padding: 24, textAlign: 'center' }}>
        <div>
          <p>{bootError}</p>
          <button className="btn" type="button" onClick={() => window.location.reload()}>Try again</button>
        </div>
      </div>
    );
  }
  if (guest) return user ? <Navigate to="/" replace /> : children;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route path="/login" element={<Gate guest><Auth mode="login" /></Gate>} />
          <Route path="/register" element={<Gate guest><Auth mode="register" /></Gate>} />
          <Route element={<Gate><MonthProvider><Layout /></MonthProvider></Gate>}>
            <Route index element={<Dashboard />} />
            <Route path="ledger" element={<Ledger />} />
            <Route path="budget" element={<Budget />} />
            <Route path="goals" element={<Goals />} />
            <Route path="afford" element={<Afford />} />
            <Route path="planner" element={<Planner />} />
            <Route path="account" element={<Account />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}
