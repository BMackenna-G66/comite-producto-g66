export default function AdminPage() {
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-800">Administración</h1>
      <p className="text-gray-500 text-sm mt-1">Panel de configuración del sistema.</p>
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-5 text-sm text-blue-700 space-y-2">
        <p className="font-semibold">💾 Almacenamiento local</p>
        <p>Todos los datos se guardan en <code className="bg-blue-100 px-1 rounded">localStorage</code> de este navegador.</p>
        <button
          onClick={() => {
            if (confirm('¿Borrar todos los datos? Esta acción no se puede deshacer.')) {
              ['cp_products','cp_risks','cp_sessions','cp_redflags','cp_commitments'].forEach(k => localStorage.removeItem(k));
              window.location.reload();
            }
          }}
          className="mt-3 bg-red-100 text-red-700 border border-red-200 px-4 py-2 rounded-lg text-xs font-medium hover:bg-red-200 transition-colors"
        >
          Limpiar todos los datos
        </button>
      </div>
    </div>
  );
}
