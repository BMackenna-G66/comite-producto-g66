import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createProduct } from '../services/firestore';
import { COMPANIES } from '../types';

export default function NewProductPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [form, setForm] = useState({
    name: '',
    description: '',
    businessCase: '',
    publicTarget: '',
    companies: [] as string[],
  });

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const toggleCompany = (c: string) => {
    setForm(f => ({
      ...f,
      companies: f.companies.includes(c) ? f.companies.filter(x => x !== c) : [...f.companies, c],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const id = await createProduct({
        ...form,
        owner: crypto.randomUUID(),
        ownerName: ownerName || 'Sin asignar',
        status: 'gate1',
        currentGate: 1,
        gate1Status: 'in_progress',
        gate2Status: 'pending',
        gate3Status: 'pending',
      });
      navigate(`/products/${id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Nuevo Producto</h1>
        <p className="text-gray-500 text-sm mt-1">Inicia el proceso de aprobación ante el Comité de Producto.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        <div className="px-6 py-5 space-y-4">
          <h2 className="font-semibold text-gray-700 text-sm">Información General</h2>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del Producto / Iniciativa *</label>
            <input required value={form.name} onChange={e => set('name', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Ej: Tarjeta Prepago Digital Global Card" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Owner / Responsable</label>
            <input value={ownerName} onChange={e => setOwnerName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Nombre del responsable del producto" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descripción del Producto *</label>
            <textarea required rows={3} value={form.description} onChange={e => set('description', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
              placeholder="Descripción técnica y funcional del producto..." />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Business Case / Justificación *</label>
            <textarea required rows={4} value={form.businessCase} onChange={e => set('businessCase', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
              placeholder="Justificación comercial, KPIs esperados, mercado objetivo..." />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Público Objetivo</label>
            <input value={form.publicTarget} onChange={e => set('publicTarget', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Ej: Personas naturales mayores de 18 años en Chile" />
          </div>
        </div>

        <div className="px-6 py-5 space-y-3">
          <h2 className="font-semibold text-gray-700 text-sm">Empresas Afectadas</h2>
          <div className="flex flex-wrap gap-2">
            {COMPANIES.map(c => (
              <button key={c} type="button" onClick={() => toggleCompany(c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  form.companies.includes(c) ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200 hover:border-brand'
                }`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 flex items-center justify-end gap-3">
          <button type="button" onClick={() => navigate('/products')} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
          <button type="submit" disabled={saving} className="bg-brand text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-brand-dark disabled:opacity-50 transition-colors">
            {saving ? 'Creando...' : 'Crear Producto'}
          </button>
        </div>
      </form>
    </div>
  );
}
