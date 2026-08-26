export default async function InvitePage({
  params,
}: {
  params: Promise<{ inviteToken: string }>;
}) {
  const { inviteToken } = await params;
  return <p>Invite {inviteToken} — coming soon.</p>;
}
