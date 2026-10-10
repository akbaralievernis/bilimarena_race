import type { Metadata, Viewport } from "next";
import { Manrope, Unbounded } from "next/font/google";
import Link from "next/link";
import { I18nProvider } from "@/components/i18n/i18n-provider";
import { SiteHeader } from "@/components/site-header";
import { getI18n } from "@/lib/i18n/server";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
});

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
});

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return {
    title: { default: m.meta.title, template: "%s · Bilim Arena Race" },
    description: m.meta.description,
  };
}

export const viewport: Viewport = {
  themeColor: "#F7F8FC",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The language comes from a cookie, so every page renders on request.
  const { locale, m } = await getI18n();
  return (
    <html lang={locale} className={`${manrope.variable} ${unbounded.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <I18nProvider locale={locale}>
          <SiteHeader />
          {children}
          <footer className="mx-auto w-full max-w-6xl px-4 py-8 text-sm text-ink-muted sm:px-6 lg:px-8">
            <div className="flex flex-col gap-1 border-t border-line pt-6 sm:flex-row sm:justify-between">
              <p>Bilim Arena Race</p>
              <p>
                <Link href="/status" className="underline-offset-4 hover:text-brand-strong hover:underline">
                  {m.header.statusLink}
                </Link>
                {" · "}
                {m.header.earlyVersion}
              </p>
            </div>
          </footer>
        </I18nProvider>
      </body>
    </html>
  );
}
