import { AuthPage } from "../auth-page";

export const metadata = { title: "Create an account" };

export default function SignUpPage() {
  return <AuthPage mode="sign-up" />;
}
