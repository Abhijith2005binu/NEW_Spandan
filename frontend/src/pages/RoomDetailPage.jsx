import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useRoomStore from '../stores/roomStore'
import useQuestionBankStore from '../stores/questionBankStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import QuestionApprovalPopup from '../components/QuestionApprovalPopup'
import TextQuestionApprovalPopup from '../components/TextQuestionApprovalPopup'
import CreateQuestionOverlay from '../components/CreateQuestionOverlay'
import TextToQuestionsPopup from '../components/TextToQuestionsPopup'
import RoomSettingsModal from '../components/RoomSettingsModal'
import Leaderboard from '../components/Leaderboard'
import { saveTranscript } from '../services/transcriptService'
import { transcribeAudio, getTranscriptionStatus, convertWebMToWav } from '../services/serverTranscriptionService'
import { API_URL } from '../config.js'
import { useTranscription } from '../hooks/useTranscription'
import { useRoomTimers } from '../hooks/useRoomTimers'
import { useQuestionGeneration } from '../hooks/useQuestionGeneration'

function RoomDetailPage() {


  const [room, setRoom] = useState(null)

  const [roomSettings, setRoomSettings] = useState({
    segmentTime: 2, questionsPerSegment: 2, difficulty: 'medium',
    questionProvider: 'minimax', questionTypeMix: { MCQ: 0, TF: 100, MSQ: 0 },
    timeToAnswer: 30, points: 100
  })
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const { socket, isConnected, joinRoom, leaveRoom } = useSocketStore()
  const { getRoom, updateRoom, setAuthToken } = useRoomStore()
  const { saveFromRoomQuestion, getStagedQueue, clearStagedQueue, isAlreadySaved, fetchSavedRoomQuestionIds } = useQuestionBankStore()

  // Track questions saved in this session to prevent duplicate bank entries
  // removed savedQuestionKeys
  const [savingIds, setSavingIds] = useState(() => new Set())

  const questionFingerprint = (q) =>
    `${q.type}::${(q.question || '').trim().toLowerCase().slice(0, 200)}`

  const [bankToast, setBankToast] = useState(null)
  const [pendingBankCount, setPendingBankCount] = useState(0)

  const showBankToast = useCallback((message, type = 'success') => {
    setBankToast({ message, type })
    setTimeout(() => setBankToast(null), 2500)
  }, [])

  // ONE-CLICK IMPORT: pick up staged questions on mount, offer to inject
  useEffect(() => {
    const staged = getStagedQueue()
    if (staged.length > 0) setPendingBankCount(staged.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])



  const handleDismissBankImport = useCallback(() => {
    clearStagedQueue()
    setPendingBankCount(0)
  }, [clearStagedQueue])

  // ONE-CLICK SAVE: turn a generated question into a bank entry.
  // Guards against double-clicks, missing fields, and duplicate saves in one session.
  const handleSaveToBank = useCallback(async (question) => {
    if (!question || !question._id) {
      showBankToast('Cannot save: question is missing an id', 'error')
      return
    }
    const fp = questionFingerprint(question)
    if (isAlreadySaved(question._id)) {
      showBankToast('Already saved to bank', 'success')
      return
    }
    if (savingIds.has(question._id)) return // already in flight
    setSavingIds(prev => new Set(prev).add(question._id))
    try {
      const result = await saveFromRoomQuestion(
        question,
        room?._id,
        {
          topic: roomSettings?.topic || '',
          difficulty: roomSettings?.difficulty || 'medium',
          tags: []
        }
      )
      if (result && result.ok) {
        // sync handled by store
        showBankToast('Saved to bank', 'success')
      } else {
        showBankToast('Save failed: ' + (result && result.error || 'unknown'), 'error')
      }
    } catch (e) {
      showBankToast('Save failed: ' + (e.message || 'unknown'), 'error')
    } finally {
      setSavingIds(prev => {
        const next = new Set(prev)
        next.delete(question._id)
        return next
      })
    }
  }, [saveFromRoomQuestion, room, roomSettings, showBankToast, isAlreadySaved, savingIds])


  const handleAcceptBankImport = useCallback(() => {
    const staged = getStagedQueue()
    if (!staged.length || !room) return
    // Mark each with metadata, give them fresh _ids so they fit the room
    const imported = staged.map((q, i) => ({
      ...q,
      _id: q._id || q.sourceBankId || `bank-${Date.now()}-${i}`,
      timeToAnswer: q.timeToAnswer || roomSettings.timeToAnswer || 30,
      points: q.points || roomSettings.points || 100,
      segmentIndex: q.segmentIndex ?? 0,
      status: 'approved',
      source: 'bank'
    }))
    setGeneratedQuestions(prev => [...imported, ...prev])
    clearStagedQueue()
    setPendingBankCount(0)
    showBankToast(`📥 Imported ${imported.length} question${imported.length !== 1 ? 's' : ''} from bank`)
  }, [getStagedQueue, clearStagedQueue, room, roomSettings, showBankToast])
  const [isLoading, setIsLoading] = useState(true)
  const [isRoomJoined, setIsRoomJoined] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const settingsRef = useRef(null)
  const transcriptRef = useRef(null)

  

  const [currentSegment, setCurrentSegment] = useState(0)
  const [answerCounts, setAnswerCounts] = useState({}) 
  
  const {
    isRecording, transcript, setTranscript, segmentTranscript, setSegmentTranscript,
    segmentTranscriptRef, modelStatus, setModelStatus, startRecording, stopRecording
  } = useTranscription(room, currentSegment)

  const [isPendingReview, setIsPendingReview] = useState(false)
  const [generateQEnabled, setGenerateQEnabled] = useState(true) 
  
  


  const handleSegmentComplete = async () => {
    await stopRecording()
    setIsPendingReview(true)
    setGenerateQEnabled(false)
    const textToUse = segmentTranscriptRef.current.trim() || transcript.trim()

    if (!textToUse || textToUse.length < 50) {
      window.alert('Transcription too short. Please speak more or trigger manually after starting next segment.')
      setIsPendingReview(false)
      setGenerateQEnabled(true)
      startRecording({ resetSegment: false }, setCurrentSegment)
      return
    }

    try {
      await saveTranscript(room?._id, currentSegment, textToUse, roomSettings.segmentTime * 60)
    } catch (err) {
      console.error(err)
      window.alert('Transcript could not be saved.')
      setGenerateQEnabled(true)
      return
    }

    try {
      const questions = await generateQuestionsFromText(textToUse, currentSegment)
      if (questions && questions.length > 0) {
        setPendingQuestions(questions)
        setShowQuestionPopup(true)
        setIsPopupOpen(true)
      }
    } catch (error) {
      try {
        const questions = await generateQuestionsFromText(textToUse, currentSegment)
        if (questions && questions.length > 0) {
          setPendingQuestions(questions)
          setShowQuestionPopup(true)
          setIsPopupOpen(true)
        }
      } catch (retryError) {
        window.alert('Failed to generate questions after retry. You can use the manual "Generate Q" button.')
        setGenerateQEnabled(true)
      }
    }
  }

  const {
    segmentTimeLeft, isSegmentPaused, startSegmentTimer, pauseSegmentTimer,
    resumeSegmentTimer, clearSegmentTimer, activeQuestion, questionTimeLeft,
    startQuestionTimer, clearQuestionTimer
  } = useRoomTimers(roomSettings, handleSegmentComplete)

  const {
    isGeneratingQuestions, isGeneratingFromText, pendingQuestions, setPendingQuestions,
    pendingTextQuestions, setPendingTextQuestions, generateQuestionsFromText,
    handleTextToQuestionsGenerate: baseHandleTextToQuestionsGenerate
  } = useQuestionGeneration(token, roomSettings, currentSegment)


  const handleTextToQuestionsGenerate = async (text, mode) => {
    setShowTextToQuestions(false)
    setShowGeneratingPopup(true)
    const result = await baseHandleTextToQuestionsGenerate(text, mode)
    setShowGeneratingPopup(false)
    if (result.success) {
      setShowTextQuestionPopup(true)
    } else {
      window.alert(result.error)
    }
  }

  const [showQuestionPopup, setShowQuestionPopup] = useState(false)
  const [isPopupOpen, setIsPopupOpen] = useState(false)
  const [showCreateQuestion, setShowCreateQuestion] = useState(false)
  const [showTextToQuestions, setShowTextToQuestions] = useState(false)
  const [showTextQuestionPopup, setShowTextQuestionPopup] = useState(false)
  const [showGeneratingPopup, setShowGeneratingPopup] = useState(false)
  const [generatedQuestions, setGeneratedQuestions] = useState([])
  const [totalParticipants, setTotalParticipants] = useState(0)

  
  
  useEffect(() => {
    if (token) {
      setAuthToken(token)
      loadRoom()
      checkServerTranscription()
    }

    return () => {
      if (room?.code) {
        leaveRoom(room.code, user?._id)
      }
      stopRecording()
      
    }
  }, [roomId])

  useEffect(() => {
    if (room?.code && user?._id) {
      joinRoom(room.code, user._id)
    }
  }, [room?.code, user?._id])

  // Listen for room:joined event
  useEffect(() => {
    if (!socket) return

    const handleRoomJoined = (data) => {
      console.log('Teacher joined room successfully')
      setIsRoomJoined(true)
      if (data?.participants !== undefined) setTotalParticipants(data.participants)
    }

    const handleRoomLeft = (data) => {
      if (data?.participants !== undefined) setTotalParticipants(data.participants)
    }

    socket.on('room:joined', handleRoomJoined)
    socket.on('room:left', handleRoomLeft)

    return () => {
      socket.off('room:joined', handleRoomJoined)
      socket.off('room:left', handleRoomLeft)
    }
  }, [socket])

  // Listen for response:new events to update answer counts
  useEffect(() => {
    if (!socket) return
    const handleNewResponse = (data) => {
      console.log('[DEBUG] New response received:', data)
      setAnswerCounts(prev => ({
        ...prev,
        [data.questionId]: (prev[data.questionId] || 0) + 1
      }))
    }
    socket.on('response:new', handleNewResponse)
    return () => socket.off('response:new', handleNewResponse)
  }, [socket])

  // Auto-scroll transcription
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [transcript])

  // Close settings dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setShowSettings(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])



  // Check server transcription status on mount
  
  // Check server transcription status on mount
  const checkServerTranscription = async () => {
    try {
      const status = await getTranscriptionStatus()
      if (status.status === 'ready') {
        setModelStatus('Server Ready')
      } else {
        setModelStatus('Server Loading...')
      }
    } catch (error) {
      console.error('Failed to check transcription status:', error)
      setModelStatus('Server Error')
    }
  }

const loadRoom = async () => {
    setIsLoading(true)
    try {
      const roomData = await getRoom(roomId)
      setRoom(roomData)
      // Apply room settings if they exist
      if (roomData.settings) {
        setRoomSettings(prev => ({
          ...prev,
          ...roomData.settings
        }))
      }
      // Load questions for this room from database
      loadQuestions(roomId)
      fetchSavedRoomQuestionIds(roomId)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const loadQuestions = async (rid) => {
    try {
      const response = await fetch(`${API_URL}/questions?roomId=${rid}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        if (data.questions) {
          setGeneratedQuestions(data.questions)
        }
      }
      // Also load answer counts
      const countsRes = await fetch(`${API_URL}/responses/counts/${rid}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (countsRes.ok) {
        const countsData = await countsRes.json()
        if (countsData.counts) {
          setAnswerCounts(countsData.counts)
        }
      }
    } catch (err) {
      console.error('Failed to load questions:', err)
    }
  }

  const handleEndRoom = async () => {
    if (room.endedAt) return

    try {
      const updated = await updateRoom(room._id, {
        isActive: false,
        endedAt: new Date()
      })
      setRoom(updated)
      navigate(`/teacher/room/${room._id}/results`)
    } catch (err) {
      setError(err.message)
    }
  }

  const copyRoomCode = () => {
    navigator.clipboard.writeText(room.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Process transcription queue in order
    // Add transcription result to queue
          

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const clearTranscript = () => {
    setTranscript('')
    
    setSegmentTranscript('')
    segmentTranscriptRef.current = ''
  }

  const handleManualGenerateQuestions = async () => {
    const textToUse = segmentTranscript.trim() || transcript
    if (!textToUse) {
      alert('No transcript available to generate questions from.')
      return
    }

    setIsGeneratingQuestions(true)
    setGenerateQEnabled(false)

    try {
      const questions = await generateQuestionsFromText(textToUse, currentSegment + 1)
      if (questions && questions.length > 0) {
        setPendingQuestions(questions)
        setShowQuestionPopup(true)
        setIsPopupOpen(true)
        setCurrentSegment(prev => prev + 1)
      }
    } catch (error) {
      console.error('Manual question generation failed:', error)
      alert('Failed to generate questions: ' + error.message)
      setGenerateQEnabled(true)
    }
    setIsGeneratingQuestions(false)
  }

  const handleApproveQuestion = async (question) => {
    try {
      const response = await fetch(`${API_URL}/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          roomId: room._id,
          type: question.type,
          question: question.question,
          options: question.options,
          explanation: question.explanation,
          segmentIndex: question.segmentIndex,
          timeToAnswer: question.timeToAnswer || roomSettings.timeToAnswer || 30,
          points: question.points || roomSettings.points || 100,
          status: 'approved'
        })
      })

      if (response.ok) {
        const data = await response.json()
        setGeneratedQuestions(prev => [data.question, ...prev])

        // Emit to students via socket
        if (socket && isConnected) {
          socket.emit('new_question', {
            roomCode: room.code,
            question: data.question
          })
        }
      }
    } catch (error) {
      console.error('Failed to save question:', error)
    }
  }

  const handleRejectQuestion = (question) => {
    console.log('Question rejected:', question.question)
  }

  // Handle approve from TextQuestionApprovalPopup (text-based questions)
  const handleTextQuestionApprove = async (question) => {
    try {
      const response = await fetch(`${API_URL}/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          roomId: room._id,
          type: question.type,
          question: question.question,
          options: question.options,
          explanation: question.explanation,
          segmentIndex: question.segmentIndex,
          timeToAnswer: question.timeToAnswer || roomSettings.timeToAnswer || 30,
          points: question.points || roomSettings.points || 100,
          status: 'approved'
        })
      })

      if (response.ok) {
        const data = await response.json()
        setGeneratedQuestions(prev => [data.question, ...prev])

        if (socket && isConnected) {
          socket.emit('new_question', {
            roomCode: room.code,
            question: data.question
          })
        }
      }
    } catch (error) {
      console.error('Failed to save text question:', error)
    }
  }

  const handleTextQuestionReject = (question) => {
    console.log('Text question rejected:', question.question)
  }

  const handleTextQuestionClose = () => {
    setShowTextQuestionPopup(false)
    setPendingTextQuestions([])
  }

  const handleCreateQuestion = async (questionData) => {
    try {
      const response = await fetch(`${API_URL}/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          roomId: room._id,
          type: questionData.type,
          question: questionData.question,
          options: questionData.options,
          timeToAnswer: questionData.timeToAnswer || roomSettings.timeToAnswer || 30,
          points: questionData.points || roomSettings.points || 100,
          status: 'approved',
          provenance: {
            origin: 'manual'
          }
        })
      })

      if (response.ok) {
        const data = await response.json()
        setGeneratedQuestions(prev => [data.question, ...prev])

        // Emit to socket for students to receive (include roomCode)
        console.log('Emitting new_question event:', { roomCode: room.code, question: data.question })
        console.log('Socket connected:', !!socket, 'isConnected:', isConnected, 'isRoomJoined:', isRoomJoined)
        if (socket && isConnected) {
          socket.emit('new_question', {
            roomCode: room.code,
            question: data.question
          })
          console.log('new_question event emitted successfully')
        } else {
          console.error('Socket not available or not connected:', { socket: !!socket, isConnected })
        }
      } else {
        const errorData = await response.json()
        console.error('Failed to save question:', errorData)
        alert('Failed to save question: ' + (errorData.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Failed to create question:', error)
      alert('Failed to create question')
    }
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <Sidebar user={user} />
        <div style={{ flex: 1, marginLeft: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: '4px solid var(--border-color)',
              borderTopColor: '#3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px'
            }} />
            <p style={{ color: 'var(--text-secondary)' }}>Loading room...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!room) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <Sidebar user={user} />
        <div style={{ flex: 1, marginLeft: '240px', padding: '32px' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '32px', textAlign: 'center' }}>
            <h2 style={{ color: 'var(--text-primary)' }}>{error || 'Room not found'}</h2>
            <button onClick={() => navigate('/teacher')} style={{
              marginTop: '16px',
              padding: '12px 24px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer'
            }}>
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  const isEnded = !!room.endedAt

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', width: '100vw', maxWidth: '100vw', overflowX: 'hidden' }}>
      <Sidebar user={user} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '240px', minWidth: 0, maxWidth: 'calc(100vw - 240px)', overflowX: 'hidden' }}>
        {/* Header */}
        <header style={{ background: 'var(--header-bg)', color: 'white', padding: '16px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>{room.name}</h1>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Content */}
        <div style={{ flex: 1, padding: '24px 32px', width: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#dc2626' }}>
              {error}
            </div>
          )}

          {/* Room Code Row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'var(--bg-card)',
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '20px'
          }}>
            <button onClick={() => navigate('/teacher')} style={{
              padding: '8px 12px',
              background: 'var(--nav-hover)',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '18px'
            }}>
              ←
            </button>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              padding: '8px 20px',
              border: '2px solid var(--border-color)',
              borderRadius: '10px'
            }}>
              <span style={{ fontSize: '28px', fontWeight: '700', color: '#1e40af', letterSpacing: '4px' }}>
                {room.code}
              </span>
              <button onClick={copyRoomCode} disabled={isEnded} style={{
                padding: '4px 12px',
                background: isEnded ? '#9ca3af' : (copied ? '#10b981' : '#3b82f6'),
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: isEnded ? 'not-allowed' : 'pointer'
              }}>
                {copied ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>

            <div style={{ flex: 1 }} />

            {/* Segment Timer Display */}
            {isRecording && (
              <div style={{
                padding: '8px 16px',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ fontSize: '14px', color: '#ef4444', fontWeight: '600' }}>
                  Segment {currentSegment}
                </span>
                <span style={{ fontSize: '20px', color: '#ef4444', fontWeight: '700' }}>
                  {formatTime(segmentTimeLeft)}
                </span>
              </div>
            )}

            {/* Question Timer Display - Shows when a question is active */}
            {activeQuestion && questionTimeLeft > 0 && (
              <div style={{
                padding: '8px 16px',
                background: questionTimeLeft <= 5 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.1)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                border: `2px solid ${questionTimeLeft <= 5 ? '#ef4444' : '#10b981'}`
              }}>
                <span style={{ fontSize: '14px', color: questionTimeLeft <= 5 ? '#ef4444' : '#10b981', fontWeight: '600' }}>
                  ⏱️ Answer
                </span>
                <span style={{
                  fontSize: '20px',
                  color: questionTimeLeft <= 5 ? '#ef4444' : '#10b981',
                  fontWeight: '700',
                  animation: questionTimeLeft <= 5 ? 'pulse 0.5s infinite' : 'none'
                }}>
                  {questionTimeLeft}s
                </span>
                {questionTimeLeft <= 5 && (
                  <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: '600' }}>
                    TIME!
                  </span>
                )}
              </div>
            )}
            {activeQuestion && questionTimeLeft === 0 && (
              <div style={{
                padding: '8px 16px',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                border: '2px solid #ef4444'
              }}>
                <span style={{ fontSize: '14px', color: '#ef4444', fontWeight: '600' }}>
                  ⏱️ Time's Up!
                </span>
              </div>
            )}

            {/* Paste & Generate Button */}
            {!isEnded && (
              <button
                onClick={() => setShowTextToQuestions(true)}
                style={{
                  padding: '8px 16px',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                📝 Paste & Generate
              </button>
            )}

            {/* Create Question Button */}
            {!isEnded && (
              <button
                onClick={() => setShowCreateQuestion(true)}
                style={{
                  padding: '8px 16px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                ✍️ Create Q
              </button>
            )}

            {/* Settings Dropdown */}
            <div style={{ position: 'relative' }} ref={settingsRef}>
              <button
                onClick={() => setShowSettings(true)}
                style={{
                  padding: '8px 16px',
                  background: 'var(--nav-hover)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                ⚙️ Settings
              </button>

              <RoomSettingsModal
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                settings={roomSettings}
                onSave={async (newSettings) => {
                  setRoomSettings(newSettings)
                  // Persist settings to backend
                  try {
                    await fetch(`${API_URL}/rooms/${room._id}`, {
                      method: 'PUT',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                      },
                      body: JSON.stringify({ settings: newSettings })
                    })
                  } catch (err) {
                    console.error('Failed to save room settings:', err)
                  }
                  setShowSettings(false)
                }}
              />
            </div>

            {/* End Room Button */}
            {!isEnded && (
              <button onClick={handleEndRoom} style={{
                padding: '8px 16px',
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer'
              }}>
                End Room
              </button>
            )}
          </div>

          {/* Microphone and Transcription Row - 30/70 Split */}
          <div style={{ display: 'flex', gap: '20px', height: '420px', marginBottom: '20px', flexWrap: 'wrap', overflowX: 'hidden' }}>
            {/* Microphone Card - 30% */}
            <div style={{
              flex: '1 1 calc(30% - 10px)',
              minWidth: '280px',
              maxWidth: '100%',
              background: 'var(--bg-card)',
              borderRadius: '16px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              boxSizing: 'border-box',
              overflow: 'hidden'
            }}>
              {/* Mic Button */}
              <button
                onClick={toggleRecording}
                disabled={isEnded}
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  background: isEnded
                    ? 'linear-gradient(135deg, #6b7280, #9ca3af)'
                    : (isRecording
                        ? 'linear-gradient(135deg, #dc2626, #ef4444)'
                        : 'linear-gradient(135deg, #10b981, #059669)'),
                  color: 'white',
                  border: 'none',
                  cursor: isEnded ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '32px',
                  boxShadow: isRecording
                    ? '0 0 30px rgba(239, 68, 68, 0.5)'
                    : '0 8px 25px rgba(16, 185, 129, 0.4)',
                  transform: isRecording ? 'scale(1.05)' : 'scale(1)',
                  transition: 'all 0.3s ease'
                }}
              >
                {isRecording ? (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                  </svg>
                ) : (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" x2="12" y1="19" y2="22"/>
                  </svg>
                )}
              </button>

              {/* Status Text */}
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: isRecording ? '#ef4444' : 'var(--text-primary)' }}>
                  {isRecording ? 'Recording...' : (false ? 'Recording...' : 'Start Recording')}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {modelStatus}
                </p>
              </div>

              {/* Live indicator */}
              {isRecording && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: '20px'
                }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'blink 1s infinite' }} />
                  <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: '500' }}>LIVE</span>
                </div>
              )}

              {/* Settings Labels Below Mic */}
              <div style={{
                width: '100%',
                background: 'var(--bg-primary)',
                borderRadius: '10px',
                padding: '10px',
                fontSize: '11px'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Provider:</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{roomSettings.questionProvider || 'minimax'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Time/Answer:</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{roomSettings.timeToAnswer}s</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Points:</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{roomSettings.points}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Segment Time:</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{roomSettings.segmentTime} min</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Questions/Segment:</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{roomSettings.questionsPerSegment}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Difficulty:</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: '600', textTransform: 'capitalize' }}>{roomSettings.difficulty}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Transcription Card - 70% */}
            <div style={{
              flex: '1 1 calc(70% - 10px)',
              minWidth: '300px',
              maxWidth: '100%',
              background: 'var(--bg-card)',
              borderRadius: '16px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
                paddingBottom: '12px',
                borderBottom: '1px solid var(--border-color)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>🎙️</span>
                  <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
                    Current Segment Transcription
                  </span>
                  {isRecording && (
                    <div style={{ padding: '2px 8px', background: '#fef2f2', borderRadius: '10px', fontSize: '10px', color: '#ef4444', fontWeight: '600' }}>
                      LIVE
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {transcript && (
                    <button onClick={clearTranscript} style={{
                      padding: '4px 12px',
                      background: 'transparent',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}>
                      ✕ Clear
                    </button>
                  )}
                  <button
                    onClick={handleManualGenerateQuestions}
                    disabled={isGeneratingQuestions || !transcript || !generateQEnabled}
                    style={{
                      padding: '4px 12px',
                      background: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: isGeneratingQuestions || !transcript || !generateQEnabled ? 'not-allowed' : 'pointer',
                      opacity: isGeneratingQuestions || !transcript || !generateQEnabled ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {isGeneratingQuestions ? '⏳ Generating...' : '🔄 Generate Q'}
                  </button>
                </div>
              </div>

              <div ref={transcriptRef} style={{
                flex: 1,
                fontSize: '15px',
                lineHeight: '1.8',
                color: transcript ? 'var(--text-primary)' : 'var(--text-secondary)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                overflowY: 'auto'
              }}>
                {transcript ? transcript : (
                  <span style={{ fontStyle: 'italic' }}>
                    Click the microphone to start real-time transcription.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Third Row - Session Questions (flex) + Leaderboard (flex) */}
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', width: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
            {/* Session Questions - flexible width */}
            <div style={{ flex: '1 1 calc(70% - 10px)', minWidth: '300px', maxWidth: '100%', background: 'var(--bg-card)', borderRadius: '16px', padding: '20px', boxSizing: 'border-box', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <span style={{ fontSize: '20px' }}>📝</span>
              <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
                Session Questions
              </span>
              {generatedQuestions.length > 0 && (
                <span style={{
                  padding: '2px 10px',
                  background: '#d1fae5',
                  color: '#059669',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: '600'
                }}>
                  {generatedQuestions.length}
                </span>
              )}
            </div>

            {generatedQuestions.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {generatedQuestions.map((q, index) => (
                  <div key={q._id || index} style={{
                    padding: '14px 16px',
                    background: 'var(--bg-primary)',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px'
                  }}>
                    <span style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: '#3b82f6',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: '600',
                      flexShrink: 0
                    }}>
                      {index + 1}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: '600',
                          background: q.type === 'MCQ' ? '#3b82f620' : q.type === 'TF' ? '#10b9820' : '#8b5cf620',
                          color: q.type === 'MCQ' ? '#3b82f6' : q.type === 'TF' ? '#10b982' : '#8b5cf6'
                        }}>
                          {q.type}
                        </span>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: '600',
                          background: '#fef3c7',
                          color: '#92400e'
                        }}>
                          {q.points || 100} pts
                        </span>
                      </div>
                      <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-primary)', lineHeight: '1.5', fontWeight: '500' }}>
                        {q.question}
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {(q.options || []).map((opt, optIdx) => {
                          const letter = String.fromCharCode(65 + optIdx)
                          return (
                            <div key={optIdx} style={{
                              padding: '8px 12px',
                              background: opt.isCorrect ? '#d1fae5' : 'var(--bg-secondary)',
                              border: `2px solid ${opt.isCorrect ? '#059669' : 'var(--border-color)'}`,
                              borderRadius: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              fontSize: '13px',
                              color: opt.isCorrect ? '#059669' : 'var(--text-primary)'
                            }}>
                              <span style={{
                                width: '22px',
                                height: '22px',
                                borderRadius: '50%',
                                background: opt.isCorrect ? '#059669' : 'var(--border-color)',
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px',
                                fontWeight: '700',
                                flexShrink: 0
                              }}>
                                {letter}
                              </span>
                              <span style={{ fontWeight: opt.isCorrect ? '600' : '400' }}>
                                {opt.text}
                              </span>
                              {opt.isCorrect && (
                                <span style={{ marginLeft: 'auto', fontSize: '12px' }}>✓</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', marginLeft: '8px' }}>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '600',
                        background: (answerCounts[q._id] || 0) > 0 ? '#d1fae5' : '#fef3c7',
                        color: (answerCounts[q._id] || 0) > 0 ? '#059669' : '#92400e'
                      }}>
                        {answerCounts[q._id] || 0}/{totalParticipants}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>answered</span>
                      <button
                        onClick={() => handleSaveToBank(q)}
                        disabled={savingIds.has(q._id) || isAlreadySaved(q._id)}
                        title="Save this question to your Question Bank"
                        style={{
                          marginTop: 6,
                          padding: '4px 10px',
                          background: (q.source === 'bank' || isAlreadySaved(q._id))
                            ? '#ecfdf5'
                            : (savingIds.has(q._id) ? '#94a3b8' : '#3b82f6'),
                          color: (q.source === 'bank' || isAlreadySaved(q._id))
                            ? '#047857'
                            : 'white',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: (savingIds.has(q._id) || isAlreadySaved(q._id))
                            ? 'default'
                            : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          opacity: savingIds.has(q._id) ? 0.7 : 1
                        }}
                      >
                        {savingIds.has(q._id)
                          ? 'Saving...'
                          : isAlreadySaved(q._id)
                          ? 'Saved'
                          : q.source === 'bank'
                          ? 'From Bank'
                          : 'Save to Bank'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                textAlign: 'center',
                padding: '32px',
                color: 'var(--text-secondary)',
                fontSize: '13px'
              }}>
                No questions generated yet. Start recording to auto-generate questions.
              </div>
            )}
            </div>
            {/* Leaderboard - flexible width */}
            <div style={{ flex: '1 1 calc(30% - 10px)', minWidth: '280px', maxWidth: '100%', background: 'var(--bg-card)', borderRadius: '16px', padding: '20px', boxSizing: 'border-box', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <span style={{ fontSize: '20px' }}>🏆</span>
                <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
                  Leaderboard
                </span>
              </div>
                            <Leaderboard roomId={room?._id} token={token} socket={socket} />
            </div>
          </div>

          {/* ONE-CLICK IMPORT BANNER — staged questions from Question Bank */}
          {pendingBankCount > 0 && (
            <div style={{
              marginTop: 20,
              background: 'linear-gradient(135deg, #3b82f615, #10b98115)',
              border: '1px solid #3b82f6',
              borderRadius: 12,
              padding: '14px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap'
            }}>
              <span style={{ fontSize: 20 }}>📚</span>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 14 }}>
                  {pendingBankCount} question{pendingBankCount !== 1 ? 's' : ''} from your Question Bank
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
                  Add them to this room in one click.
                </div>
              </div>
              <button
                onClick={handleAcceptBankImport}
                style={{
                  padding: '10px 18px', background: '#10b981', color: 'white',
                  border: 'none', borderRadius: 8, fontWeight: 700,
                  cursor: 'pointer', fontSize: 13,
                  display: 'inline-flex', alignItems: 'center', gap: 6
                }}
              >
                📥 Import {pendingBankCount}
              </button>
              <button
                onClick={handleDismissBankImport}
                style={{
                  padding: '8px 14px', background: 'transparent',
                  color: 'var(--text-secondary)', border: '1px solid var(--border-color)',
                  borderRadius: 8, fontWeight: 600,
                  cursor: 'pointer', fontSize: 12
                }}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Question Bank toast (save success / error) */}
          {bankToast && (
            <div style={{
              position: 'fixed', bottom: 24, right: 24,
              background: bankToast.type === 'success' ? '#10b981' : '#ef4444',
              color: 'white', padding: '14px 22px', borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)', fontWeight: 600, zIndex: 200,
              maxWidth: 420
            }}>
              {bankToast.message}
            </div>
          )}
        </div>
      </div>

      {/* Question Approval Popup */}
      {showQuestionPopup && pendingQuestions.length > 0 && (
        <QuestionApprovalPopup
          questions={pendingQuestions}
          onApprove={handleApproveQuestion}
          onReject={handleRejectQuestion}
          onComplete={() => {
            // All questions reviewed - close popup and resume for next segment
            setShowQuestionPopup(false)
            setIsPopupOpen(false)
            setPendingQuestions([])

            // Clear segment transcript for fresh start
            setSegmentTranscript('')
            segmentTranscriptRef.current = ''
            

            // Reset pending review flag
            setIsPendingReview(false)
            setGenerateQEnabled(true)

            // Reset segment timer
            setSegmentTimeLeft(roomSettings.segmentTime * 60)

            // Resume recording for next segment
            startRecording({ resetSegment: false })

            // Timer will auto-start via the useEffect since isPendingReview is now false
          }}
          onClose={() => {
            // Teacher manually closed popup - same as complete for next segment
            setShowQuestionPopup(false)
            setIsPopupOpen(false)
            setPendingQuestions([])
            setSegmentTranscript('')
            segmentTranscriptRef.current = ''
            
            setIsPendingReview(false)
            setGenerateQEnabled(true)
            setSegmentTimeLeft(roomSettings.segmentTime * 60)
            startRecording({ resetSegment: false })
          }}
        />
      )}

      {/* Create Question Overlay */}
      {showCreateQuestion && (
        <CreateQuestionOverlay
          isOpen={showCreateQuestion}
          onClose={() => setShowCreateQuestion(false)}
          onLaunch={handleCreateQuestion}
        />
      )}

      {/* Text to Questions Popup */}
      {showTextToQuestions && (
        <TextToQuestionsPopup
          isOpen={showTextToQuestions}
          onClose={() => setShowTextToQuestions(false)}
          onGenerate={handleTextToQuestionsGenerate}
          roomSettings={roomSettings}
          isGenerating={isGeneratingFromText}
        />
      )}

      {/* Generating Questions Popup */}
      {showGeneratingPopup && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 3000
        }}>
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: '20px',
            padding: '32px',
            textAlign: 'center',
            minWidth: '280px',
            boxShadow: '0 25px 80px rgba(0,0,0,0.4)',
            border: '1px solid var(--border-color)'
          }}>
            <div style={{
              fontSize: '48px',
              marginBottom: '16px',
              animation: 'spin 1s linear infinite'
            }}>⏳</div>
            <h3 style={{
              margin: '0 0 8px',
              color: 'var(--text-primary)',
              fontSize: '18px',
              fontWeight: '600'
            }}>Generating Questions...</h3>
            <p style={{
              margin: 0,
              color: 'var(--text-secondary)',
              fontSize: '14px'
            }}>Please wait while AI creates your questions</p>
          </div>
        </div>
      )}

      {/* Text Question Approval Popup (for pasted text questions) */}
      {showTextQuestionPopup && pendingTextQuestions.length > 0 && (
        <TextQuestionApprovalPopup
          questions={pendingTextQuestions}
          onApprove={handleTextQuestionApprove}
          onReject={handleTextQuestionReject}
          onClose={handleTextQuestionClose}
          onNext={handleTextQuestionClose}
          isLast={true}
        />
      )}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}</style>
    </div>
  )
}

export default RoomDetailPage
