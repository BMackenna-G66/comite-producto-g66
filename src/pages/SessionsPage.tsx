import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAllSessions } from '../services/firestore';
import { CommitteeSession } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';

export default function SessionsPage() {
  const [sessions, setSessions] = useState<CommitteeSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllSessions().then(setSessions).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Sesiones de Comité</h1>
          <p className="text-gray-500 text-sm mt-1">{sessions.length} sesión{sessions.length !== 1 ? 'es' : ''} registradas</p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center space-y-2">
          <div className="text-5xl">◎</div>
          <p className="text-gray-600 font-medium">No hay sesiones registradas</p>
          <p className="text-gray-400 text-sm">Las sesiones se crean desde la ficha de cada producto.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3">Producto</th>
                <th className="text-center px-4 py-3">Gate</th>
                <th className="text-center px-4 py-3">Sesión ID</th>
                <th className="text-center px-4 py-3">Fecha</th>
                <th className="text-center px-4 py-3">Resolución</th>
                <th className="text-center px-4 py-3">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sessions.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-800">{s.productName}</p>
                    <p className="text-xs text-gray-400">{s.presidentName}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Gate {s.gate}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs font-mono text-gray-600">{s.sessionId}</td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500">{new Date(s.sessionDate).toLocaleDateString('es-CL')}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      s.resolution === 'APROBADO' ? 'bg-green-100 text-green-700' :
                      s.resolution === 'RECHAZADO' ? 'bg-red-100 text-red-700' :
                      s.resolution === 'APROBADO_CON_CONDICIONANTES' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {s.resolution === 'APROBADO_CON_CONDICIONANTES' ? 'Con Cond.' : s.resolution}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === 'closed' ? 'bg-green-50 text-green-600' : s.status === 'in_progress' ? 'bg-yellow-50 text-yellow-600' : 'bg-gray-50 text-gray-500'}`}>
                      {s.status === 'closed' ? 'Cerrada' : s.status === 'in_progress' ? 'En Progreso' : 'Borrador'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/sessions/${s.id}`} className="text-brand text-xs hover:underline">Ver →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
