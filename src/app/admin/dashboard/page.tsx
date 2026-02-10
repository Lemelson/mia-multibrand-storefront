import { redirect } from "next/navigation";
import { Container } from "@/components/container";
import { AdminDashboard } from "@/components/admin-dashboard";
import { isAdminSession } from "@/lib/admin-session";
import { getCategories, getOrders, getProducts, getStores } from "@/lib/server-data";

export default async function AdminDashboardPage() {
  if (!isAdminSession()) {
    redirect("/admin");
  }

  const [initialProducts, initialOrders, stores, categories] = await Promise.all([
    getProducts(),
    getOrders(),
    getStores(),
    getCategories()
  ]);

  return (
    <Container>
      <AdminDashboard
        initialProducts={initialProducts}
        initialOrders={initialOrders}
        stores={stores}
        categories={categories}
      />
    </Container>
  );
}
