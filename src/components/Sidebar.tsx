import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import UserAvatar from './UserAvatar';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '▦' },
  { to: '/products', label: 'Productos', icon: '⬡' },
  { to: '/risks', label: 'Matriz de Riesgos', icon: '⚠' },
  { to: '/sessions', label: 'Sesiones Comité', icon: '◎' },
];

const ADMIN_NAV = [
  { to: '/admin', label: 'Administración', icon: '⚙' },
];

export default function Sidebar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <aside className="w-64 min-h-screen bg-navy-900 text-white flex flex-col no-print">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-navy-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center font-bold text-sm">G</div>
          <div>
            <div className="font-semibold text-sm leading-tight">Comité de Producto</div>
            <div className="text-xs text-gray-400">Global81 SpA</div>
          </div>
        </div>
      </div>

      {/* Nav */}
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

        {user?.role === 'admin' && (
          <>
            <div className="pt-4 pb-1 px-3">
              <span className="text-xs text-gray-500 uppercase tracking-wider">Admin</span>
            </div>
            {ADMIN_NAV.map(({ to, label, icon }) => (
              <NavLink
                key={to}
                to={to}
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
          </>
        )}
      </nav>

      {/* User footer */}
      {user && (
        <div className="px-4 py-4 border-t border-navy-700">
          <div className="flex items-center gap-3">
            <UserAvatar user={user} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user.name}</div>
              <div className="text-xs text-gray-400 capitalize">{user.role}</div>
            </div>
            <button
              onClick={handleSignOut}
              className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-navy-700 transition-colors"
              title="Cerrar sesión"
            >
              ⎋
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
