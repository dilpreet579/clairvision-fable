"use client";

import TokenPasswordForm from "@/components/auth/TokenPasswordForm";
import { resetPassword } from "@/lib/api-client";

export default function ResetPasswordPage() {
  return (
    <TokenPasswordForm
      heading="Choose a new password"
      intro="Set a new password for your organizer account. You'll sign in with it right after."
      submitLabel="Set new password"
      submittingLabel="Saving..."
      onSubmitToken={(token, password) => resetPassword(token, password)}
    />
  );
}
