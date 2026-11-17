export const MAX_QUIZZES_PER_USER = 5
export const MAX_QUESTIONS_PER_QUIZ = 25
export const MAX_QUESTIONS_JSON_BYTES = 65000

export const INACTIVITY_POLICY_TEXT_PT =
  'Contas e quizzes associados sem nenhum acesso ou login pelo período de 1 ano (365 dias) serão automaticamente excluídos para limpeza de dados.'

export const INACTIVITY_POLICY_TEXT_EN =
  'Accounts and associated quizzes with no access or login for a period of 1 year (365 days) will be automatically deleted for data cleanup.'

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length
}
