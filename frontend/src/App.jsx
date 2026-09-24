import { Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Navbar, Footer } from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import NewRequest from './pages/NewRequest';
import Results from './pages/Results';
import ShelterList from './pages/ShelterList';
import ShelterDetail from './pages/ShelterDetail';
import RequestHistory from './pages/RequestHistory';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminShelters from './pages/admin/AdminShelters';
import AdminShelterForm from './pages/admin/AdminShelterForm';
import AdminRequests from './pages/admin/AdminRequests';
import AdminRequestDetail from './pages/admin/AdminRequestDetail';
import AdminAllocations from './pages/admin/AdminAllocations';
import AdminHistory from './pages/admin/AdminHistory';
import AdminUsers from './pages/admin/AdminUsers';
import NotFound from './pages/NotFound';

/** Returns to the top of the page on navigation. */
function ScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  const { isAuthenticated } = useAuth();
  // Marketing (Landing/Login/Register) uses Public Sans + sharp corners;
  // every authenticated screen uses Inter + rounded corners. See
  // styles/global.css for the .ctx-marketing / .ctx-app token overrides.
  const ctx = isAuthenticated ? 'ctx-app' : 'ctx-marketing';

  return (
    <div className={ctx}>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <div className={isAuthenticated ? 'app-shell' : undefined}>
        <Navbar />
      </div>
      <ScrollReset />

      <main id="main">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/request/new" element={<ProtectedRoute><NewRequest /></ProtectedRoute>} />
          <Route path="/requests" element={<ProtectedRoute><RequestHistory /></ProtectedRoute>} />
          <Route path="/requests/:id" element={<ProtectedRoute><Results /></ProtectedRoute>} />
          <Route path="/shelters" element={<ProtectedRoute><ShelterList /></ProtectedRoute>} />
          <Route path="/shelters/:id" element={<ProtectedRoute><ShelterDetail /></ProtectedRoute>} />

          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/shelters" element={<ProtectedRoute adminOnly><AdminShelters /></ProtectedRoute>} />
          <Route path="/admin/shelters/new" element={<ProtectedRoute adminOnly><AdminShelterForm /></ProtectedRoute>} />
          <Route path="/admin/shelters/:id/edit" element={<ProtectedRoute adminOnly><AdminShelterForm /></ProtectedRoute>} />
          <Route path="/admin/requests" element={<ProtectedRoute adminOnly><AdminRequests /></ProtectedRoute>} />
          <Route path="/admin/requests/:id" element={<ProtectedRoute adminOnly><AdminRequestDetail /></ProtectedRoute>} />
          <Route path="/admin/allocations" element={<ProtectedRoute adminOnly><AdminAllocations /></ProtectedRoute>} />
          <Route path="/admin/history" element={<ProtectedRoute adminOnly><AdminHistory /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute adminOnly><AdminUsers /></ProtectedRoute>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <Footer app={isAuthenticated} />
    </div>
  );
}
