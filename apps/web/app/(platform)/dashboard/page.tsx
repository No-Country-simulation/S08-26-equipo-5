import { redirect } from "next/navigation";

// El dashboard se reemplazó por "Mis reuniones"; se conserva la ruta por compatibilidad.
export default function DashboardPage() {
  redirect("/agenda");
}
