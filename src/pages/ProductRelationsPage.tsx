import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAllRisks, getProducts } from '../services/firestore';
import { Risk, Product } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import RiskDetailModal from '../components/RiskDetailModal';

interface ProductGroup {
  product: Product;
  risks: Risk[];
}

interface CategoryGroup {
  category: string;
  products: ProductGroup[];
  riskCount: number;
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// Layout tipo "mapa mental": raíz -> categorías -> productos, con curvas conectoras.
function MindMap({ groups, onProductClick }: { groups: CategoryGroup[]; onProductClick: (product: Product) => void }) {
  const NODE_H = 60;
  const CAT_GAP = 26;
  const PAD = 24;
  const ROOT_X = 70;
  const CAT_X = 380;
  const PROD_X = 760;

  const blocks = groups.map(g => ({ group: g, height: Math.max(1, g.products.length) * NODE_H }));
  const innerHeight = blocks.reduce((sum, b) => sum + b.height, 0) + CAT_GAP * Math.max(0, blocks.length - 1);
  const height = innerHeight + PAD * 2;
  const width = PROD_X + 130;
  const rootY = height / 2;

  let cursor = PAD;
  const positioned = blocks.map(b => {
    const catY = cursor + b.height / 2;
    const products = b.group.products.map((pg, i) => ({ ...pg, y: cursor + i * NODE_H + NODE_H / 2 }));
    cursor += b.height + CAT_GAP;
    return { category: b.group.category, riskCount: b.group.riskCount, y: catY, products };
  });

  const curve = (x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-auto" style={{ maxHeight: '70vh' }}>
      <svg width={width} height={Math.max(height, 200)} className="block">
        {/* Raíz */}
        <rect x={ROOT_X - 55} y={rootY - 25} width={110} height={50} rx={12} className="fill-navy-900" />
        <text x={ROOT_X} y={rootY + 5} textAnchor="middle" className="fill-white text-xs font-semibold">Productos</text>

        {positioned.map(cat => (
          <g key={cat.category}>
            <path d={curve(ROOT_X + 55, rootY, CAT_X - 75, cat.y)} fill="none" stroke="#cbd5e1" strokeWidth={1.5} />
            <rect x={CAT_X - 75} y={cat.y - 24} width={150} height={48} rx={10} className="fill-brand" />
            <title>{cat.category}</title>
            <text x={CAT_X} y={cat.y - 3} textAnchor="middle" className="fill-white font-medium" style={{ fontSize: 10 }}>
              {truncate(cat.category, 20)}
            </text>
            <text x={CAT_X} y={cat.y + 12} textAnchor="middle" className="fill-white/80" style={{ fontSize: 9 }}>
              {cat.products.length} prod. · {cat.riskCount} riesgo{cat.riskCount !== 1 ? 's' : ''}
            </text>

            {cat.products.map(pg => (
              <g key={pg.product.id} className="cursor-pointer" onClick={() => onProductClick(pg.product)}>
                <path d={curve(CAT_X + 75, cat.y, PROD_X - 80, pg.y)} fill="none" stroke="#e2e8f0" strokeWidth={1.5} />
                <rect
                  x={PROD_X - 80} y={pg.y - 18} width={160} height={36} rx={8}
                  className="fill-white stroke-gray-200 hover:stroke-brand transition-colors" strokeWidth={1}
                />
                <title>{pg.product.name} ({pg.risks.length} riesgo{pg.risks.length !== 1 ? 's' : ''})</title>
                <text x={PROD_X} y={pg.y + 4} textAnchor="middle" className="fill-gray-700 font-medium" style={{ fontSize: 10 }}>
                  {truncate(pg.product.name, 22)}
                </text>
              </g>
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function ProductRelationsPage() {
  const navigate = useNavigate();
  const [risks, setRisks] = useState<Risk[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRisk, setSelectedRisk] = useState<Risk | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'mapa' | 'lista'>('mapa');

  const reload = () => Promise.all([getAllRisks(), getProducts()]).then(([r, p]) => { setRisks(r); setProducts(p); }).finally(() => setLoading(false));

  useEffect(() => { reload(); }, []);

  const groups = useMemo<CategoryGroup[]>(() => {
    const productsById = Object.fromEntries(products.map(p => [p.id, p]));
    const byCategory = new Map<string, Map<string, ProductGroup>>();

    for (const r of risks) {
      const product = productsById[r.productId];
      if (!product) continue;
      const category = r.category || 'Sin categoría';
      if (!byCategory.has(category)) byCategory.set(category, new Map());
      const byProduct = byCategory.get(category)!;
      if (!byProduct.has(product.id)) byProduct.set(product.id, { product, risks: [] });
      byProduct.get(product.id)!.risks.push(r);
    }

    return Array.from(byCategory.entries())
      .map(([category, byProduct]) => {
        const productGroups = Array.from(byProduct.values()).sort((a, b) => a.product.name.localeCompare(b.product.name));
        return { category, products: productGroups, riskCount: productGroups.reduce((sum, g) => sum + g.risks.length, 0) };
      })
      .sort((a, b) => b.products.length - a.products.length || a.category.localeCompare(b.category));
  }, [risks, products]);

  const toggleCategory = (category: string) => setExpandedCategories(prev => {
    const next = new Set(prev);
    next.has(category) ? next.delete(category) : next.add(category);
    return next;
  });

  const toggleProduct = (productId: string) => setExpandedProducts(prev => {
    const next = new Set(prev);
    next.has(productId) ? next.delete(productId) : next.add(productId);
    return next;
  });

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Árbol de Relaciones entre Productos</h1>
          <p className="text-gray-500 text-sm mt-1">
            Productos agrupados por categoría de riesgo en común — así se ve qué productos comparten el mismo tipo de riesgo o funcionalidad.
          </p>
        </div>
        {groups.length > 0 && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setView('mapa')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${view === 'mapa' ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              🕸 Mapa mental
            </button>
            <button
              onClick={() => setView('lista')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${view === 'lista' ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              ☰ Lista
            </button>
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-gray-400 text-sm">
          Aún no hay riesgos cargados para armar el árbol de relaciones.
        </div>
      ) : view === 'mapa' ? (
        <MindMap groups={groups} onProductClick={product => navigate(`/products/${product.id}`)} />
      ) : (
        <div className="space-y-3">
          {groups.map(g => {
            const isCatOpen = expandedCategories.has(g.category);
            const related = g.products.length > 1;
            return (
              <div key={g.category} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <button
                  onClick={() => toggleCategory(g.category)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg shrink-0">🗂</span>
                    <div className="text-left min-w-0">
                      <p className="font-semibold text-gray-800 truncate">{g.category}</p>
                      <p className="text-xs text-gray-400">
                        {g.products.length} producto{g.products.length !== 1 ? 's' : ''} · {g.riskCount} riesgo{g.riskCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {related && <span className="text-xs bg-brand/10 text-brand px-2 py-0.5 rounded-full">Relacionados</span>}
                    <span className="text-gray-400 text-sm">{isCatOpen ? '▾' : '▸'}</span>
                  </div>
                </button>

                {isCatOpen && (
                  <div className="border-t border-gray-100 px-5 py-3 space-y-1">
                    {g.products.map(({ product, risks: productRisks }) => {
                      const isProdOpen = expandedProducts.has(product.id);
                      return (
                        <div key={product.id} className="pl-4 border-l-2 border-gray-100">
                          <div
                            onClick={() => toggleProduct(product.id)}
                            className="flex items-center justify-between py-2 cursor-pointer"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs text-gray-400 shrink-0">{isProdOpen ? '▾' : '▸'}</span>
                              <Link
                                to={`/products/${product.id}`}
                                onClick={e => e.stopPropagation()}
                                className="text-sm font-medium text-gray-700 hover:text-brand truncate"
                              >
                                {product.name}
                              </Link>
                            </div>
                            <span className="text-xs text-gray-400 shrink-0">
                              {productRisks.length} riesgo{productRisks.length !== 1 ? 's' : ''}
                            </span>
                          </div>

                          {isProdOpen && (
                            <div className="pl-6 pb-2 space-y-1">
                              {productRisks.map(r => (
                                <div
                                  key={r.id}
                                  onClick={() => setSelectedRisk(r)}
                                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand cursor-pointer"
                                >
                                  <span className="text-gray-300">•</span>
                                  {r.isRedFlag && <span title="Red Flag">🚩</span>}
                                  <span className="truncate">{r.title}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedRisk && (
        <RiskDetailModal
          risk={selectedRisk}
          onClose={() => setSelectedRisk(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}
