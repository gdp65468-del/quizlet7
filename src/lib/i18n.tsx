'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

export type Locale = 'pt' | 'en'

const dictionary = {
  pt: {
    brandTag: 'Arena Bíblica ao vivo',
    navHome: 'Início',
    navEditor: 'Editor & IA',
    navHistory: 'Histórico',
    navInstructions: 'Instruções',
    navSettings: 'Configurações',
    signOut: 'Sair',
    welcomeAdmin: 'Painel do apresentador',
    welcomeTitle: 'Bem-vindo,',
    categories: 'Categorias',
    quizzes: 'Quizzes',
    chooseQuizHint: 'Escolha uma categoria e um quiz para abrir uma sala, ou crie um novo quiz visualmente.',
    createQuizBtn: 'Criar Quiz',
    aiPromptBtn: 'Prompt para IA',
    createPollBtn: 'Criar Enquete',
    historyBtn: 'Histórico & Relatórios',
    classLabelInput: 'Turma / Grupo (opcional)',
    classLabelPlaceholder: 'Ex: Turma 3B · Manhã',
    browseCategory: 'Explorar por categoria',
    quizLibrary: 'Biblioteca de quizzes',
    backToCategories: 'Voltar às categorias',
    backToHome: 'Voltar ao início',
    hostThisQuiz: 'Apresentar quiz',
    openingRoom: 'Abrindo sala...',
    editQuiz: 'Editar',
    questionsReady: 'perguntas prontas para jogar',
    questionCountLabel: (n: number) => `${n} ${n === 1 ? 'pergunta' : 'perguntas'}`,
    openCategory: 'Abrir categoria',
    // Login
    adminAccess: 'Acesso administrativo',
    welcomeBack: 'Bem-vindo de volta.',
    enterPassword: 'Digite sua senha para gerenciar e apresentar quizzes.',
    password: 'Senha',
    signIn: 'Entrar',
    signingIn: 'Entrando...',
    incorrectPassword: 'Senha incorreta.',
    cookieBlockedError: 'Seu navegador bloqueou os cookies de sessão dentro deste iframe. Permita cookies de terceiros ou abra o painel em uma nova aba.',
    openInNewTab: 'Abrir em nova aba',
    defaultPasswordHint: 'Senha padrão: admin (configure QUIZ_ADMIN_PASSWORD nos Secrets / .env.local).',
    // Lobby
    hostRoom: 'Sala do host',
    playerView: 'Visão do jogador',
    waitingRoom: 'Sala de espera',
    scanToJoin: 'Escaneie para entrar',
    roomCode: 'Código da sala',
    playerLink: 'Link para participantes',
    copyLink: 'Copiar link da sala',
    copied: 'Copiado!',
    playersJoined: 'Participantes conectados',
    waitingPlayers: 'Aguardando participantes entrarem pelo link ou QR Code...',
    startQuiz: 'Iniciar quiz',
    cancelQuiz: 'Cancelar quiz',
    cancelling: 'Cancelando...',
    endQuizEarly: 'Encerrar quiz',
    exitQuizTitle: 'Encerrar e cancelar este quiz?',
    exitQuizWarning: 'Ao cancelar agora, a partida será encerrada imediatamente para todos os participantes e nenhum ponto desta sessão será contabilizado ou salvo no histórico.',
    continueQuiz: 'Continuar no quiz',
    confirmCancelQuiz: 'Sim, cancelar e sair',
    quizCancelledNotice: 'O apresentador encerrou esta partida antes do fim. Os pontos desta sessão não foram contabilizados.',
    joinAnotherQuiz: 'Entrar em outra sala',
    soundOn: 'Som ligado',
    soundOff: 'Mudo',
    // Quiz Host & Player
    liveQuestion: 'Pergunta ao vivo',
    questionOf: (i: number, total: number) => `Pergunta ${i} de ${total}`,
    answerRevealed: 'Resposta revelada',
    bonus2x: '2x BÔNUS',
    multiSelectHint: 'Selecione todas as corretas',
    trueFalseHint: 'Verdadeiro ou Falso',
    choicesComing: 'As alternativas já vão aparecer',
    readQuestionHint: 'Dê um momento para todos lerem a pergunta.',
    readQuestionPlayer: 'Leia a pergunta',
    choicesAppearSoon: 'As alternativas aparecerão em instantes.',
    submitAnswers: 'Confirmar respostas',
    answerLocked: 'Resposta enviada!',
    waitingReveal: 'Aguardando revelação...',
    revealNow: 'Revelar resposta agora',
    showPartialRank: 'Ver ranking parcial (Top 5)',
    nextQuestion: 'Próxima pergunta',
    seeResults: 'Ver pódio final',
    answersCount: 'Respostas',
    secondsLeft: (s: number) => `${s}s restantes`,
    correct: 'Correta!',
    partialCorrect: 'Acerto parcial!',
    incorrect: 'Incorreta',
    timeUp: 'Tempo esgotado',
    streakLabel: (n: number) => `Sequência ${n}x`,
    speedBonusLabel: 'Velocidade',
    streakBonusLabel: 'Sequência',
    rankPosition: (rank: number, total: number) => `Você está em ${rank}º lugar de ${total}`,
    pointsBehind: (pts: number, targetRank: number) => `${pts} pts atrás do ${targetRank}º`,
    pointsAhead: (pts: number) => `${pts} pts à frente do 2º lugar`,
    rankUp: (d: number) => `Subiu ${d} ${d === 1 ? 'posição' : 'posições'}`,
    rankDown: (d: number) => `Desceu ${Math.abs(d)} ${Math.abs(d) === 1 ? 'posição' : 'posições'}`,
    // Partial Leaderboard
    partialStandingsTitle: 'Ranking parcial',
    top5Players: 'Top 5 até agora',
    highestStreak: 'Maior sequência',
    biggestClimber: 'Maior subida',
    // Results & Podium
    gameComplete: 'Partida encerrada',
    sessionComplete: 'Sessão concluída.',
    thankYouPlaying: 'Obrigado por participar.',
    podiumTitle: 'Pódio dos campeões',
    revealAllPodium: 'Revelar tudo',
    replayPodium: 'Repetir pódio',
    exportCsv: 'Exportar CSV',
    exportPdf: 'Exportar PDF',
    returnHome: 'Voltar ao início',
    closingSession: 'Encerrando sala...',
    finalStandings: 'Classificação final',
    correctDistributionTitle: 'Distribuição de acertos',
    // Cloud Sync
    cloudConnected: 'Appwrite conectado',
    connectCloud: 'Conectar Appwrite',
    cloudSignOut: 'Desconectar Appwrite',
    // Editor & AI Prompt
    editorTitle: 'Editor visual de quizzes',
    editorSubtitle: 'Crie, edite, reordene por arrastar-e-soltar ou importe de JSON/CSV e IA.',
    historyTitle: 'Histórico de partidas & evolução',
    historySubtitle: 'Compare desempenho entre turmas, identifique questões difíceis e exporte relatórios.',
  },
  en: {
    brandTag: 'Arena Bíblica Live',
    navHome: 'Home',
    navEditor: 'Editor & AI',
    navHistory: 'History',
    navInstructions: 'Instructions',
    navSettings: 'Settings',
    signOut: 'Sign out',
    welcomeAdmin: 'Admin dashboard',
    welcomeTitle: 'Welcome,',
    categories: 'Categories',
    quizzes: 'Quizzes',
    chooseQuizHint: 'Choose a category and quiz to open a room, or build a quiz in the visual editor.',
    createQuizBtn: 'Create Quiz',
    aiPromptBtn: 'AI Prompt',
    createPollBtn: 'Create Poll',
    historyBtn: 'History & Reports',
    classLabelInput: 'Class / Cohort (optional)',
    classLabelPlaceholder: 'e.g. Cohort A · Morning',
    browseCategory: 'Browse by category',
    quizLibrary: 'Quiz library',
    backToCategories: 'Back to categories',
    backToHome: 'Back to home',
    hostThisQuiz: 'Host this quiz',
    openingRoom: 'Opening room...',
    editQuiz: 'Edit',
    questionsReady: 'questions ready to play',
    questionCountLabel: (n: number) => `${n} ${n === 1 ? 'question' : 'questions'}`,
    openCategory: 'Open category',
    // Login
    adminAccess: 'Admin access',
    welcomeBack: 'Welcome back.',
    enterPassword: 'Enter your password to manage and host quizzes.',
    password: 'Password',
    signIn: 'Sign in',
    signingIn: 'Signing in...',
    incorrectPassword: 'Incorrect password.',
    cookieBlockedError: 'Your browser blocked session cookies inside this iframe. Allow cookies or open the app in a new tab.',
    openInNewTab: 'Open in new tab',
    defaultPasswordHint: 'Default password: admin (configure QUIZ_ADMIN_PASSWORD in Secrets / .env.local).',
    // Lobby
    hostRoom: 'Host room',
    playerView: 'Player view',
    waitingRoom: 'Waiting room',
    scanToJoin: 'Scan to join',
    roomCode: 'Room code',
    playerLink: 'Participant link',
    copyLink: 'Copy room link',
    copied: 'Copied!',
    playersJoined: 'Joined players',
    waitingPlayers: 'Waiting for participants to join via link or QR code...',
    startQuiz: 'Start quiz',
    cancelQuiz: 'Cancel quiz',
    cancelling: 'Cancelling...',
    endQuizEarly: 'End quiz',
    exitQuizTitle: 'Exit and cancel this quiz?',
    exitQuizWarning: 'Cancelling now ends the session immediately for all participants, and no points from this session will be counted or saved to history.',
    continueQuiz: 'Keep playing',
    confirmCancelQuiz: 'Yes, cancel & exit',
    quizCancelledNotice: 'The host ended this session early. No points from this session were counted.',
    joinAnotherQuiz: 'Join another room',
    soundOn: 'Sound on',
    soundOff: 'Muted',
    // Quiz Host & Player
    liveQuestion: 'Live question',
    questionOf: (i: number, total: number) => `Question ${i} of ${total}`,
    answerRevealed: 'Answer revealed',
    bonus2x: '2x BONUS',
    multiSelectHint: 'Select all correct answers',
    trueFalseHint: 'True or False',
    choicesComing: 'Choices are on their way',
    readQuestionHint: 'Give everyone a moment to read the question.',
    readQuestionPlayer: 'Read the question',
    choicesAppearSoon: 'Choices appear in a moment.',
    submitAnswers: 'Submit answers',
    answerLocked: 'Answer locked in!',
    waitingReveal: 'Waiting for reveal...',
    revealNow: 'Reveal answer now',
    showPartialRank: 'Show partial ranking (Top 5)',
    nextQuestion: 'Next question',
    seeResults: 'See final podium',
    answersCount: 'Answers',
    secondsLeft: (s: number) => `${s}s left`,
    correct: 'Correct!',
    partialCorrect: 'Partially correct!',
    incorrect: 'Incorrect',
    timeUp: 'Time is up',
    streakLabel: (n: number) => `Streak ${n}x`,
    speedBonusLabel: 'Speed',
    streakBonusLabel: 'Streak',
    rankPosition: (rank: number, total: number) => `You are #${rank} of ${total}`,
    pointsBehind: (pts: number, targetRank: number) => `${pts} pts behind #${targetRank}`,
    pointsAhead: (pts: number) => `${pts} pts ahead of #2`,
    rankUp: (d: number) => `Up ${d} ${d === 1 ? 'spot' : 'spots'}`,
    rankDown: (d: number) => `Down ${Math.abs(d)} ${Math.abs(d) === 1 ? 'spot' : 'spots'}`,
    // Partial Leaderboard
    partialStandingsTitle: 'Partial standings',
    top5Players: 'Top 5 so far',
    highestStreak: 'Highest streak',
    biggestClimber: 'Biggest climber',
    // Results & Podium
    gameComplete: 'Game complete',
    sessionComplete: 'Session complete.',
    thankYouPlaying: 'Thank you for playing.',
    podiumTitle: 'Champions podium',
    revealAllPodium: 'Reveal all',
    replayPodium: 'Replay podium',
    exportCsv: 'Export CSV',
    exportPdf: 'Export PDF',
    returnHome: 'Return to home',
    closingSession: 'Closing session...',
    finalStandings: 'Final standings',
    correctDistributionTitle: 'Correct answers distribution',
    // Cloud Sync
    cloudConnected: 'Appwrite synced',
    connectCloud: 'Connect Appwrite',
    cloudSignOut: 'Disconnect Appwrite',
    // Editor & AI Prompt
    editorTitle: 'Visual quiz editor',
    editorSubtitle: 'Create, edit, reorder via drag-and-drop, or import from JSON/CSV and AI.',
    historyTitle: 'Match history & class progress',
    historySubtitle: 'Compare performance across cohorts, spot tricky questions, and export reports.',
  },
}

