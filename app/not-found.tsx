import type { Metadata } from "next";
import { NoticeCard } from "@/components/notice-card";

export const metadata: Metadata = {
  title: "Страница не найдена",
};

export default function NotFound() {
  return (
    <NoticeCard
      badge="404"
      title="Сошли с маршрута"
      description="Такой страницы нет. Вернитесь на главную и начните гонку заново."
      icon={
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-8">
          <path
            d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21zm0-9a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      }
    />
  );
}
