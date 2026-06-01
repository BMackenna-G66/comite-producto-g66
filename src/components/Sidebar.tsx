import { NavLink } from 'react-router-dom';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '▦' },
  { to: '/products', label: 'Productos', icon: '⬡' },
  { to: '/risks', label: 'Matriz de Riesgos', icon: '⚠' },
  { to: '/sessions', label: 'Sesiones Comité', icon: '◎' },
  { to: '/admin', label: 'Administración', icon: '⚙' },
];

export default function Sidebar() {
  return (
    <aside className="w-64 min-h-screen bg-navy-900 text-white flex flex-col no-print">
      <div className="px-6 py-5 border-b border-navy-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center font-bold text-sm">G</div>
          <div>
            <div className="font-semibold text-sm leading-tight">Comité de Producto</div>
            <div className="text-xs text-gray-400">Global81 SpA</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive ? 'bg-brand text-white' : 'text-gray-300 hover:bg-navy-700 hover:text-white'
              }`
            }
          >
            <span className="w-5 text-center">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-navy-700 text-xs text-gray-500 text-center">
        G66 Group · Uso Interno
      </div>
    </aside>
  );
}
