import { useState, useRef, useCallback, useEffect } from 'react'

export function useRoomTimers(roomSettings, onSegmentComplete) {
  const [segmentTimeLeft, setSegmentTimeLeft] = useState(0)
  const [isSegmentPaused, setIsSegmentPaused] = useState(false)
  
  const [activeQuestion, setActiveQuestion] = useState(null)
  const [questionTimeLeft, setQuestionTimeLeft] = useState(0)
  
  const segmentTimerRef = useRef(null)
  const questionTimerRef = useRef(null)

  // Question Timer
  const startQuestionTimer = useCallback((question) => {
    const timeToAnswer = question.timeToAnswer || roomSettings.timeToAnswer || 30

    if (questionTimerRef.current) {
      clearInterval(questionTimerRef.current)
      questionTimerRef.current = null
    }

    setActiveQuestion(question)
    setQuestionTimeLeft(timeToAnswer)

    questionTimerRef.current = setInterval(() => {
      setQuestionTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(questionTimerRef.current)
          questionTimerRef.current = null
          setActiveQuestion(null)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [roomSettings.timeToAnswer])

  const clearQuestionTimer = useCallback(() => {
    if (questionTimerRef.current) {
      clearInterval(questionTimerRef.current)
      questionTimerRef.current = null
    }
    setActiveQuestion(null)
    setQuestionTimeLeft(0)
  }, [])

  // Segment Timer
  const startSegmentTimer = useCallback((startFromSeconds = null) => {
    if (segmentTimerRef.current) {
      clearInterval(segmentTimerRef.current)
      segmentTimerRef.current = null
    }

    if (!roomSettings || roomSettings.segmentTime <= 0) return

    const totalSeconds = startFromSeconds !== null ? startFromSeconds : (roomSettings.segmentTime * 60)
    
    let secondsLeft = totalSeconds
    setSegmentTimeLeft(secondsLeft)
    setIsSegmentPaused(false)

    segmentTimerRef.current = setInterval(() => {
      secondsLeft -= 1
      setSegmentTimeLeft(secondsLeft)

      if (secondsLeft <= 0) {
        clearInterval(segmentTimerRef.current)
        segmentTimerRef.current = null
        if (onSegmentComplete) onSegmentComplete()
      }
    }, 1000)
  }, [roomSettings, onSegmentComplete])

  const pauseSegmentTimer = useCallback(() => {
    if (segmentTimerRef.current) {
      clearInterval(segmentTimerRef.current)
      segmentTimerRef.current = null
    }
    setIsSegmentPaused(true)
  }, [])

  const resumeSegmentTimer = useCallback(() => {
    if (isSegmentPaused && segmentTimeLeft > 0) {
      startSegmentTimer(segmentTimeLeft)
    }
  }, [isSegmentPaused, segmentTimeLeft, startSegmentTimer])

  const clearSegmentTimer = useCallback(() => {
    if (segmentTimerRef.current) {
      clearInterval(segmentTimerRef.current)
      segmentTimerRef.current = null
    }
    setSegmentTimeLeft(0)
    setIsSegmentPaused(false)
  }, [])
  
  // Cleanup
  useEffect(() => {
    return () => {
      if (segmentTimerRef.current) clearInterval(segmentTimerRef.current)
      if (questionTimerRef.current) clearInterval(questionTimerRef.current)
    }
  }, [])

  return {
    segmentTimeLeft,
    isSegmentPaused,
    startSegmentTimer,
    pauseSegmentTimer,
    resumeSegmentTimer,
    clearSegmentTimer,
    
    activeQuestion,
    questionTimeLeft,
    startQuestionTimer,
    clearQuestionTimer
  }
}
