'use client'

import { jsPDF } from 'jspdf'
import type { SessionReport } from '@/types/game'

function csvEscape(value: string | number): string {
  const str = String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportReportCsv(report: SessionReport) {
  const lines: string[] = []
  lines.push(['Quiz', report.quizName].map(csvEscape).join(','))
  lines.push(['Category', report.category].map(csvEscape).join(','))
  lines.push(['Class / Cohort', report.classLabel || '-'].map(csvEscape).join(','))
  lines.push(['Completed At', report.completedAt].map(csvEscape).join(','))
  lines.push(['Participants', report.participantCount].map(csvEscape).join(','))
  lines.push(['Average Accuracy (%)', report.averageAccuracy.toFixed(1)].map(csvEscape).join(','))
  lines.push('')
  lines.push('Leaderboard')
  lines.push(['Rank', 'Nickname', 'Total Score', 'Correct', 'Questions', 'Accuracy (%)', 'Best Streak'].join(','))
  report.leaderboard.forEach((entry, index) => {
    const acc = report.questionCount ? ((entry.correctCount / report.questionCount) * 100).toFixed(1) : '0.0'
    lines.push(
      [index + 1, entry.nickname, entry.totalScore, entry.correctCount, report.questionCount, acc, entry.bestStreak]
        .map(csvEscape)
        .join(','),
    )
  })
  lines.push('')
  lines.push('Question Breakdown')
  lines.push(['#', 'Question', 'Correct Answers', 'Total Answers', 'Accuracy (%)', 'Error Rate (%)'].join(','))
  report.questionStats.forEach((q, index) => {
    const errRate = (100 - q.accuracyPercent).toFixed(1)
    lines.push(
      [index + 1, q.questionBody, q.correctCount, q.totalAnswers, q.accuracyPercent.toFixed(1), errRate]
        .map(csvEscape)
        .join(','),
    )
  })

  const bom = '\uFEFF'
  const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const slug = report.quizName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'quiz'
  triggerDownload(blob, `${slug}-report-${report.id}.csv`)
}

export function exportReportPdf(report: SessionReport) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 44
  let y = 52

  const ensureSpace = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - 50) {
      doc.addPage()
      y = 50
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(30, 27, 75)
  doc.text(`Relatorio de Partida: ${report.quizName}`, margin, y, { maxWidth: pageWidth - margin * 2 })
  y += 24

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(85, 92, 118)
  const metaParts = [
    `Categoria: ${report.category}`,
    report.classLabel ? `Turma: ${report.classLabel}` : null,
    `Data: ${new Date(report.completedAt).toLocaleString()}`,
  ]
    .filter(Boolean)
    .join('  |  ')
  doc.text(metaParts, margin, y)
  y += 18
  doc.text(
    `Participantes: ${report.participantCount}   |   Perguntas: ${report.questionCount}   |   Acuracia Media: ${report.averageAccuracy.toFixed(1)}%   |   Top Scorer: ${report.topScorer || '-'}`,
    margin,
    y,
  )
  y += 28

  // Leaderboard table
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(30, 27, 75)
  doc.text('Classificacao dos Participantes', margin, y)
  y += 16

  doc.setFontSize(9.5)
  doc.setFillColor(238, 240, 250)
  doc.rect(margin, y - 11, pageWidth - margin * 2, 18, 'F')
  doc.text('#', margin + 8, y)
  doc.text('Participante', margin + 36, y)
  doc.text('Pontos', margin + 270, y)
  doc.text('Acertos', margin + 345, y)
  doc.text('Maior Streak', margin + 430, y)
  y += 16

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(40, 44, 64)
  if (report.leaderboard.length === 0) {
    doc.text('Nenhum participante registrado.', margin + 8, y)
    y += 18
  } else {
    report.leaderboard.forEach((entry, index) => {
      ensureSpace(20)
      doc.text(String(index + 1), margin + 8, y)
      doc.text(entry.nickname.slice(0, 34), margin + 36, y)
      doc.text(String(entry.totalScore), margin + 270, y)
      doc.text(`${entry.correctCount}/${report.questionCount}`, margin + 345, y)
      doc.text(`${entry.bestStreak}x`, margin + 430, y)
      y += 16
    })
  }

  y += 18
  ensureSpace(40)

  // Question analysis
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(30, 27, 75)
  doc.text('Analise por Pergunta', margin, y)
  y += 18

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  report.questionStats.forEach((stat, index) => {
    const wrapped = doc.splitTextToSize(`${index + 1}. ${stat.questionBody}`, pageWidth - margin * 2 - 140)
    ensureSpace(wrapped.length * 13 + 12)
    doc.setTextColor(40, 44, 64)
    doc.text(wrapped, margin, y)
    const errRate = Math.max(0, 100 - stat.accuracyPercent)
    if (errRate >= 50) {
      doc.setTextColor(185, 28, 28)
    } else {
      doc.setTextColor(21, 128, 61)
    }
    doc.text(
      `${stat.accuracyPercent.toFixed(0)}% acerto (${errRate.toFixed(0)}% erro)`,
      pageWidth - margin - 130,
      y,
    )
    y += wrapped.length * 13 + 8
  })

  const slug = report.quizName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'quiz'
  doc.save(`${slug}-report-${report.id}.pdf`)
}
