/*
 * Database functions raise stable snake_case codes (SQLSTATE P0001, message =
 * code). This module turns them — and network/auth failures — into texts for
 * the UI. Unknown errors never leak raw database messages to users.
 */

export const NETWORK_ERROR_MESSAGE =
  "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.";
export const UNKNOWN_ERROR_MESSAGE = "Что-то пошло не так. Попробуйте ещё раз.";
export const DATABASE_NOT_READY_MESSAGE =
  "База данных гонки не настроена: примените миграции из supabase/migrations (см. README).";

// PostgREST / Postgres codes for "function or table does not exist" — the
// project is reachable but the migrations have not been applied.
const DATABASE_NOT_READY_CODES = new Set(["PGRST202", "PGRST205", "42883", "42P01"]);

const RACE_ERROR_MESSAGES = {
  not_authenticated: "Сессия истекла. Войдите снова.",
  teacher_account_required: "Создавать гонки может только учитель с аккаунтом.",
  invalid_title: "Название должно быть от 3 до 80 символов.",
  invalid_description: "Описание — не больше 500 символов.",
  too_many_active_races: "Слишком много незавершённых гонок. Завершите старые, чтобы создать новую.",
  room_code_unavailable: "Не удалось подобрать код комнаты. Попробуйте ещё раз.",
  race_not_found: "Гонка с таким кодом не найдена.",
  race_finished: "Эта гонка уже завершена.",
  race_not_open: "Эта гонка ещё не открыта для подключения.",
  race_full: "В гонке уже максимальное число участников.",
  invalid_display_name: "Имя должно быть от 2 до 30 символов.",
  display_name_taken: "Это имя уже занято в гонке. Добавьте фамилию или инициал.",
  invalid_team_name: "Название команды — от 1 до 40 символов.",
  team_name_taken: "Команда с таким названием уже есть.",
  too_many_teams: "В гонке может быть не больше 20 команд.",
  team_not_found: "Команда не найдена. Обновите страницу.",
  team_not_empty: "Сначала уберите участников из команды.",
  participant_not_found: "Участник не найден. Обновите страницу.",
  cannot_assign_teacher: "Учителя нельзя добавить в команду.",
  invalid_status_transition: "Это действие недоступно при текущем статусе гонки.",
  invalid_route: "Маршрут должен содержать от 1 до 20 чекпоинтов.",
  invalid_checkpoint_title: "Название чекпоинта — от 1 до 60 символов.",
  race_not_started: "Гонка ещё не началась.",
  invalid_move: "Позиция команды уже изменилась — карта обновлена.",
  team_finished: "Команда уже на финише.",
  invalid_tasks: "У каждого чекпоинта должно быть задание.",
  invalid_task: "Проверьте задания: вопрос, варианты и правильный ответ.",
  task_required: "Чтобы пройти этот чекпоинт, ответьте на задание.",
  task_not_found: "Задание не найдено. Обновите страницу.",
  task_not_current: "Это задание уже неактуально — карта обновлена.",
  invalid_answer: "Проверьте ответ: выберите вариант или введите текст до 200 символов.",
} as const;

export type RaceErrorCode = keyof typeof RACE_ERROR_MESSAGES;

type ErrorLike = { message?: unknown; code?: unknown; name?: unknown };

function asErrorLike(error: unknown): ErrorLike {
  return typeof error === "object" && error !== null ? (error as ErrorLike) : {};
}

export function raceErrorCode(error: unknown): RaceErrorCode | null {
  const { message } = asErrorLike(error);
  return typeof message === "string" && message in RACE_ERROR_MESSAGES
    ? (message as RaceErrorCode)
    : null;
}

export function isNetworkError(error: unknown): boolean {
  const { message, name } = asErrorLike(error);
  if (name === "AuthRetryableFetchError") return true;
  const text = typeof message === "string" ? message : "";
  return /fetch failed|failed to fetch|networkerror|network request failed|load failed|econnrefused|enotfound|etimedout/i.test(
    text,
  );
}

/** UI text for an error from a race RPC. `overrides` adapts texts to the screen. */
export function raceErrorMessage(
  error: unknown,
  overrides: Partial<Record<RaceErrorCode, string>> = {},
): string {
  if (isNetworkError(error)) return NETWORK_ERROR_MESSAGE;
  const code = raceErrorCode(error);
  if (code) return overrides[code] ?? RACE_ERROR_MESSAGES[code];
  const { code: sqlState } = asErrorLike(error);
  if (typeof sqlState === "string" && DATABASE_NOT_READY_CODES.has(sqlState)) return DATABASE_NOT_READY_MESSAGE;
  return UNKNOWN_ERROR_MESSAGE;
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Неверный email или пароль.",
  email_not_confirmed: "Подтвердите email по ссылке из письма, затем войдите.",
  user_already_exists: "Этот email уже зарегистрирован. Войдите в аккаунт.",
  email_exists: "Этот email уже зарегистрирован. Войдите в аккаунт.",
  weak_password: "Пароль слишком простой. Используйте минимум 8 символов.",
  email_address_invalid: "Проверьте адрес электронной почты.",
  validation_failed: "Проверьте email и пароль.",
  signup_disabled: "Регистрация новых учителей сейчас отключена.",
  over_request_rate_limit: "Слишком много попыток. Подождите минуту и попробуйте снова.",
  over_email_send_rate_limit: "Слишком много писем за короткое время. Попробуйте позже.",
  anonymous_provider_disabled:
    "Вход для студентов отключён: включите Anonymous Sign-Ins в настройках Supabase.",
};

export function authErrorMessage(error: unknown): string {
  if (isNetworkError(error)) return NETWORK_ERROR_MESSAGE;
  const { code } = asErrorLike(error);
  return (typeof code === "string" && AUTH_ERROR_MESSAGES[code]) || UNKNOWN_ERROR_MESSAGE;
}
