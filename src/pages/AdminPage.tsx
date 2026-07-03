import { FormEvent, useEffect, useState } from 'react';
import { getUsers, updateUserRole, getInvites, createInvite, deleteInvite } from '../services/firestore';
import { AppUser, UserRole, Invite, COMPANIES } from '../types';
import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from '../components/LoadingSpinner';
import UserAvatar from '../components/UserAvatar';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  member: 'Miembro del Comité',
  observer: 'Observador',
  pending: 'Pendiente de aprobación',
  rejected: 'Rechazado',
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-purple-100 text-purple-700',
  member: 'bg-blue-100 text-blue-700',
  observer: 'bg-gray-100 text-gray-600',
  pending: 'bg-yellow-100 text-yellow-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function AdminPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ role: UserRole; company: string }>({ role: 'observer', company: 'Global81 SpA' });

  const [inviteForm, setInviteForm] = useState<{ email: string; role: UserRole; company: string }>({ email: '', role: 'member', company: 'Global81 SpA' });
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState('');

  const reload = () => getUsers().then(setUsers).finally(() => setLoading(false));
  const reloadInvites = () => getInvites().then(setInvites);

  useEffect(() => { reload(); reloadInvites(); }, []);

  if (me?.role !== 'admin') return (
    <div className="p-6 text-gray-500">No tienes permisos para acceder a esta sección.</div>
  );

  if (loading) return <LoadingSpinner />;

  const pending = users.filter(u => u.role === 'pending');
  const rejected = users.filter(u => u.role === 'rejected');
  const active = users.filter(u => u.role === 'admin' || u.role === 'member' || u.role === 'observer');

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

  const setRole = async (u: AppUser, role: UserRole) => {
    setSaving(u.uid);
    await updateUserRole(u.uid, role, u.company);
    await reload();
    setSaving(null);
  };

  const sendInvite = async (e: FormEvent) => {
    e.preventDefault();
    const email = inviteForm.email.trim().toLowerCase();
    if (!email || !email.includes('@')) { setInviteError('Ingresa un email válido.'); return; }
    if (users.some(u => u.email.toLowerCase() === email)) { setInviteError('Ese email ya tiene una cuenta registrada.'); return; }
    if (invites.some(i => i.email === email)) { setInviteError('Ya existe una invitación pendiente para ese email.'); return; }
    setInviteError('');
    setInviteBusy(true);
    try {
      await createInvite({ email, role: inviteForm.role, company: inviteForm.company, invitedBy: me!.uid, invitedByName: me!.name });
      setInviteForm({ email: '', role: 'member', company: 'Global81 SpA' });
      await reloadInvites();
    } finally {
      setInviteBusy(false);
    }
  };

  const cancelInvite = async (email: string) => {
    setInviteBusy(true);
    await deleteInvite(email);
    await reloadInvites();
    setInviteBusy(false);
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Administración de Usuarios</h1>
        <p className="text-gray-500 text-sm mt-1">{users.length} usuario{users.length !== 1 ? 's' : ''} registrados</p>
      </div>

      {/* Invitar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-gray-700 text-sm">Invitar a un nuevo miembro</h2>
        <p className="text-xs text-gray-400">
          Precarga el email y el rol. Cuando esa persona entre por primera vez con su cuenta de Google, queda
          aprobada automáticamente con ese rol — no pasa por la cola de pendientes.
        </p>
        <form onSubmit={sendInvite} className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-500 mb-1">Email corporativo</label>
            <input
              type="email"
              value={inviteForm.email}
              onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
              placeholder="nombre@global81.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Rol</label>
            <select
              value={inviteForm.role}
              onChange={e => setInviteForm(f => ({ ...f, role: e.target.value as UserRole }))}
              className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="member">Miembro del Comité</option>
              <option value="observer">Observador</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Empresa</label>
            <select
              value={inviteForm.company}
              onChange={e => setInviteForm(f => ({ ...f, company: e.target.value }))}
              className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            >
              {COMPANIES.filter(c => c !== 'Todas').map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button
            type="submit"
            disabled={inviteBusy}
            className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-dark disabled:opacity-50"
          >
            {inviteBusy ? '...' : 'Invitar'}
          </button>
        </form>
        {inviteError && <p className="text-xs text-red-600">{inviteError}</p>}

        {invites.length > 0 && (
          <div className="pt-2 border-t border-gray-100 space-y-2">
            {invites.map(i => (
              <div key={i.email} className="flex items-center justify-between text-sm">
                <div>
                  <span className="text-gray-700">{i.email}</span>
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${ROLE_COLORS[i.role]}`}>{ROLE_LABELS[i.role]}</span>
                  <span className="ml-2 text-xs text-gray-400">invitado por {i.invitedByName}</span>
                </div>
                <button onClick={() => cancelInvite(i.email)} disabled={inviteBusy} className="text-xs text-gray-400 hover:text-red-600">Cancelar</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pendientes de aprobación */}
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
                <button
                  onClick={() => setRole(u, 'rejected')}
                  disabled={saving === u.uid}
                  className="bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-100 disabled:opacity-50"
                >
                  Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rechazados */}
      {rejected.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-gray-600 text-sm">{rejected.length} usuario{rejected.length !== 1 ? 's' : ''} rechazado{rejected.length !== 1 ? 's' : ''}</h2>
          {rejected.map(u => (
            <div key={u.uid} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <UserAvatar user={u} />
                <div>
                  <p className="font-medium text-sm text-gray-800">{u.name}</p>
                  <p className="text-xs text-gray-400">{u.email}</p>
                </div>
              </div>
              <button
                onClick={() => setRole(u, 'pending')}
                disabled={saving === u.uid}
                className="text-xs text-brand hover:underline disabled:opacity-50"
              >
                {saving === u.uid ? '...' : 'Reconsiderar'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Activos */}
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
                      <div className="flex gap-3 justify-end">
                        <button onClick={() => startEdit(u)} className="text-xs text-brand hover:underline">Editar</button>
                        <button
                          onClick={() => { if (confirm(`¿Revocar el acceso de ${u.name}?`)) setRole(u, 'rejected'); }}
                          disabled={saving === u.uid}
                          className="text-xs text-red-500 hover:underline disabled:opacity-50"
                        >
                          Revocar
                        </button>
                      </div>
                    )
                  )}
                  {u.uid === me?.uid && <span className="text-xs text-gray-300">Tú</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700 space-y-1">
        <p className="font-semibold">💡 Reglas de seguridad</p>
        <p>El acceso está protegido por reglas de Firestore (<code>firestore.rules</code>) basadas en el rol de cada usuario. Un usuario nunca puede cambiar su propio rol — solo un administrador puede hacerlo.</p>
      </div>
    </div>
  );
}
