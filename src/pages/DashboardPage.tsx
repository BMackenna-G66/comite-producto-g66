import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProducts, getAllSessions, getAllRisks, getCommitments } from '../services/firestore';
import { Product, CommitteeSession, Risk, Commitment } from '../types';
import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from '../components/LoadingSpinner';
import GateStatusBadge from '../components/GateStatusBadge';

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [sessions, setSessions] = useState<CommitteeSession[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getProducts(), getAllSessions(), getAllRisks()])
      .then(([p, s, r]) => {
        setProducts(p);
        setSessions(s);
        setRisks(r);
        // load commitments for all products
        return Promise.all(p.map(prod => getCommitments(prod.id)));
      })
      .then(all => setCommitments(all.flat()))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const active = products.filter(p => !['approved', 'rejected'].includes(p.status));
  const blocked = products.filter(p => [p.gate1Status, p.gate2Status, p.gate3Status].includes('blocked'));
  const highRisks = risks.filter(r => r.riskLevel === 'muy_alto' || r.riskLevel === 'alto');
  const pendingCommitments = commitments.filter(c => c.status === 'pending');
  const recentSessions = sessions.slice(0, 5);

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Bienvenido, {user?.name.split(' ')[0]}. Aquí está el estado del comité.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Productos activos" value={active.length} sub={`${products.length} total`} color="text-brand" />
        <StatCard label="Gates bloqueados" value={blocked.length} sub="requieren atención" color={blocked.length > 0 ? 'text-red-600' : 'text-gray-700'} />
        <StatCard label="Riesgos alto/muy alto" value={highRisks.length} sub={`de ${risks.length} total`} color={highRisks.length > 0 ? 'text-orange-600' : 'text-gray-700'} />
        <StatCard label="Compromisos pendientes" value={pendingCommitments.length} sub="por cerrar" color={pendingCommitments.length > 0 ? 'text-yellow-600' : 'text-gray-700'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Products needing attention */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Productos en Pipeline</h2>
            <Link to="/products" className="text-brand text-xs hover:underline">Ver todos →</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {active.length === 0 && (
              <div className="px-5 py-8 text-center text-gray-400 text-sm">No hay productos activos</div>
            )}
            {active.slice(0, 6).map(p => (
              <Link key={p.id} to={`/products/${p.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                <div>
                  <p className="text-sm font-medium text-gray-800">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.ownerName} · {new Date(p.updatedAt).toLocaleDateString('es-CL')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Gate {p.currentGate}</span>
                  <GateStatusBadge status={
                    p.currentGate === 1 ? p.gate1Status : p.currentGate === 2 ? p.gate2Status : p.gate3Status
                  } />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent sessions */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Últimas Sesiones</h2>
            <Link to="/sessions" className="text-brand text-xs hover:underline">Ver todas →</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentSessions.length === 0 && (
              <div className="px-5 py-8 text-center text-gray-400 text-sm">No hay sesiones registradas</div>
            )}
            {recentSessions.map(s => (
              <Link key={s.id} to={`/sessions/${s.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                <div>
                  <p className="text-sm font-medium text-gray-800">{s.productName}</p>
                  <p className="text-xs text-gray-400">Gate {s.gate} · {s.sessionId}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    s.resolution === 'APROBADO' ? 'bg-green-100 text-green-700' :
                    s.resolution === 'RECHAZADO' ? 'bg-red-100 text-red-700' :
                    s.resolution === 'APROBADO_CON_CONDICIONANTES' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {s.resolution === 'APROBADO_CON_CONDICIONANTES' ? 'Con Cond.' : s.resolution}
                  </span>
                  <span className="text-xs text-gray-400">{new Date(s.sessionDate).toLocaleDateString('es-CL')}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* High risks alert */}
      {blocked.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="text-red-500 text-xl">🚫</span>
            <div>
              <p className="font-semibold text-red-800 text-sm">Gates bloqueados requieren atención inmediata</p>
              <ul className="mt-2 space-y-1">
                {blocked.map(p => (
                  <li key={p.id}>
                    <Link to={`/products/${p.id}`} className="text-red-700 text-sm hover:underline">
                      {p.name} →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
