import type { Metadata } from "next";
import { NoticeCard } from "@/components/notice-card";

export const metadata: Metadata = {
  title: "Подключиться к гонке",
};

export default function JoinRacePage() {
  return (
    <NoticeCard
      badge="Скоро"
      title="Подключение к гонке"
      description="Здесь студенты смогут ввести код комнаты, выбрать команду и присоединиться к гонке со своего устройства."
      icon={
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-8">
          <path
            d="M10 17l5-5-5-5M15 12H3M14 3h4a3 3 0 013 3v12a3 3 0 01-3 3h-4"
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
