import type { Metadata } from "next";
import { cookies } from "next/headers";
import "@fontsource/montserrat/300.css";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/500.css";
import "@/app/globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AppProviders } from "@/components/providers/app-providers";
import { getCategories, getStores } from "@/lib/server-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "MIA — мультибрендовый бутик",
  description: "Интернет-магазин Mia: женская, мужская и детская одежда"
};

export default async function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const [stores, categories] = await Promise.all([getStores(), getCategories()]);
  const cookieStore = cookies();
  const initialStoreId = cookieStore.get("mia_store")?.value ?? stores[0]?.id ?? "";

  return (
    <html lang="ru" data-font-theme="montserrat">
      <body className="font-body">
        <AppProviders stores={stores} initialStoreId={initialStoreId}>
          <SiteHeader categories={categories} />
          <main>{children}</main>
          <SiteFooter stores={stores} />
        </AppProviders>
      </body>
    </html>
  );
}
