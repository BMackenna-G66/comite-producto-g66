import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthContext, useAuthProvider } from './hooks/useAuth';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProductsPage from './pages/ProductsPage';
import ProductDetailPage from './pages/ProductDetailPage';
import NewProductPage from './pages/NewProductPage';
import CommitteeSessionPage from './pages/CommitteeSessionPage';
import SessionsPage from './pages/SessionsPage';
import RisksPage from './pages/RisksPage';
import AdminPage from './pages/AdminPage';

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

export default function App() {
  const auth = useAuthProvider();

  return (
    <AuthContext.Provider value={auth}>
      <BrowserRouter basename="/comite-producto-g66">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={
            <ProtectedRoute>
              <AppLayout><DashboardPage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/products" element={
            <ProtectedRoute>
              <AppLayout><ProductsPage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/products/new" element={
            <ProtectedRoute>
              <AppLayout><NewProductPage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/products/:id" element={
            <ProtectedRoute>
              <AppLayout><ProductDetailPage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/sessions" element={
            <ProtectedRoute>
              <AppLayout><SessionsPage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/sessions/new" element={
            <ProtectedRoute>
              <AppLayout><CommitteeSessionPage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/sessions/:id" element={
            <ProtectedRoute>
              <AppLayout><CommitteeSessionPage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/risks" element={
            <ProtectedRoute>
              <AppLayout><RisksPage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute>
              <AppLayout><AdminPage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
