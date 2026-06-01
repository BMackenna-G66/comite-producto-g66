import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAllRisks, getProducts } from '../services/firestore';
import { Risk, Product, RiskLevel, RISK_LEVEL_LABELS } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import RiskBadge from '../components/RiskBadge';

export default function RisksPage() {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState<RiskLevel | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([getAllRisks(), getProducts()])
      .then(([r, p]) => { setRisks(r); setProducts(p); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const categories = Array.from(new Set(risks.map(r => r.category).filter(Boolean)));
  const productMap = Object.fromEntries(products.map(p => [p.id, p.name]));

  const filtered = risks.filter(r => {
    if (filterLevel !== 'all' && r.riskLevel !== filterLevel) return false;
    if (filterCategory !== 'all' && r.category !== filterCategory) return false;
    if (search && !r.title.toLowerCase().includes(search.toLowerCase()) && !r.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const byLevel = (l: RiskLevel) => risks.filter(r => r.riskLevel === l).length;

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Matriz de Riesgos</h1>
        <p className="text-gray-500 text-sm mt-1">{risks.length} riesgos consolidados en todos los productos</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-5 gap-3">
        {(['muy_alto', 'alto', 'moderado', 'bajo', 'muy_bajo'] as RiskLevel[]).map(l => (
          <button
            key={l}
            onClick={() => setFilterLevel(filterLevel === l ? 'all' : l)}
            className={`p-3 rounded-xl text-center border-2 transition-all ${filterLevel === l ? 'border-brand scale-105' : 'border-transparent bg-white shadow-sm hover:shadow-md'}`}
          >
            <div className={`text-xl font-bold ${l === 'muy_alto' ? 'text-red-600' : l === 'alto' ? 'text-orange-600' : l === 'moderado' ? 'text-yellow-600' : l === 'bajo' ? 'text-blue-600' : 'text-green-600'}`}>
              {byLevel(l)}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{RISK_LEVEL_LABELS[l]}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar riesgo..."
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand w-48"
        />
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
          <option value="all">Todas las categorías</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {(filterLevel !== 'all' || filterCategory !== 'all' || search) && (
          <button onClick={() => { setFilterLevel('all'); setFilterCategory('all'); setSearch(''); }} className="text-xs text-brand hover:underline px-2">Limpiar filtros</button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="text-left px-5 py-3">Riesgo</th>
              <th className="text-left px-4 py-3">Producto</th>
              <th className="text-left px-4 py-3">Categoría</th>
              <th className="text-center px-4 py-3">I</th>
              <th className="text-center px-4 py-3">P</th>
              <th className="text-center px-4 py-3">Score</th>
              <th className="text-center px-4 py-3">Nivel</th>
              <th className="text-left px-4 py-3">Responsable</th>
              <th className="text-center px-4 py-3">ROAM</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-gray-400">No hay riesgos con los filtros seleccionados.</td></tr>
            )}
            {filtered.map(r => (
              <tr key={r.id} className={`hover:bg-gray-50 ${r.isRedFlag ? 'bg-red-50' : ''}`}>
                <td className="px-5 py-3 max-w-xs">
                  <div className="flex items-start gap-2">
                    {r.isRedFlag && <span className="text-red-500 shrink-0 mt-0.5" title="Red Flag">🚩</span>}
                    <div>
                      <p className="font-medium text-gray-800 text-sm">{r.title}</p>
                      <p className="text-xs text-gray-400 line-clamp-1">{r.description}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Link to={`/products/${r.productId}`} className="text-xs text-brand hover:underline">
                    {productMap[r.productId] ?? r.productId}
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{r.category || '—'}</td>
                <td className="px-4 py-3 text-center text-xs font-medium">{r.impact}</td>
                <td className="px-4 py-3 text-center text-xs font-medium">{r.probability}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-sm font-bold ${r.inherentRisk >= 15 ? 'text-red-600' : r.inherentRisk >= 10 ? 'text-orange-600' : r.inherentRisk >= 5 ? 'text-yellow-600' : 'text-green-600'}`}>
                    {r.inherentRisk}
                  </span>
                </td>
                <td className="px-4 py-3 text-center"><RiskBadge level={r.riskLevel} /></td>
                <td className="px-4 py-3 text-center">
                  <td className="px-4 py-3 text-xs text-gray-600">{r.owner || <span className="text-yellow-500">Sin asignar</span>}</td>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.roamStatus === 'Resolved' ? 'bg-green-100 text-green-700' : r.roamStatus === 'Mitigated' ? 'bg-blue-100 text-blue-700' : r.roamStatus === 'Accepted' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                    {r.roamStatus}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
