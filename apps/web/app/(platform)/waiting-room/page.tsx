import { WaitingRoomClient } from "../../components/waiting-room-client";

type WaitingRoomPageProps = {
  searchParams: Promise<{ code?: string; demo?: string }>;
};

export default async function WaitingRoomPage({ searchParams }: WaitingRoomPageProps) {
  const { code, demo } = await searchParams;
  const normalizedCode = code?.trim().toUpperCase() ?? "";

  if (demo === "true" || normalizedCode === "DEMO-123") {
    return <WaitingRoomClient code={normalizedCode || "DEMO-123"} />;
  }

  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-blue-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
          Sala de espera
        </p>
        <h1 id="page-title" className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
          La reunión todavía no comenzó
        </h1>
        <p className="mt-4 text-slate-600">
          Podés permanecer en esta pantalla. Te avisaremos cuando el anfitrión
          habilite el ingreso.
        </p>
        {code && (
          <p className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Código de reunión: <strong className="tracking-widest text-slate-950">{code}</strong>
          </p>
        )}
      </div>
    </section>
  );
}
