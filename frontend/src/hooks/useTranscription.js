import { useState, useRef, useCallback } from 'react'
import { transcribeAudio, convertWebMToWav } from '../services/serverTranscriptionService'

export function useTranscription(room) {
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [segmentTranscript, setSegmentTranscript] = useState('')
  const [modelStatus, setModelStatus] = useState('Ready')

  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const streamRef = useRef(null)
  const transcriptionIntervalRef = useRef(null)
  const finalTranscriptRef = useRef('')
  const accumulatedTranscriptRef = useRef('')
  const segmentTranscriptRef = useRef('')
  const recordingActiveRef = useRef(false)
  const selectedMimeTypeRef = useRef('audio/webm')
  const mediaRecorderStopPromiseRef = useRef(null)

  const transcriptionQueueRef = useRef([])
  const nextSequenceRef = useRef(0)
  const pendingSequenceRef = useRef(0)
  const isProcessingQueueRef = useRef(false)

  const processTranscriptionQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) return
    isProcessingQueueRef.current = true

    while (transcriptionQueueRef.current.length > 0) {
      const nextItem = transcriptionQueueRef.current.find(item => item.sequence === pendingSequenceRef.current)
      if (!nextItem) break

      transcriptionQueueRef.current = transcriptionQueueRef.current.filter(item => item !== nextItem)

      if (nextItem.text && nextItem.text.trim()) {
        const text = nextItem.text.trim()
        finalTranscriptRef.current += text + ' '
        accumulatedTranscriptRef.current += text + ' '
        setTranscript(finalTranscriptRef.current)
        segmentTranscriptRef.current += ' ' + text
        setSegmentTranscript(segmentTranscriptRef.current)
      }

      pendingSequenceRef.current++
    }

    isProcessingQueueRef.current = false
  }, [])

  const addToTranscriptionQueue = useCallback((sequence, text) => {
    transcriptionQueueRef.current.push({ sequence, text })
    transcriptionQueueRef.current.sort((a, b) => a.sequence - b.sequence)
    processTranscriptionQueue()
  }, [processTranscriptionQueue])

  const sendForTranscription = useCallback(async (audioBlob, sequence) => {
    if (!audioBlob || audioBlob.size < 5000) {
      addToTranscriptionQueue(sequence, '')
      return
    }

    try {
      const wavBlob = await convertWebMToWav(audioBlob)
      if (!wavBlob) {
        addToTranscriptionQueue(sequence, '')
        return
      }

      const result = await transcribeAudio(wavBlob)
      addToTranscriptionQueue(sequence, result.text || '')
    } catch (error) {
      console.error(`[TRANSCRIPTION] Error for sequence ${sequence}:`, error.message)
      addToTranscriptionQueue(sequence, '')
    }
  }, [addToTranscriptionQueue])

  const startTranscriptionWindow = useCallback(() => {
    if (!recordingActiveRef.current || !streamRef.current) return

    const sequence = nextSequenceRef.current++
    const chunks = []
    const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType: selectedMimeTypeRef.current })
    mediaRecorderRef.current = mediaRecorder

    mediaRecorderStopPromiseRef.current = new Promise((resolve) => {
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      mediaRecorder.onerror = (error) => {
        console.error('MediaRecorder error:', error)
        setModelStatus('Recording error')
      }
      mediaRecorder.onstop = async () => {
        if (transcriptionIntervalRef.current) {
          clearTimeout(transcriptionIntervalRef.current)
          transcriptionIntervalRef.current = null
        }

        const audioBlob = new Blob(chunks, { type: mediaRecorder.mimeType || selectedMimeTypeRef.current })
        await sendForTranscription(audioBlob, sequence)
        resolve()

        if (recordingActiveRef.current) {
          startTranscriptionWindow()
        }
      }
    })

    mediaRecorder.start()
    transcriptionIntervalRef.current = setTimeout(() => {
      if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop()
      }
    }, 10000)
  }, [sendForTranscription])

  const startRecording = async ({ resetSegment = true } = {}, setCurrentSegment) => {
    if (recordingActiveRef.current) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      let selectedMimeType = 'audio/ogg'
      const possibleTypes = ['audio/ogg;codecs=opus', 'audio/ogg', 'audio/webm;codecs=opus', 'audio/webm']
      for (const mimeType of possibleTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType
          break
        }
      }
      audioChunksRef.current = []
      selectedMimeTypeRef.current = selectedMimeType

      setTranscript('')
      finalTranscriptRef.current = ''
      accumulatedTranscriptRef.current = ''
      if (setCurrentSegment) {
        setCurrentSegment(prev => resetSegment ? 1 : prev + 1)
      }
      setSegmentTranscript('')
      segmentTranscriptRef.current = ''

      transcriptionQueueRef.current = []
      nextSequenceRef.current = 0
      pendingSequenceRef.current = 0
      isProcessingQueueRef.current = false

      recordingActiveRef.current = true
      setIsRecording(true)

      startTranscriptionWindow()
    } catch (err) {
      console.error('Error starting recording:', err)
      setModelStatus('Microphone Error')
    }
  }

  const stopRecording = async () => {
    if (!recordingActiveRef.current) return

    recordingActiveRef.current = false
    setIsRecording(false)

    if (transcriptionIntervalRef.current) {
      clearTimeout(transcriptionIntervalRef.current)
      transcriptionIntervalRef.current = null
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    
    if (mediaRecorderStopPromiseRef.current) {
      await mediaRecorderStopPromiseRef.current
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }

  return {
    isRecording,
    transcript,
    setTranscript,
    segmentTranscript,
    setSegmentTranscript,
    segmentTranscriptRef,
    finalTranscriptRef,
    accumulatedTranscriptRef,
    modelStatus,
    setModelStatus,
    startRecording,
    stopRecording
  }
}
