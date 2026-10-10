import { NoticeCard } from "@/components/notice-card";
import { getI18n, pageMetadata } from "@/lib/i18n/server";

export const generateMetadata = pageMetadata("notFound");

export default async function NotFound() {
  const { m } = await getI18n();
  return (
    <NoticeCard
      badge="404"
      title={m.notices.notFoundTitle}
      description={m.notices.notFoundText}
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
