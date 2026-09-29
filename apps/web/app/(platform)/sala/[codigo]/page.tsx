import { redirect } from "next/navigation";

export default async function SalaRedirectPage({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  redirect(`/waiting-room?code=${encodeURIComponent(codigo)}`);
}
