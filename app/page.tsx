import { RaceMapPreview } from "@/components/race-map-preview";
import { ButtonLink } from "@/components/ui/button-link";

const STEPS = [
  {
    title: "Учитель создаёт гонку",
    text: "Выбирает тему, настраивает маршрут и испытания, открывает комнату.",
  },
  {
    title: "Команды подключаются",
    text: "Студенты входят по коду комнаты со своих телефонов, планшетов или ноутбуков.",
  },
  {
    title: "Гонка в реальном времени",
    text: "Команды проходят испытания и двигаются по карте, а общий экран показывает, кто где.",
  },
  {
    title: "Результаты и разбор",
    text: "После финиша — итоговая таблица и аналитика: какие темы даются легко, а что стоит повторить.",
  },
];

const CHALLENGES = [
  { label: "Быстрые вопросы", dot: "bg-brand" },
  { label: "Решение задач", dot: "bg-teal" },
  { label: "Программирование", dot: "bg-brand" },
  { label: "Исправь ошибку в коде", dot: "bg-coral" },
  { label: "Скоростная печать", dot: "bg-teal" },
  { label: "Сборка понятий", dot: "bg-brand" },
  { label: "Пазлы", dot: "bg-sun" },
  { label: "Командные задания", dot: "bg-teal" },
  { label: "Бонусы", dot: "bg-sun" },
];

export default function HomePage() {
  return (
    <main className="flex-1">
      <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pt-6 pb-16 sm:px-6 sm:pt-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:px-8 lg:pt-14 lg:pb-24">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-teal-soft px-3.5 py-1.5 text-sm font-bold text-teal-strong">
            <span className="size-2 rounded-full bg-teal" aria-hidden="true" />
            Командная игра для класса
          </p>

          <h1 className="mt-5 font-display text-4xl leading-[1.05] font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Bilim Arena <span className="text-brand">Race</span>
          </h1>
          <p className="mt-4 text-xl font-bold sm:text-2xl">
            Образовательная многопользовательская гонка
          </p>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
            Учитель запускает гонку по выбранной теме, команды подключаются со своих устройств
            и продвигаются по карте, проходя испытания. Кто думает точнее и быстрее — тот ближе
            к финишу.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/create" className="w-full sm:w-auto">
              <svg viewBox="0 0 20 20" aria-hidden="true" className="size-5">
                <path
                  d="M5 17V3.5m0 0h9l-2 3.25L14 10H5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Создать гонку
            </ButtonLink>
            <ButtonLink href="/join" variant="secondary" className="w-full sm:w-auto">
              Подключиться к гонке
              <svg viewBox="0 0 20 20" aria-hidden="true" className="size-5">
                <path
                  d="M4 10h11m-4-4.5L15.5 10 11 14.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </ButtonLink>
          </div>
          <p className="mt-4 text-sm text-ink-muted">
            Учитель создаёт комнату · студенты входят по коду
          </p>
        </div>

        <RaceMapPreview />
      </section>

      <section
        aria-labelledby="how-it-works"
        className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 lg:px-8 lg:pb-24"
      >
        <h2 id="how-it-works" className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Как проходит гонка
        </h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line transition duration-200 hover:-translate-y-1 hover:shadow-lift"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft font-display text-base font-bold text-brand-strong">
                {index + 1}
              </span>
              <h3 className="mt-4 text-lg font-bold">{step.title}</h3>
              <p className="mt-2 leading-relaxed text-ink-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="challenges"
        className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 lg:px-8 lg:pb-20"
      >
        <div className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line sm:p-10">
          <h2 id="challenges" className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Испытания на маршруте
          </h2>
          <p className="mt-3 max-w-2xl text-ink-muted">
            Каждый чекпоинт — новое задание. Типы испытаний появятся на следующих этапах разработки.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2.5">
            {CHALLENGES.map((challenge) => (
              <li
                key={challenge.label}
                className="inline-flex items-center gap-2 rounded-full bg-canvas px-4 py-2 text-sm font-semibold ring-1 ring-line"
              >
                <span className={`size-2 rounded-full ${challenge.dot}`} aria-hidden="true" />
                {challenge.label}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
