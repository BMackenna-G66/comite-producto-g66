import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from './LoadingSpinner';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  if (loading) return <LoadingSpinner fullScreen />;
  if (!user) return <Navigate to="/login" replace />;

  if (user.role === 'pending') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow p-8 max-w-md text-center space-y-4">
        <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto text-3xl">⏳</div>
        <h2 className="text-xl font-semibold text-gray-800">Acceso pendiente de aprobación</h2>
        <p className="text-gray-500 text-sm">Tu cuenta fue registrada con <strong>{user.email}</strong>. El administrador debe asignarte un rol para que puedas acceder.</p>
        <div className="flex items-center justify-center gap-4 text-sm">
          <button onClick={() => window.location.reload()} className="text-brand hover:underline">Verificar estado</button>
          <button onClick={signOut} className="text-gray-400 hover:underline">Cerrar sesión</button>
        </div>
      </div>
    </div>
  );

  if (user.role === 'rejected') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow p-8 max-w-md text-center space-y-4">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-3xl">🚫</div>
        <h2 className="text-xl font-semibold text-gray-800">Acceso rechazado</h2>
        <p className="text-gray-500 text-sm">Tu cuenta (<strong>{user.email}</strong>) no tiene acceso a esta plataforma. Si crees que es un error, contacta al administrador.</p>
        <button onClick={signOut} className="text-brand text-sm hover:underline">Cerrar sesión</button>
      </div>
    </div>
  );

  return <>{children}</>;
}
