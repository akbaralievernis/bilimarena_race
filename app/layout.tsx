import type { Metadata, Viewport } from "next";
import { Manrope, Unbounded } from "next/font/google";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
});

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
});

export const metadata: Metadata = {
  title: {
    default: "Bilim Arena Race — образовательная гонка",
    template: "%s · Bilim Arena Race",
  },
  description:
    "Образовательная многопользовательская гонка: команды двигаются по карте и проходят учебные испытания в реальном времени.",
};

export const viewport: Viewport = {
  themeColor: "#F7F8FC",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${manrope.variable} ${unbounded.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <SiteHeader />
        {children}
        <footer className="mx-auto w-full max-w-6xl px-4 py-8 text-sm text-ink-muted sm:px-6 lg:px-8">
          <div className="flex flex-col gap-1 border-t border-line pt-6 sm:flex-row sm:justify-between">
            <p>Bilim Arena Race</p>
            <p>
              <Link href="/status" className="underline-offset-4 hover:text-brand-strong hover:underline">
                Проверка перед уроком
              </Link>
              {" · "}ранняя версия
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