export type TranslationKeys = typeof dictionary.pt

type LanguageContextValue = {
  locale: Locale
  setLocale: (next: Locale) => void
  t: TranslationKeys
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: 'pt',
  setLocale: () => {},
  t: dictionary.pt,
})

const STORAGE_KEY = 'quizlet:locale'

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('pt')

  useEffect(() => {
    const timer = setTimeout(() => {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'pt' || saved === 'en') {
        setLocaleState(saved)
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    localStorage.setItem(STORAGE_KEY, next)
  }, [])

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t: dictionary[locale] }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useI18n() {
  return useContext(LanguageContext)
}

export function LanguageToggle({ className = '' }: { className?: string }) {
  const { locale, setLocale } = useI18n()
  return (
    <div
      className={`inline-flex items-center rounded-lg border border-white/15 bg-white/5 p-0.5 text-xs font-bold ${className}`}
      role="group"
      aria-label="Language selector"
    >
      <button
        type="button"
        onClick={() => setLocale('pt')}
        className={`whitespace-nowrap rounded-md px-2.5 py-1.5 transition-colors ${
          locale === 'pt' ? 'bg-[#f5cf70] text-[#0b1526]' : 'text-[#c7d5e8] hover:text-white'
        }`}
      >
        PT-BR
      </button>
      <button
        type="button"
        onClick={() => setLocale('en')}
        className={`whitespace-nowrap rounded-md px-2.5 py-1.5 transition-colors ${
          locale === 'en' ? 'bg-[#f5cf70] text-[#0b1526]' : 'text-[#c7d5e8] hover:text-white'
        }`}
      >
        EN
      </button>
    </div>
  )
}
