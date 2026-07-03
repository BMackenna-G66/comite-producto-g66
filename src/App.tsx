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
import DocumentAnalysisPage from './pages/DocumentAnalysisPage';
import AdminPage from './pages/AdminPage';
// GRC / ERM layers
import CorporateRisksPage from './pages/CorporateRisksPage';
import KRIsPage from './pages/KRIsPage';
import RiskAppetitePage from './pages/RiskAppetitePage';
import RiskEventsPage from './pages/RiskEventsPage';
import ControlTestingPage from './pages/ControlTestingPage';
import RegulatoryPage from './pages/RegulatoryPage';
import AICopilotPage from './pages/AICopilotPage';

function AppLayout({ children, fullHeight = false }: { children: React.ReactNode; fullHeight?: boolean }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className={`flex-1 overflow-auto ${fullHeight ? '' : ''}`}>{children}</main>
    </div>
  );
}

function Protected({ children, fullHeight = false }: { children: React.ReactNode; fullHeight?: boolean }) {
  return (
    <ProtectedRoute>
      <AppLayout fullHeight={fullHeight}>{children}</AppLayout>
    </ProtectedRoute>
  );
}

export default function App() {
  const auth = useAuthProvider();

  return (
    <AuthContext.Provider value={auth}>
      <BrowserRouter basename="/comite-producto-g66">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Gobierno */}
          <Route path="/" element={<Protected><DashboardPage /></Protected>} />
          <Route path="/products" element={<Protected><ProductsPage /></Protected>} />
          <Route path="/products/new" element={<Protected><NewProductPage /></Protected>} />
          <Route path="/products/:id" element={<Protected><ProductDetailPage /></Protected>} />
          <Route path="/analyze" element={<Protected><DocumentAnalysisPage /></Protected>} />
          <Route path="/sessions" element={<Protected><SessionsPage /></Protected>} />
          <Route path="/sessions/new" element={<Protected><CommitteeSessionPage /></Protected>} />
          <Route path="/sessions/:id" element={<Protected><CommitteeSessionPage /></Protected>} />
          {/* Risk Management */}
          <Route path="/risks" element={<Protected><RisksPage /></Protected>} />
          <Route path="/corporate-risks" element={<Protected><CorporateRisksPage /></Protected>} />
          <Route path="/kris" element={<Protected><KRIsPage /></Protected>} />
          <Route path="/appetite" element={<Protected><RiskAppetitePage /></Protected>} />
          {/* Eventos & Controles */}
          <Route path="/events" element={<Protected><RiskEventsPage /></Protected>} />
          <Route path="/controls" element={<Protected><ControlTestingPage /></Protected>} />
          {/* Compliance */}
          <Route path="/regulatory" element={<Protected><RegulatoryPage /></Protected>} />
          {/* IA */}
          <Route path="/copilot" element={<Protected fullHeight><AICopilotPage /></Protected>} />
          {/* Sistema */}
          <Route path="/admin" element={<Protected><AdminPage /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
