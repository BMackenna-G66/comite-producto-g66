import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import DashboardPage from './pages/DashboardPage';
import ProductsPage from './pages/ProductsPage';
import ProductDetailPage from './pages/ProductDetailPage';
import NewProductPage from './pages/NewProductPage';
import CommitteeSessionPage from './pages/CommitteeSessionPage';
import SessionsPage from './pages/SessionsPage';
import RisksPage from './pages/RisksPage';
import AdminPage from './pages/AdminPage';
import DocumentAnalysisPage from './pages/DocumentAnalysisPage';

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter basename="/comite-producto-g66">
      <Routes>
        <Route path="/" element={<AppLayout><DashboardPage /></AppLayout>} />
        <Route path="/products" element={<AppLayout><ProductsPage /></AppLayout>} />
        <Route path="/products/new" element={<AppLayout><NewProductPage /></AppLayout>} />
        <Route path="/products/:id" element={<AppLayout><ProductDetailPage /></AppLayout>} />
        <Route path="/sessions" element={<AppLayout><SessionsPage /></AppLayout>} />
        <Route path="/sessions/new" element={<AppLayout><CommitteeSessionPage /></AppLayout>} />
        <Route path="/sessions/:id" element={<AppLayout><CommitteeSessionPage /></AppLayout>} />
        <Route path="/analyze" element={<AppLayout><DocumentAnalysisPage /></AppLayout>} />
        <Route path="/risks" element={<AppLayout><RisksPage /></AppLayout>} />
        <Route path="/admin" element={<AppLayout><AdminPage /></AppLayout>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
