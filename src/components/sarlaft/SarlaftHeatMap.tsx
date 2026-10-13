import { severityOf } from '../../sarlaft/methodology';

const CELL_COLORS = {
  BAJO: 'bg-green-100',
  MODERADO: 'bg-yellow-100',
  ALTO: 'bg-orange-200',
  EXTREMO: 'bg-red-200',
};

interface Point {
  label: string;
  title: string;
  probability: number;
  impact: number;
}

// Mapa térmico 5×5 de la matriz: probabilidad en X, impacto en Y. Los valores
// residuales no enteros se ubican en la celda redondeada.
export default function SarlaftHeatMap({ title, points }: { title: string; points: Point[] }) {
  const cell = (p: number, i: number) =>
    points.filter(pt => Math.min(5, Math.max(1, Math.round(pt.probability))) === p && Math.min(5, Math.max(1, Math.round(pt.impact))) === i);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">{title}</p>
      <div className="flex gap-2">
        <div className="flex flex-col justify-around text-[10px] text-gray-400 w-3">
          <span className="-rotate-90 whitespace-nowrap">Impacto</span>
        </div>
        <div className="flex-1">
          <div className="grid grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-1">
            {[5, 4, 3, 2, 1].map(i => (
              <div key={i} className="contents">
                <div className="text-[10px] text-gray-400 flex items-center justify-end pr-1">{i}</div>
                {[1, 2, 3, 4, 5].map(p => {
                  const here = cell(p, i);
                  return (
                    <div key={p} className={`${CELL_COLORS[severityOf(p * i)]} rounded min-h-[44px] p-1 flex flex-wrap gap-0.5 content-start`}>
                      {here.map(pt => (
                        <span key={pt.label + pt.title} title={pt.title} className="text-[10px] font-semibold bg-white/80 text-gray-700 rounded px-1">
                          {pt.label}
                        </span>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
            <div />
            {[1, 2, 3, 4, 5].map(p => <div key={p} className="text-[10px] text-gray-400 text-center">{p}</div>)}
          </div>
          <p className="text-[10px] text-gray-400 text-center mt-1">Probabilidad</p>
        </div>
      </div>
    </div>
  );
}
