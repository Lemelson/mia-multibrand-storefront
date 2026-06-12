import type { Metadata } from "next";
import { cookies } from "next/headers";
import {
  Manrope,
  Playfair_Display,
  Montserrat,
  Prata,
  Forum,
  Inter,
  Tenor_Sans
} from "next/font/google";
import "@/app/globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AppProviders } from "@/components/providers/app-providers";
import { getCategories, getStores } from "@/lib/server-data";

export const dynamic = "force-dynamic";

/*
 * All font families used by the footer font switcher are loaded once here and
 * exposed as CSS variables on <html>. The active theme just remaps
 * --font-logo-family / --font-body-family in globals.css via [data-font-theme],
 * so switching is instant (no re-fetch). All faces support Cyrillic.
 */
const playfair = Playfair_Display({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
  variable: "--font-playfair",
  display: "swap"
});
const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-manrope",
  display: "swap"
});
const montserrat = Montserrat({
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-montserrat",
  display: "swap"
});
const prata = Prata({
  subsets: ["latin", "cyrillic"],
  weight: "400",
  variable: "--font-prata",
  display: "swap"
});
const forum = Forum({
  subsets: ["latin", "cyrillic"],
  weight: "400",
  variable: "--font-forum",
  display: "swap"
});
const inter = Inter({
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-inter",
  display: "swap"
});
const tenor = Tenor_Sans({
  subsets: ["latin", "cyrillic"],
  weight: "400",
  variable: "--font-tenor",
  display: "swap"
});

const fontVariables = [
  playfair.variable,
  manrope.variable,
  montserrat.variable,
  prata.variable,
  forum.variable,
  inter.variable,
  tenor.variable
].join(" ");

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
    <html lang="ru" data-font-theme="new" className={fontVariables}>
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
