import { Star } from 'lucide-react';

// 1-5 star rating control
export function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n === value ? 0 : n)}
          className="p-0.5 hover:scale-110 transition-transform"
        >
          <Star
            className={`w-6 h-6 ${n <= value ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`}
            strokeWidth={1.5}
          />
        </button>
      ))}
      {value > 0 && (
        <span className="ml-2 text-sm font-medium text-slate-600">{value}/5</span>
      )}
    </div>
  );
}

// 0-10 NPS-style rating control
export function NpsRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 flex-wrap">
        {Array.from({ length: 11 }, (_, i) => i).map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n === value ? -1 : n)}
            className={`w-8 h-8 rounded-md text-xs font-bold transition-colors ${
              n === value
                ? 'bg-amber-400 text-white border-amber-400'
                : n <= value
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            } border`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between mt-1.5 px-0.5">
        <span className="text-[11px] text-slate-400">Not likely</span>
        <span className="text-[11px] text-slate-400">Very likely</span>
      </div>
      {value >= 0 && (
        <p className="text-xs text-slate-600 mt-1.5">
          Score: <span className="font-semibold">{value}/10</span>
          {value >= 9 && <span className="text-emerald-600 ml-1">Promoter</span>}
          {value >= 7 && value <= 8 && <span className="text-amber-600 ml-1">Passive</span>}
          {value >= 0 && value <= 6 && <span className="text-red-600 ml-1">Detractor</span>}
        </p>
      )}
    </div>
  );
}
