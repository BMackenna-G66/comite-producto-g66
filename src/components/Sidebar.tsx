import { NavLink } from 'react-router-dom';

const NAV_SECTIONS = [
  {
    label: 'Gobierno',
    items: [
      { to: '/', label: 'Dashboard', icon: '▦' },
      { to: '/products', label: 'Productos', icon: '⬡' },
      { to: '/analyze', label: 'Análisis IA', icon: '✦' },
      { to: '/sessions', label: 'Sesiones Comité', icon: '◎' },
    ],
  },
  {
    label: 'Risk Management',
    items: [
      { to: '/risks', label: 'Riesgos Productos', icon: '⚠' },
      { to: '/corporate-risks', label: 'Riesgos Corporativos', icon: '🏛' },
      { to: '/kris', label: 'KRIs', icon: '📊' },
      { to: '/appetite', label: 'Apetito de Riesgo', icon: '⚖' },
    ],
  },
  {
    label: 'Eventos & Controles',
    items: [
      { to: '/events', label: 'Eventos de Riesgo', icon: '⚡' },
      { to: '/controls', label: 'Control Testing', icon: '✓' },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { to: '/regulatory', label: 'Regulatory Intel', icon: '🛡' },
    ],
  },
  {
    label: 'IA',
    items: [
      { to: '/copilot', label: 'AI Risk Copilot', icon: '✦' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/admin', label: 'Administración', icon: '⚙' },
    ],
  },
];

export default function Sidebar() {
  return (
    <aside className="w-64 min-h-screen bg-navy-900 text-white flex flex-col no-print overflow-y-auto">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-navy-700 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center font-bold text-sm shrink-0">G</div>
          <div>
            <div className="font-semibold text-sm leading-tight">GRC Platform</div>
            <div className="text-xs text-gray-400">Global81 SpA · G66 Group</div>
          </div>
        </div>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 px-3 py-3 space-y-0">
        {NAV_SECTIONS.map(section => (
          <div key={section.label} className="mb-2">
            <p className="px-3 pt-3 pb-1 text-xs text-gray-500 uppercase tracking-wider font-medium">{section.label}</p>
            <div className="space-y-0.5">
              {section.items.map(({ to, label, icon }) => (
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
                  <span className="w-4 text-center text-sm">{icon}</span>
                  <span className="truncate">{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-navy-700 text-xs text-gray-500 text-center shrink-0">
        G66 Group · GRC Platform
      </div>
    </aside>
  );
}
