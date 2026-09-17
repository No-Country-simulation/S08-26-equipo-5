import { AgendaTable } from "../../components/agenda-table";

export default function DashboardPage() {
  return (
    <section aria-labelledby="page-title" className="space-y-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
          Dashboard
        </p>
        <h1 id="page-title" className="mt-3 text-4xl font-bold tracking-tight text-slate-950">
          Resumen de tus reuniones
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">
          Gestioná tu agenda y encontrá rápidamente la próxima reunión.
        </p>
      </div>
      <AgendaTable />
    </section>
  );
}
