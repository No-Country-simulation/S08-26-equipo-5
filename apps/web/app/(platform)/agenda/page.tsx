import { AgendaScreen } from "../../components/agenda/agenda-screen";
import { AuthGuard } from "../../components/auth-guard";

export default function AgendaPage() {
  return (
    <AuthGuard>
      <AgendaScreen />
    </AuthGuard>
  );
}
