import type { QuizSet } from '@/types/game'

export const DEMO_QUIZ_ID = 'demo/quiz-demonstracao'

export const DEMO_QUIZ: QuizSet = {
  id: DEMO_QUIZ_ID,
  name: 'Quiz de Demonstração (3 perguntas)',
  description:
    'Modelo interativo com 3 perguntas bíblicas rápidas para testar a sala ao vivo, o QR Code, o cronômetro e o pódio sem consumir o limite da sua conta.',
  questions: [
    {
      id: 'demo-q1',
      order: 1,
      type: 'multiple_choice',
      body: 'Quem foi o personagem bíblico conhecido pela sua paciência?',
      choices: [
        { id: 'demo-q1-a', body: 'Moisés', is_correct: false },
        { id: 'demo-q1-b', body: 'Jó', is_correct: true },
        { id: 'demo-q1-c', body: 'Davi', is_correct: false },
        { id: 'demo-q1-d', body: 'Noé', is_correct: false },
      ],
    },
    {
      id: 'demo-q2',
      order: 2,
      type: 'multiple_choice',
      body: 'Qual instrumento Davi tocava para acalmar o rei Saul?',
      choices: [
        { id: 'demo-q2-a', body: 'Trombeta', is_correct: false },
        { id: 'demo-q2-b', body: 'Harpa', is_correct: true },
        { id: 'demo-q2-c', body: 'Flauta', is_correct: false },
        { id: 'demo-q2-d', body: 'Tamborim', is_correct: false },
      ],
    },
    {
      id: 'demo-q3',
      order: 3,
      type: 'true_false',
      body: 'Verdadeiro ou Falso: Noé construiu a arca antes do grande dilúvio.',
      choices: [
        { id: 'demo-q3-a', body: 'Verdadeiro', is_correct: true },
        { id: 'demo-q3-b', body: 'Falso', is_correct: false },
      ],
    },
  ],
}
