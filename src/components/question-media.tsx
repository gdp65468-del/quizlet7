'use client'

import { useState } from 'react'
import { ImageOff } from 'lucide-react'

export function QuestionMedia({
  imageUrl,
  codeSnippet,
  codeLanguage,
}: {
  imageUrl?: string
  codeSnippet?: string
  codeLanguage?: string
}) {
  const [imgFailed, setImgFailed] = useState(false)

  if (!imageUrl && !codeSnippet) return null

  return (
    <div className="space-y-4">
      {imageUrl && (
        <div className="question-media-frame">
          {!imgFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="Question visual attachment"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-[#d8cfe6]">
              <ImageOff className="h-5 w-5 opacity-70" />
              <span>Imagem indisponível ({imageUrl})</span>
            </div>
          )}
        </div>
      )}
      {codeSnippet && (
        <div className="question-code-block">
          {codeLanguage && (
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#7de2e4]">
              {codeLanguage}
            </div>
          )}
          <pre className="m-0 overflow-x-auto whitespace-pre">
            <code>{codeSnippet}</code>
          </pre>
        </div>
      )}
    </div>
  )
}
