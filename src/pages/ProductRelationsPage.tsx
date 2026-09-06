import { useEffect, useMemo, useRef, useState } from 'react';
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

// El campo "categoría" de un riesgo es texto libre y a veces combina varias
// (ej. "Operacional, Financiero"). Se separa en variables individuales para
// agrupar por similitud: un riesgo "Operacional, Financiero" queda emparentado
// tanto con los productos "Operacional" como con los "Financiero", en vez de
// formar una categoría compuesta aislada.
const CATEGORY_SPLIT_RE = /[,;/]+/;
const categoryTokens = (category: string): string[] => {
  const tokens = category.split(CATEGORY_SPLIT_RE).map(s => s.trim()).filter(Boolean);
  return tokens.length > 0 ? tokens : ['Sin categoría'];
};

interface MindMapProps {
  groups: CategoryGroup[];
  expandedCategories: Set<string>;
  expandedProducts: Set<string>;
  onToggleCategory: (category: string) => void;
  onToggleProduct: (productId: string) => void;
  onProductNavigate: (product: Product) => void;
  onRiskClick: (risk: Risk) => void;
}

// Layout tipo "mapa mental": raíz -> categoría -> producto -> riesgo, con curvas
// conectoras. Comparte el mismo estado de expandido/colapsado que la vista de
// lista, así que agrupa y se investiga exactamente igual en las dos vistas.
// El ancho se mide del contenedor real (ResizeObserver) para ocupar toda la
// pantalla disponible en vez de quedar acotado a un ancho fijo.
function MindMap({ groups, expandedCategories, expandedProducts, onToggleCategory, onToggleProduct, onProductNavigate, onRiskClick }: MindMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(900);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const ROW_H = 64;
  const LEAF_H = 40;
  const CAT_GAP = 28;
  const PAD = 24;
  const ROOT_X = 80;
  const span = Math.max(760, containerWidth - 150);
  const CAT_X = ROOT_X + span * 0.26;
  const PROD_X = ROOT_X + span * 0.56;
  const RISK_X = ROOT_X + span * 0.9;

  const productBlockHeight = (pg: ProductGroup) =>
    expandedProducts.has(pg.product.id) ? Math.max(1, pg.risks.length) * LEAF_H : ROW_H;

  const categoryBlockHeight = (g: CategoryGroup) =>
    expandedCategories.has(g.category)
      ? g.products.reduce((sum, pg) => sum + productBlockHeight(pg), 0) || ROW_H
      : ROW_H;

  const innerHeight = groups.reduce((sum, g) => sum + categoryBlockHeight(g), 0) + CAT_GAP * Math.max(0, groups.length - 1);
  const height = innerHeight + PAD * 2;
  const width = Math.max(containerWidth, RISK_X + 190);
  const rootY = height / 2;

  let catCursor = PAD;
  const positioned = groups.map(g => {
    const isCatOpen = expandedCategories.has(g.category);
    const catH = categoryBlockHeight(g);
    const catY = catCursor + catH / 2;

    const products: { product: Product; riskCount: number; y: number; isOpen: boolean; riskNodes: { risk: Risk; y: number }[] }[] = [];
    if (isCatOpen) {
      let prodCursor = catCursor;
      for (const pg of g.products) {
        const isProdOpen = expandedProducts.has(pg.product.id);
        const prodH = productBlockHeight(pg);
        const prodY = prodCursor + prodH / 2;

        const riskNodes: { risk: Risk; y: number }[] = [];
        if (isProdOpen) {
          let riskCursor = prodCursor;
          for (const risk of pg.risks) {
            riskNodes.push({ risk, y: riskCursor + LEAF_H / 2 });
            riskCursor += LEAF_H;
          }
        }
        products.push({ product: pg.product, riskCount: pg.risks.length, y: prodY, isOpen: isProdOpen, riskNodes });
        prodCursor += prodH;
      }
    }
    catCursor += catH + CAT_GAP;
    return { category: g.category, riskCount: g.riskCount, y: catY, isOpen: isCatOpen, products };
  });

  const curve = (x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  };

  return (
    <div ref={containerRef} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-auto" style={{ maxHeight: '80vh' }}>
      <svg width={width} height={Math.max(height, 200)} className="block">
        {/* Raíz */}
        <rect x={ROOT_X - 55} y={rootY - 25} width={110} height={50} rx={12} className="fill-navy-900" />
        <text x={ROOT_X} y={rootY + 5} textAnchor="middle" className="fill-white text-xs font-semibold">Productos</text>

        {positioned.map(cat => (
          <g key={cat.category}>
            <path d={curve(ROOT_X + 55, rootY, CAT_X - 75, cat.y)} fill="none" stroke="#cbd5e1" strokeWidth={1.5} />
            <g className="cursor-pointer" onClick={() => onToggleCategory(cat.category)}>
              <rect x={CAT_X - 75} y={cat.y - 24} width={150} height={48} rx={10} className="fill-brand" />
              <title>{cat.category}</title>
              <text x={CAT_X} y={cat.y - 3} textAnchor="middle" className="fill-white font-medium" style={{ fontSize: 10 }}>
                {cat.isOpen ? '▾ ' : '▸ '}{truncate(cat.category, 18)}
              </text>
              <text x={CAT_X} y={cat.y + 12} textAnchor="middle" className="fill-white/80" style={{ fontSize: 9 }}>
                {cat.products.length > 0 ? cat.products.length : ''} {cat.isOpen ? 'prod.' : ''} · {cat.riskCount} riesgo{cat.riskCount !== 1 ? 's' : ''}
              </text>
            </g>

            {cat.products.map(pg => (
              <g key={pg.product.id}>
                <path d={curve(CAT_X + 75, cat.y, PROD_X - 80, pg.y)} fill="none" stroke="#e2e8f0" strokeWidth={1.5} />
                <g className="cursor-pointer" onClick={() => onToggleProduct(pg.product.id)}>
                  <rect
                    x={PROD_X - 80} y={pg.y - 18} width={160} height={36} rx={8}
                    className="fill-white stroke-gray-200 hover:stroke-brand transition-colors" strokeWidth={1}
                  />
                  <title>{pg.product.name} ({pg.riskCount} riesgo{pg.riskCount !== 1 ? 's' : ''})</title>
                  <text x={PROD_X - 8} y={pg.y + 4} textAnchor="middle" className="fill-gray-700 font-medium" style={{ fontSize: 10 }}>
                    {pg.isOpen ? '▾ ' : '▸ '}{truncate(pg.product.name, 18)}
                  </text>
                </g>
                <text
                  x={PROD_X + 68} y={pg.y + 4} textAnchor="middle" className="fill-gray-400 hover:fill-brand cursor-pointer"
                  style={{ fontSize: 12 }}
                  onClick={e => { e.stopPropagation(); onProductNavigate(pg.product); }}
                >
                  ↗
                </text>

                {pg.riskNodes.map(({ risk, y }) => (
                  <g key={risk.id} className="cursor-pointer" onClick={() => onRiskClick(risk)}>
                    <path d={curve(PROD_X + 80, pg.y, RISK_X - 95, y)} fill="none" stroke="#f1f5f9" strokeWidth={1.5} />
                    <rect
                      x={RISK_X - 95} y={y - 16} width={190} height={32} rx={7}
                      className="fill-gray-50 stroke-gray-200 hover:stroke-brand transition-colors" strokeWidth={1}
                    />
                    <title>{risk.title}</title>
                    <text x={RISK_X - 82} y={y + 4} className="fill-gray-600" style={{ fontSize: 9 }}>
                      {risk.isRedFlag ? '🚩 ' : ''}{truncate(risk.title, 24)}
                    </text>
                  </g>
                ))}
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
      for (const category of categoryTokens(r.category || 'Sin categoría')) {
        if (!byCategory.has(category)) byCategory.set(category, new Map());
        const byProduct = byCategory.get(category)!;
        if (!byProduct.has(product.id)) byProduct.set(product.id, { product, risks: [] });
        byProduct.get(product.id)!.risks.push(r);
      }
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
    <div className={`p-6 space-y-5 ${view === 'mapa' ? 'max-w-none' : 'max-w-4xl'}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Árbol de Relaciones entre Productos</h1>
          <p className="text-gray-500 text-sm mt-1">
            Productos agrupados por categoría de riesgo en común (incluye coincidencias parciales, ej. "Operacional" agrupa
            también con "Operacional, Financiero") — así se ve qué productos comparten el mismo tipo de riesgo o funcionalidad.
            Hacé click para expandir cada nivel e investigar.
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
        <MindMap
          groups={groups}
          expandedCategories={expandedCategories}
          expandedProducts={expandedProducts}
          onToggleCategory={toggleCategory}
          onToggleProduct={toggleProduct}
          onProductNavigate={product => navigate(`/products/${product.id}`)}
          onRiskClick={setSelectedRisk}
        />
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
