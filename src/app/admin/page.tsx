import { redirect } from "next/navigation";
import { Container } from "@/components/container";
import { AdminLoginForm } from "@/components/admin-login-form";
import { isAdminSession } from "@/lib/admin-session";

export default function AdminPage() {
  if (isAdminSession()) {
    redirect("/admin/dashboard");
  }

  return (
    <Container className="py-10">
      <AdminLoginForm />
    </Container>
  );
}
