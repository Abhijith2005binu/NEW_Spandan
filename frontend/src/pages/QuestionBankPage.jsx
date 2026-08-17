import React, { useEffect, useState, useCallback } from 'react'
import useAuthStore from '../stores/authStore'
import useQuestionBankStore from '../stores/questionBankStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'

function QuestionBankPage() {
  const { user } = useAuthStore()
  const {
    items, total, topics, folders, isLoading, error,
    fetchList, fetchTopics, fetchFolders, importByRoomCode, prepareImport, stageForImport, archive, clearError
  } = useQuestionBankStore()

  const [search, setSearch] = useState('')
  const [topic, setTopic] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [folderId, setFolderId] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState(null)
  const [importPromptQ, setImportPromptQ] = useState(null)
  const [importCodeInput, setImportCodeInput] = useState('')

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2500)
  }

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      fetchList({ search, topic, difficulty, folderId })
    }, 250)
    return () => clearTimeout(t)
  }, [search, topic, difficulty, folderId, fetchList])

  useEffect(() => {
    fetchTopics()
    fetchFolders()
  }, [fetchTopics, fetchFolders])

  const confirmImport = async (bankQ, roomCode) => {
    setImportPromptQ(null)
    setImportCodeInput('')
    setBusyId(bankQ._id)
    try {
      const res = await importByRoomCode(bankQ._id, roomCode)
      showToast(`✅ Imported to room: ${res.roomName}`, 'success')
    } catch (e) {
      showToast('⚠️ Could not import question. Check room code.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleArchive = useCallback(async (q) => {
    if (!window.confirm('Archive this question?')) return
    try {
      await archive(q._id)
      showToast('✅ Archived', 'success')
    } catch (e) {
      showToast('⚠️ Could not archive question', 'error')
    }
  }, [archive])


  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif' }}>
      <Sidebar user={user} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '240px' }}>
        <header style={{ background: 'var(--header-bg)', color: 'white', padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>
                📚 Question Bank
              </h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>
                Save questions once. Reuse them in any room.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown user={user} />
            </div>
          </div>
        </header>

        <div style={{ padding: '32px', flex: 1 }}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b',
                          padding: '12px 16px', borderRadius: 8, marginBottom: 16,
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>⚠️ {error}</span>
              <button onClick={clearError} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}>×</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="🔍 Search questions, tags, topics..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: '1 1 280px', minWidth: 220, padding: '10px 14px',
                       background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                       color: 'var(--text-primary)', borderRadius: 8, fontSize: 14 }}
            />
            <select value={topic} onChange={(e) => setTopic(e.target.value)}
              style={{ padding: '10px 14px', background: 'var(--bg-card)',
                       border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                       borderRadius: 8, fontSize: 14, minWidth: 160 }}>
              <option value="">All topics</option>
              {topics.map(t => <option key={t.name} value={t.name}>🏷️ {t.name} ({t.count})</option>)}
            </select>
            <select value={folderId} onChange={(e) => setFolderId(e.target.value)}
              style={{ padding: '10px 14px', background: 'var(--bg-card)',
                       border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                       borderRadius: 8, fontSize: 14, minWidth: 160 }}>
              <option value="">📁 All folders</option>
              {folders.map(f => (
                <option key={f._id} value={f._id}>
                  📁 {f.name} ({f.roomCode}){f.questionCount !== undefined ? ` • ${f.questionCount} Qs` : ''}
                </option>
              ))}
            </select>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}
              style={{ padding: '10px 14px', background: 'var(--bg-card)',
                       border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                       borderRadius: 8, fontSize: 14 }}>
              <option value="">Any difficulty</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              {total} question{total !== 1 ? 's' : ''}
            </span>
          </div>

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-secondary)',
                          background: 'var(--bg-card)', borderRadius: 16,
                          border: '1px dashed var(--border-color)' }}>
              <div style={{ fontSize: 56, marginBottom: 12 }}>📭</div>
              <h3 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Your bank is empty</h3>
              <p style={{ fontSize: 14, maxWidth: 460, margin: '0 auto' }}>
                Open any room, generate or write questions, then click
                <strong> 💾 Save to Bank</strong> on each one to build your library.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {items.map((q) => (
                <div key={q._id} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                  borderRadius: 12, padding: 18, display: 'flex', gap: 16
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11,
                                     fontWeight: 700, background: '#3b82f620', color: '#60a5fa' }}>
                        {q.type}
                      </span>
                      <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11,
                                     fontWeight: 700,
                                     background: q.difficulty === 'easy' ? '#10b98120' :
                                                 q.difficulty === 'hard' ? '#ef444420' : '#f59e0b20',
                                     color: q.difficulty === 'easy' ? '#34d399' :
                                            q.difficulty === 'hard' ? '#f87171' : '#fbbf24' }}>
                        {q.difficulty}
                      </span>
                      {q.folderId && (
                        <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11,
                                       fontWeight: 700, background: '#0ea5e920', color: '#38bdf8' }}>
                          📁 {typeof q.folderId === 'object' ? `${q.folderId.name} (${q.folderId.roomCode})` : 'Room Folder'}
                        </span>
                      )}
                      {q.topic && (
                        <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11,
                                      fontWeight: 700, background: '#8b5cf620', color: '#a78bfa' }}>
                          🏷️ {q.topic}
                        </span>
                      )}
                      <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11,
                                      fontWeight: 700, background: '#64748b20', color: '#94a3b8' }}>
                        🤖 {q.provenance?.origin || 'manual'}
                      </span>
                      {(q.tags || []).map(t => (
                        <span key={t} style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11,
                                              fontWeight: 600, background: '#ec489920', color: '#f472b6' }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                    <div style={{ color: 'var(--text-primary)', fontSize: 15,
                                  marginBottom: 8, lineHeight: 1.5, fontWeight: 500 }}>
                      {q.questionText || q.question}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>
                      {(q.options || []).filter(o => o.isCorrect).map(o => o.text).join(' • ') || <em>No correct answer marked</em>}
                    </div>
                    
                    {/* Provenance & Usage Details */}
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 16, borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
                      {q.provenance?.aiProvider && (
                        <span><strong>Provider:</strong> {q.provenance.aiProvider}</span>
                      )}
                      {q.provenance?.editedBeforeApproval !== undefined && (
                        <span><strong>Edited:</strong> {q.provenance.editedBeforeApproval ? 'Yes' : 'No'}</span>
                      )}
                      <span>
                        <strong>Times Used:</strong> {q.usageHistory?.length || 0}
                      </span>
                      <span>
                        <strong>Avg Correct:</strong> {q.usageHistory?.length ? (q.usageHistory.reduce((a, c) => a + (c.correctRate || 0), 0) / q.usageHistory.length * 100).toFixed(1) + '%' : 'N/A'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 130 }}>
                    <button
                      onClick={() => setImportPromptQ(q)}
                      disabled={busyId === q._id}
                      title="Import this question to an active room using its code"
                      style={{
                        padding: '10px 14px', background: busyId === q._id ? '#94a3b8' : '#3b82f6',
                        color: 'white', border: 'none', borderRadius: 8, fontWeight: 700,
                        cursor: busyId === q._id ? 'wait' : 'pointer', fontSize: 13,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6
                      }}
                    >
                      {busyId === q._id ? '⏳' : '📥 Import to Room'}
                    </button>
                    <button
                      onClick={() => handleArchive(q)}
                      style={{
                        padding: '8px 14px', background: 'transparent',
                        color: 'var(--text-secondary)', border: '1px solid var(--border-color)',
                        borderRadius: 8, fontWeight: 600,
                        cursor: 'pointer', fontSize: 12
                      }}
                    >
                      🗑️ Archive
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {importPromptQ && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ background: 'var(--bg-card)', padding: 24, borderRadius: 12, width: 320, boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 16px', color: 'var(--text-primary)' }}>Import Question</h3>
            <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-secondary)' }}>Enter the Room Code of your active room:</p>
            <input 
              autoFocus
              type="text" 
              value={importCodeInput} 
              onChange={e => setImportCodeInput(e.target.value.toUpperCase())}
              placeholder="e.g. 7JW5K4"
              style={{ width: '100%', padding: '10px 14px', marginBottom: 16,
                       background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                       color: 'var(--text-primary)', borderRadius: 8, fontSize: 16, boxSizing: 'border-box',
                       fontFamily: 'monospace' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button 
                onClick={() => { setImportPromptQ(null); setImportCodeInput('') }}
                style={{ padding: '8px 16px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}>
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (importCodeInput) {
                    confirmImport(importPromptQ, importCodeInput)
                  }
                }}
                disabled={!importCodeInput}
                style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, opacity: !importCodeInput ? 0.5 : 1 }}>
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: toast.type === 'success' ? '#10b981' : '#ef4444',
          color: 'white', padding: '14px 22px', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)', fontWeight: 600, zIndex: 200,
          maxWidth: 420, animation: 'slideIn 0.2s ease'
        }}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

export default QuestionBankPage