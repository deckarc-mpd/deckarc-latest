import { Construction } from 'lucide-react';

interface ComingSoonPageProps {
  title: string;
  description?: string;
}

export default function ComingSoonPage({ title, description }: ComingSoonPageProps) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-sm w-full bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
        <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Construction className="w-6 h-6 text-slate-400" />
        </div>
        <h2 className="text-base font-bold text-slate-800 mb-2">{title}</h2>
        <p className="text-sm text-slate-400 leading-relaxed">
          {description || 'This section is not yet available. Use "Enter Workspace" to access DECKARC operational data.'}
        </p>
      </div>
    </div>
  );
}
