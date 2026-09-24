import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loading } from './Ui';

/**
 * Gate for authenticated routes. Waits for the initial session check so a
 * signed-in user reloading the page is not bounced to the login screen,
 * and remembers where they were headed.
 */
export default function ProtectedRoute({ children, adminOnly = false }) {
  const { isAuthenticated, isAdmin, initialising } = useAuth();
  const location = useLocation();

  if (initialising) return <Loading label="Checking your session" />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/dashboard" replace state={{ denied: true }} />;
  }

  return children;
}
