import type { Metadata } from "next";
import { NoticeCard } from "@/components/notice-card";

export const metadata: Metadata = {
  title: "Создать гонку",
};

export default function CreateRacePage() {
  return (
    <NoticeCard
      badge="Скоро"
      title="Создание гонки"
      description="Здесь учитель сможет выбрать тему, настроить маршрут и испытания, а затем открыть комнату для команд."
      icon={
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-8">
          <path
            d="M6 21V4m0 0h11l-2.5 4L17 12H6"
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
