import { useEffect, useState } from 'react';
import { getUsers, updateUserRole } from '../services/firestore';
import { AppUser, UserRole, COMPANIES } from '../types';
import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from '../components/LoadingSpinner';
import UserAvatar from '../components/UserAvatar';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  member: 'Miembro del Comité',
  observer: 'Observador',
  pending: 'Pendiente de aprobación',
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-purple-100 text-purple-700',
  member: 'bg-blue-100 text-blue-700',
  observer: 'bg-gray-100 text-gray-600',
  pending: 'bg-yellow-100 text-yellow-700',
};

export default function AdminPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ role: UserRole; company: string }>({ role: 'observer', company: 'Global81 SpA' });

  const reload = () => getUsers().then(setUsers).finally(() => setLoading(false));

  useEffect(() => { reload(); }, []);

  if (me?.role !== 'admin') return (
    <div className="p-6 text-gray-500">No tienes permisos para acceder a esta sección.</div>
  );

  if (loading) return <LoadingSpinner />;

  const pending = users.filter(u => u.role === 'pending');
  const active = users.filter(u => u.role !== 'pending');

  const startEdit = (u: AppUser) => {
    setEditingUser(u.uid);
    setEditForm({ role: u.role, company: u.company });
  };

  const saveEdit = async (uid: string) => {
    setSaving(uid);
    await updateUserRole(uid, editForm.role, editForm.company);
    setEditingUser(null);
    await reload();
    setSaving(null);
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Administración de Usuarios</h1>
        <p className="text-gray-500 text-sm mt-1">{users.length} usuario{users.length !== 1 ? 's' : ''} registrados</p>
      </div>

      {pending.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-yellow-500">⚠</span>
            <h2 className="font-semibold text-yellow-800 text-sm">{pending.length} usuario{pending.length !== 1 ? 's' : ''} esperando aprobación</h2>
          </div>
          {pending.map(u => (
            <div key={u.uid} className="bg-white rounded-lg border border-yellow-200 p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <UserAvatar user={u} />
                <div>
                  <p className="font-medium text-sm text-gray-800">{u.name}</p>
                  <p className="text-xs text-gray-400">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={editingUser === u.uid ? editForm.role : 'observer'}
                  onChange={e => { startEdit(u); setEditForm(f => ({ ...f, role: e.target.value as UserRole })); }}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <option value="member">Miembro del Comité</option>
                  <option value="observer">Observador</option>
                  <option value="admin">Administrador</option>
                </select>
                <button
                  onClick={() => saveEdit(u.uid)}
                  disabled={saving === u.uid}
                  className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {saving === u.uid ? '...' : 'Aprobar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-700 text-sm">Usuarios Activos ({active.length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="text-left px-5 py-3">Usuario</th>
              <th className="text-left px-4 py-3">Empresa</th>
              <th className="text-center px-4 py-3">Rol</th>
              <th className="text-center px-4 py-3">Registro</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {active.map(u => (
              <tr key={u.uid} className="hover:bg-gray-50">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <UserAvatar user={u} size="sm" />
                    <div>
                      <p className="font-medium text-gray-800">{u.name}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {editingUser === u.uid ? (
                    <select value={editForm.company} onChange={e => setEditForm(f => ({ ...f, company: e.target.value }))} className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand">
                      {COMPANIES.filter(c => c !== 'Todas').map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-gray-600">{u.company}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {editingUser === u.uid ? (
                    <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value as UserRole }))} className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand">
                      <option value="admin">Administrador</option>
                      <option value="member">Miembro</option>
                      <option value="observer">Observador</option>
                    </select>
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${ROLE_COLORS[u.role]}`}>{ROLE_LABELS[u.role]}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center text-xs text-gray-400">
                  {new Date(u.createdAt).toLocaleDateString('es-CL')}
                </td>
                <td className="px-4 py-3 text-right">
                  {u.uid !== me?.uid && (
                    editingUser === u.uid ? (
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditingUser(null)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1">Cancelar</button>
                        <button onClick={() => saveEdit(u.uid)} disabled={saving === u.uid} className="bg-brand text-white px-3 py-1 rounded-lg text-xs font-medium disabled:opacity-50">
                          {saving === u.uid ? '...' : 'Guardar'}
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(u)} className="text-xs text-brand hover:underline">Editar</button>
                    )
                  )}
                  {u.uid === me?.uid && <span className="text-xs text-gray-300">Tú</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Firestore Rules reminder */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700 space-y-1">
        <p className="font-semibold">💡 Recuerda configurar las reglas de Firestore</p>
        <p>Las reglas de seguridad deben restringir lectura/escritura según el rol del usuario. Ver <code>README.md</code> para las reglas recomendadas.</p>
      </div>
    </div>
  );
}
