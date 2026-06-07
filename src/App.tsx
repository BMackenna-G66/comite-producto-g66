import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
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

export default function App() {
  return (
    <BrowserRouter basename="/comite-producto-g66">
      <Routes>
        {/* Gobierno */}
        <Route path="/" element={<AppLayout><DashboardPage /></AppLayout>} />
        <Route path="/products" element={<AppLayout><ProductsPage /></AppLayout>} />
        <Route path="/products/new" element={<AppLayout><NewProductPage /></AppLayout>} />
        <Route path="/products/:id" element={<AppLayout><ProductDetailPage /></AppLayout>} />
        <Route path="/analyze" element={<AppLayout><DocumentAnalysisPage /></AppLayout>} />
        <Route path="/sessions" element={<AppLayout><SessionsPage /></AppLayout>} />
        <Route path="/sessions/new" element={<AppLayout><CommitteeSessionPage /></AppLayout>} />
        <Route path="/sessions/:id" element={<AppLayout><CommitteeSessionPage /></AppLayout>} />
        {/* Risk Management */}
        <Route path="/risks" element={<AppLayout><RisksPage /></AppLayout>} />
        <Route path="/corporate-risks" element={<AppLayout><CorporateRisksPage /></AppLayout>} />
        <Route path="/kris" element={<AppLayout><KRIsPage /></AppLayout>} />
        <Route path="/appetite" element={<AppLayout><RiskAppetitePage /></AppLayout>} />
        {/* Eventos & Controles */}
        <Route path="/events" element={<AppLayout><RiskEventsPage /></AppLayout>} />
        <Route path="/controls" element={<AppLayout><ControlTestingPage /></AppLayout>} />
        {/* Compliance */}
        <Route path="/regulatory" element={<AppLayout><RegulatoryPage /></AppLayout>} />
        {/* IA */}
        <Route path="/copilot" element={<AppLayout fullHeight><AICopilotPage /></AppLayout>} />
        {/* Sistema */}
        <Route path="/admin" element={<AppLayout><AdminPage /></AppLayout>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
