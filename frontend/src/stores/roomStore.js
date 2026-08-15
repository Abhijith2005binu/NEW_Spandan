import { create } from 'zustand'
import { roomApi } from '../lib/api.js'

export const useRoomStore = create((set, get) => ({
  rooms: [],
  activeRooms: [],
  currentRoom: null,
  isLoading: false,
  error: null,

  setAuthToken: (token) => {
    // Deprecated, no longer needed as roomApi handles auth automatically
  },

  fetchRooms: async () => {
    set({ isLoading: true, error: null })
    try {
      const data = await roomApi.getAll()
      set({ rooms: data.rooms || [], isLoading: false })
    } catch (error) {
      set({ error: error.message, isLoading: false })
    }
  },

  fetchStudentRoomHistory: async () => {
    set({ isLoading: true, error: null })
    try {
      const data = await roomApi.getStudentRoomHistory()
      set({ rooms: data.rooms || [], isLoading: false })
    } catch (error) {
      set({ error: error.message, isLoading: false })
    }
  },

  fetchActiveRooms: async () => {
    set({ isLoading: true, error: null })
    try {
      const data = await roomApi.getActiveRoomsByStudent()
      set({ activeRooms: data.rooms || [], isLoading: false })
    } catch (error) {
      set({ error: error.message, isLoading: false })
    }
  },

  createRoom: async (name, settings = {}) => {
    set({ isLoading: true, error: null })
    try {
      const data = await roomApi.create(name, settings)

      const { rooms } = get()
      set({ 
        rooms: [data.room, ...rooms],
        currentRoom: data.room,
        isLoading: false 
      })

      return data.room
    } catch (error) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  getRoom: async (roomId) => {
    set({ isLoading: true, error: null })
    try {
      const data = await roomApi.getById(roomId)
      set({ currentRoom: data.room, isLoading: false })
      return data.room
    } catch (error) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  joinRoomByCode: async (code) => {
    set({ isLoading: true, error: null })
    try {
      const data = await roomApi.joinByCode(code)
      set({ currentRoom: data.room, isLoading: false })
      return data.room
    } catch (error) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  updateRoom: async (roomId, updates) => {
    try {
      const data = await roomApi.update(roomId, updates)
      
      const { rooms, currentRoom } = get()
      set({
        rooms: rooms.map(r => r._id === roomId ? data.room : r),
        currentRoom: currentRoom?._id === roomId ? data.room : currentRoom
      })

      return data.room
    } catch (error) {
      set({ error: error.message })
      throw error
    }
  },

  deleteRoom: async (roomId) => {
    try {
      await roomApi.delete(roomId)

      const { rooms, currentRoom } = get()
      set({
        rooms: rooms.filter(r => r._id !== roomId),
        currentRoom: currentRoom?._id === roomId ? null : currentRoom
      })
    } catch (error) {
      set({ error: error.message })
      throw error
    }
  },

  clearError: () => set({ error: null })
}))

export default useRoomStore