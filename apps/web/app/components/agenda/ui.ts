// Clases compartidas de la pantalla "Mis reuniones" (tokens de marca en globals.css).

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mf-blue focus-visible:shadow-none";

export const btnPrimary = `inline-flex items-center justify-center gap-2 rounded-xl bg-mf-blue px-6 font-bold text-white transition-[background-color,transform,box-shadow] duration-150 hover:bg-mf-blue-dark hover:shadow-md active:translate-y-px active:bg-mf-navy disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-mf-blue disabled:hover:shadow-none ${focus}`;

export const btnSecondary = `inline-flex items-center justify-center rounded-xl border border-mf-line bg-white px-5 font-bold text-mf-navy transition-colors hover:border-mf-blue hover:text-mf-blue active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${focus}`;

export const btnDanger = `inline-flex items-center justify-center rounded-xl bg-mf-coral px-5 font-bold text-white transition-[filter,transform] hover:brightness-90 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${focus}`;

export const iconButton = `inline-flex size-10 items-center justify-center rounded-lg border border-mf-line bg-white text-mf-muted transition-colors hover:border-mf-blue hover:text-mf-blue active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${focus}`;

export const fieldLabel = "block text-sm font-bold text-mf-navy";

export const fieldControl = `mt-2 block w-full rounded-xl border border-mf-line bg-white px-4 py-3 text-base font-normal text-mf-navy placeholder:text-mf-muted focus-visible:border-mf-blue focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-mf-blue focus-visible:shadow-none aria-[invalid=true]:border-mf-coral`;
