type PlaceholderPageProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function PlaceholderPage({
  eyebrow,
  title,
  description,
}: PlaceholderPageProps) {
  return (
    <section
      aria-labelledby="page-title"
      className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 shadow-sm"
    >
      <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
        {eyebrow}
      </p>
      <h1 id="page-title" className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
        {title}
      </h1>
      <p className="mt-4 max-w-2xl text-slate-600">{description}</p>
      <div className="mt-8 rounded-xl bg-slate-50 p-6 text-sm text-slate-500">
        Placeholder de navegación. El contenido de esta vista se implementará en una
        tarea posterior.
      </div>
    </section>
  );
}
