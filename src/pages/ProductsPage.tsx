import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProducts } from '../services/firestore';
import { Product, ProductStatus } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import GateStatusBadge from '../components/GateStatusBadge';
import { useAuth } from '../hooks/useAuth';

const STATUS_COLOR: Record<ProductStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  gate1: 'bg-blue-100 text-blue-700',
  gate2: 'bg-indigo-100 text-indigo-700',
  gate3: 'bg-purple-100 text-purple-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

const STATUS_LABEL: Record<ProductStatus, string> = {
  draft: 'Borrador', gate1: 'Gate 1', gate2: 'Gate 2', gate3: 'Gate 3',
  approved: 'Aprobado', rejected: 'Rechazado',
};

export default function ProductsPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ProductStatus | 'all'>('all');

  useEffect(() => {
    getProducts().then(setProducts).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const filtered = filter === 'all' ? products : products.filter(p => p.status === filter);

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Productos</h1>
          <p className="text-gray-500 text-sm mt-1">{products.length} producto{products.length !== 1 ? 's' : ''} registrados</p>
        </div>
        {(user?.role === 'admin' || user?.role === 'member') && (
          <Link
            to="/products/new"
            className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors"
          >
            + Nuevo Producto
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'gate1', 'gate2', 'gate3', 'approved', 'rejected'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f ? 'bg-brand text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-brand'
            }`}
          >
            {f === 'all' ? 'Todos' : STATUS_LABEL[f]} {f !== 'all' && `(${products.filter(p => p.status === f).length})`}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center space-y-3">
          <div className="text-5xl">📋</div>
          <p className="text-gray-600 font-medium">No hay productos</p>
          <p className="text-gray-400 text-sm">Crea el primer producto para comenzar el proceso de aprobación.</p>
          {(user?.role === 'admin' || user?.role === 'member') && (
            <Link to="/products/new" className="inline-block mt-2 bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-dark">
              Crear Producto
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(p => (
            <Link
              key={p.id}
              to={`/products/${p.id}`}
              className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-brand transition-all p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-gray-800 text-sm leading-tight">{p.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[p.status]}`}>
                  {STATUS_LABEL[p.status]}
                </span>
              </div>

              <p className="text-xs text-gray-500 line-clamp-2">{p.description}</p>

              {/* Gate progress */}
              <div className="space-y-1.5">
                {([1, 2, 3] as const).map(gate => (
                  <div key={gate} className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Gate {gate}</span>
                    <GateStatusBadge status={gate === 1 ? p.gate1Status : gate === 2 ? p.gate2Status : p.gate3Status} />
                  </div>
                ))}
              </div>

              <div className="pt-1 border-t border-gray-50 flex items-center justify-between">
                <span className="text-xs text-gray-400">{p.ownerName}</span>
                <span className="text-xs text-gray-400">{new Date(p.updatedAt).toLocaleDateString('es-CL')}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
