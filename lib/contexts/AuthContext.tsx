"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { authApi } from "@/lib/api"

interface User {
  id?: string
  _id?: string
  name: string
  email?: string
  mobile: string
  role?: string
  state?: string
  district?: string
  village?: string
  farmSize?: string
  farmingType?: string
  primaryCrop?: string
  profilePhoto?: string
  preferences?: {
    language: string
    voiceEnabled: boolean
  }
  // The API returns a richer document than the fields listed above.
  [key: string]: any
}

interface LoginCredentials {
  mobile?: string
  email?: string
  password: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; message?: string }>
  register: (userData: any) => Promise<{ success: boolean; message?: string }>
  logout: () => void
  updateProfile: (profileData: Partial<User>) => Promise<{ success: boolean; message?: string }>
  checkAuth: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem("token")

      if (!token) {
        setUser(null)
        setLoading(false)
        return
      }

      // Show the cached user immediately so a refresh doesn't flash the login
      // screen, then confirm the token is still valid against the API.
      const cached = localStorage.getItem("user")
      if (cached) {
        try {
          setUser(JSON.parse(cached))
        } catch {
          localStorage.removeItem("user")
        }
      }

      const res = await authApi.getMe()
      if (res?.success && res.user) {
        localStorage.setItem("user", JSON.stringify(res.user))
        setUser(res.user as User)
      } else {
        throw new Error("Invalid session")
      }
    } catch (error) {
      console.error("Auth check failed:", error)
      localStorage.removeItem("user")
      localStorage.removeItem("token")
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const login = async (credentials: LoginCredentials) => {
    try {
      setLoading(true)

      const res = await authApi.login(credentials as any)
      if (!res?.success || !res.token) {
        throw new Error(res?.message || "Login failed")
      }

      // Store the token first — the axios interceptor reads it for getMe().
      localStorage.setItem("token", res.token)

      const me = await authApi.getMe()
      const loggedInUser = (me?.success && me.user ? me.user : res.user) as User | undefined
      if (!loggedInUser) {
        throw new Error("Failed to load user profile")
      }

      localStorage.setItem("user", JSON.stringify(loggedInUser))
      setUser(loggedInUser)

      toast.success("Login successful!")
      return { success: true }
    } catch (error: any) {
      localStorage.removeItem("token")
      localStorage.removeItem("user")
      setUser(null)
      const message =
        error?.response?.data?.message || error?.message || "Login failed"
      toast.error(message)
      return { success: false, message }
    } finally {
      setLoading(false)
    }
  }

  const register = async (userData: any) => {
    try {
      setLoading(true)

      const res = await authApi.register(userData)
      if (!res?.success || !res.token) {
        throw new Error(res?.message || "Registration failed")
      }

      localStorage.setItem("token", res.token)

      const me = await authApi.getMe()
      const newUser = (me?.success && me.user ? me.user : res.user) as User | undefined
      if (!newUser) {
        throw new Error("Failed to load user profile")
      }

      localStorage.setItem("user", JSON.stringify(newUser))
      setUser(newUser)

      toast.success("Registration successful!")
      return { success: true }
    } catch (error: any) {
      localStorage.removeItem("token")
      localStorage.removeItem("user")
      setUser(null)
      const message =
        error?.response?.data?.message || error?.message || "Registration failed"
      toast.error(message)
      return { success: false, message }
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("user")
    setUser(null)
    toast.success("Logged out successfully")
    router.push("/")
  }

  const updateProfile = async (profileData: Partial<User>) => {
    try {
      if (!user) return { success: false, message: "No user logged in" }
      
      const updatedUser = { ...user, ...profileData }
      localStorage.setItem("user", JSON.stringify(updatedUser))
      setUser(updatedUser)
      
      toast.success("Profile updated successfully")
      return { success: true }
    } catch (error) {
      const message = "Profile update failed"
      toast.error(message)
      return { success: false, message }
    }
  }

  const value: AuthContextType = {
    user,
    loading,
    login,
    register,
    logout,
    updateProfile,
    checkAuth,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}