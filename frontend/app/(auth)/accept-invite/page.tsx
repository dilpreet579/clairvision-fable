"use client";

import TokenPasswordForm from "@/components/auth/TokenPasswordForm";
import { acceptInvite } from "@/lib/api-client";

export default function AcceptInvitePage() {
  return (
    <TokenPasswordForm
      heading="Join ClairVision"
      intro="You've been invited as an event organizer. Choose a password to activate your account, then sign in with it."
      submitLabel="Activate account"
      submittingLabel="Activating..."
      onSubmitToken={(token, password) => acceptInvite(token, password)}
    />
  );
}
