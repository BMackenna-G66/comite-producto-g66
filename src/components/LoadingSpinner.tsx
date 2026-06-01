export default function LoadingSpinner({ fullScreen = false }: { fullScreen?: boolean }) {
  const wrapper = fullScreen
    ? 'fixed inset-0 flex items-center justify-center bg-white z-50'
    : 'flex items-center justify-center p-8';
  return (
    <div className={wrapper}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-brand border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-500">Cargando...</span>
      </div>
    </div>
  );
}
