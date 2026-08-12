import { useState, useCallback } from 'react'
import { API_URL } from '../config.js'

export function useQuestionGeneration(token, roomSettings, currentSegment) {
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false)
  const [isGeneratingFromText, setIsGeneratingFromText] = useState(false)
  
  const [pendingQuestions, setPendingQuestions] = useState([])
  const [pendingTextQuestions, setPendingTextQuestions] = useState([])

  const generateQuestionsFromText = useCallback(async (text, segmentIndex) => {
    return new Promise((resolve, reject) => {
      setIsGeneratingQuestions(true)
      fetch(`${API_URL}/questions/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          transcript: text,
          config: {
            numQuestions: roomSettings.questionsPerSegment,
            difficulty: roomSettings.difficulty,
            provider: roomSettings.questionProvider || 'minimax',
            questionTypeMix: roomSettings.questionTypeMix || { MCQ: 0, TF: 100, MSQ: 0 }
          }
        })
      })
      .then(response => response.json())
      .then(data => {
        setIsGeneratingQuestions(false)
        if (data.success && data.questions && data.questions.length > 0) {
          const markedQuestions = data.questions.map(q => ({
            ...q,
            timeToAnswer: roomSettings.timeToAnswer,
            points: roomSettings.points,
            segmentIndex: segmentIndex
          }))
          resolve(markedQuestions)
        } else {
          reject(new Error(data.error || 'No questions generated'))
        }
      })
      .catch(error => {
        setIsGeneratingQuestions(false)
        reject(error)
      })
    })
  }, [token, roomSettings])

  const handleTextToQuestionsGenerate = useCallback(async (text, mode) => {
    setIsGeneratingFromText(true)

    try {
      const typeMix = mode === 'TF'
        ? { MCQ: 0, TF: 100, MSQ: 0 }
        : (roomSettings.questionTypeMix || { MCQ: 0, TF: 100, MSQ: 0 })

      const response = await fetch(`${API_URL}/questions/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          transcript: text,
          config: {
            numQuestions: roomSettings.questionsPerSegment,
            difficulty: roomSettings.difficulty,
            provider: roomSettings.questionProvider || 'minimax',
            questionTypeMix: typeMix
          }
        })
      })

      const data = await response.json()
      setIsGeneratingFromText(false)

      if (data.success && data.questions && data.questions.length > 0) {
        const markedQuestions = data.questions.map(q => ({
          ...q,
          timeToAnswer: roomSettings.timeToAnswer,
          points: roomSettings.points,
          segmentIndex: currentSegment
        }))
        setPendingTextQuestions(markedQuestions)
        return { success: true, questions: markedQuestions }
      } else {
        return { success: false, error: data.error || 'Failed to generate questions' }
      }
    } catch (error) {
      setIsGeneratingFromText(false)
      console.error('Text to questions error:', error)
      return { success: false, error: error.message }
    }
  }, [token, roomSettings, currentSegment])

  return {
    isGeneratingQuestions,
    isGeneratingFromText,
    pendingQuestions,
    setPendingQuestions,
    pendingTextQuestions,
    setPendingTextQuestions,
    generateQuestionsFromText,
    handleTextToQuestionsGenerate
  }
}
