import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Manrope, Playfair_Display } from "next/font/google";
import "@/app/globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AppProviders } from "@/components/providers/app-providers";
import { getCategories, getStores } from "@/lib/server-data";

export const dynamic = "force-dynamic";

/* Display serif for the logo and headings — Cyrillic-capable, editorial feel. */
const displayFont = Playfair_Display({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap"
});

/* Clean, highly legible sans for body copy — full Cyrillic support. */
const bodyFont = Manrope({
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap"
});

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
    <html lang="ru" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body className="font-body antialiased">
        <AppProviders stores={stores} initialStoreId={initialStoreId}>
          <SiteHeader categories={categories} />
          <main>{children}</main>
          <SiteFooter stores={stores} />
        </AppProviders>
      </body>
    </html>
  );
}
