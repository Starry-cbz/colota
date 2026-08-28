import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { DEFAULT_AUTH_CONFIG, AuthConfig } from "../../types/global"

// --- Mocks ---

let mockAuthConfig: AuthConfig = { ...DEFAULT_AUTH_CONFIG }
const mockSaveAuthConfig = jest.fn().mockResolvedValue(undefined)
const mockGetAuthConfig = jest.fn(() => Promise.resolve(mockAuthConfig))

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getAuthConfig: () => mockGetAuthConfig(),
    saveAuthConfig: (...args: any[]) => mockSaveAuthConfig(...args)
  }
}))

const mockRestartTracking = jest.fn().mockResolvedValue(undefined)

jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: require("../../types/global").DEFAULT_SETTINGS,
    restartTracking: mockRestartTracking
  })
}))

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      primary: "#0d9488",
      primaryDark: "#115E59",
      border: "#e5e7eb",
      text: "#000",
      textSecondary: "#6b7280",
      textLight: "#9ca3af",
      background: "#fff",
      info: "#3b82f6",
      success: "#22c55e",
      error: "#ef4444",
      card: "#fff",
      placeholder: "#9ca3af",
      textOnPrimary: "#fff"
    }
  })
}))

const mockDebouncedSaveAndRestart = jest.fn()
const mockImmediateSaveAndRestart = jest.fn()

jest.mock("../../hooks/useAutoSave", () => ({
  useAutoSave: () => ({
    saving: false,
    saveSuccess: false,
    debouncedSaveAndRestart: mockDebouncedSaveAndRestart,
    immediateSaveAndRestart: mockImmediateSaveAndRestart
  })
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    FloatingSaveIndicator: () => null,
    Container: ({ children }: any) => R.createElement(View, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    Button: ({ title, onPress }: any) => R.createElement(Pressable, { onPress }, R.createElement(Text, null, title)),
    FieldMessage: ({ children }: any) => R.createElement(Text, null, children),
    ChipGroup: ({ options, onSelect }: any) =>
      R.createElement(
        View,
        null,
        options.map((opt: any) =>
          R.createElement(
            Pressable,
            { key: opt.value, onPress: () => onSelect(opt.value) },
            R.createElement(Text, null, opt.label)
          )
        )
      )
  }
})

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

import { AuthSettingsScreen } from "../AuthSettingsScreen"

describe("AuthSettingsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthConfig = { ...DEFAULT_AUTH_CONFIG }
  })

  function renderScreen() {
    return render(<AuthSettingsScreen navigation={{} as any} />)
  }

  describe("loading state", () => {
    it("shows loading text while fetching config", () => {
      // Keep the promise pending
      mockGetAuthConfig.mockReturnValueOnce(new Promise(() => {}))
      const { getByText } = renderScreen()

      expect(getByText("加载中...")).toBeTruthy()
    })

    it("shows content after config is loaded", async () => {
      const { getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("身份验证与请求头")).toBeTruthy()
      })
    })
  })

  describe("auth type changes", () => {
    it("renders all three auth type options", async () => {
      const { getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("无")).toBeTruthy()
      })
      expect(getByText("基本身份验证")).toBeTruthy()
      expect(getByText("Bearer 令牌")).toBeTruthy()
    })

    it("defaults to None with no credential fields visible", async () => {
      const { queryByText, getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("无")).toBeTruthy()
      })

      expect(queryByText("用户名")).toBeNull()
      expect(queryByText("密码")).toBeNull()
      expect(queryByText("令牌")).toBeNull()
    })

    it("switching to Basic Auth shows username and password fields", async () => {
      const { getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("无")).toBeTruthy()
      })

      fireEvent.press(getByText("基本身份验证"))

      expect(getByText("用户名")).toBeTruthy()
      expect(getByText("密码")).toBeTruthy()
    })

    it("switching to Bearer Token shows token field", async () => {
      const { getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("无")).toBeTruthy()
      })

      fireEvent.press(getByText("Bearer 令牌"))

      expect(getByText("令牌")).toBeTruthy()
    })

    it("switching from Basic Auth to Bearer hides username/password, shows token", async () => {
      const { getByText, queryByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("无")).toBeTruthy()
      })

      fireEvent.press(getByText("基本身份验证"))
      expect(getByText("用户名")).toBeTruthy()

      fireEvent.press(getByText("Bearer 令牌"))
      expect(queryByText("用户名")).toBeNull()
      expect(queryByText("密码")).toBeNull()
      expect(getByText("令牌")).toBeTruthy()
    })

    it("switching from Bearer to None hides token field", async () => {
      const { getByText, queryByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("无")).toBeTruthy()
      })

      fireEvent.press(getByText("Bearer 令牌"))
      expect(getByText("令牌")).toBeTruthy()

      fireEvent.press(getByText("无"))
      expect(queryByText("令牌")).toBeNull()
    })

    it("auth type change triggers immediate save", async () => {
      const { getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("无")).toBeTruthy()
      })

      fireEvent.press(getByText("基本身份验证"))

      expect(mockImmediateSaveAndRestart).toHaveBeenCalled()
    })

    it("loads saved Basic Auth config and shows fields", async () => {
      mockAuthConfig = {
        ...DEFAULT_AUTH_CONFIG,
        authType: "basic",
        username: "testuser",
        password: "testpass"
      }

      const { getByText, getByDisplayValue } = renderScreen()

      await waitFor(() => {
        expect(getByText("用户名")).toBeTruthy()
      })

      expect(getByDisplayValue("testuser")).toBeTruthy()
      expect(getByDisplayValue("testpass")).toBeTruthy()
    })

    it("loads saved Bearer config and shows field", async () => {
      mockAuthConfig = {
        ...DEFAULT_AUTH_CONFIG,
        authType: "bearer",
        bearerToken: "my-secret-token"
      }

      const { getByText, getByDisplayValue } = renderScreen()

      await waitFor(() => {
        expect(getByText("令牌")).toBeTruthy()
      })

      expect(getByDisplayValue("my-secret-token")).toBeTruthy()
    })

    it("typing in username triggers debounced save", async () => {
      const { getByText, getByPlaceholderText } = renderScreen()

      await waitFor(() => {
        expect(getByText("无")).toBeTruthy()
      })

      fireEvent.press(getByText("基本身份验证"))

      const usernameInput = getByPlaceholderText("用户名")
      fireEvent.changeText(usernameInput, "newuser")

      expect(mockDebouncedSaveAndRestart).toHaveBeenCalled()
    })
  })

  describe("custom headers", () => {
    it("shows empty state when no headers configured", async () => {
      const { getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("未配置自定义请求头")).toBeTruthy()
      })
    })

    it("adds a header row when + Add Header is pressed", async () => {
      const { getByText, getAllByPlaceholderText } = renderScreen()

      await waitFor(() => {
        expect(getByText("+ 添加请求头")).toBeTruthy()
      })

      fireEvent.press(getByText("+ 添加请求头"))

      expect(getAllByPlaceholderText("请求头名称")).toHaveLength(1)
      expect(getAllByPlaceholderText("值")).toHaveLength(1)
    })

    it("loads saved custom headers", async () => {
      mockAuthConfig = {
        ...DEFAULT_AUTH_CONFIG,
        customHeaders: { "CF-Access-Client-Id": "abc123" }
      }

      const { getByDisplayValue } = renderScreen()

      await waitFor(() => {
        expect(getByDisplayValue("CF-Access-Client-Id")).toBeTruthy()
      })

      expect(getByDisplayValue("abc123")).toBeTruthy()
    })

    it("removes a header when X is pressed", async () => {
      mockAuthConfig = {
        ...DEFAULT_AUTH_CONFIG,
        customHeaders: { "X-Custom": "val" }
      }

      const { getByDisplayValue, getByText, queryByDisplayValue } = renderScreen()

      await waitFor(() => {
        expect(getByDisplayValue("X-Custom")).toBeTruthy()
      })

      fireEvent.press(getByText("X"))

      expect(queryByDisplayValue("X-Custom")).toBeNull()
      expect(mockImmediateSaveAndRestart).toHaveBeenCalled()
    })

    it("shows duplicate key warning when header names collide", async () => {
      mockAuthConfig = {
        ...DEFAULT_AUTH_CONFIG,
        customHeaders: { "X-One": "a" }
      }

      const { getByText, getAllByPlaceholderText, queryByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("+ 添加请求头")).toBeTruthy()
      })

      // No warning initially
      expect(queryByText(/请求头名称重复/)).toBeNull()

      // Add second header and type same key
      fireEvent.press(getByText("+ 添加请求头"))
      const nameInputs = getAllByPlaceholderText("请求头名称")
      fireEvent.changeText(nameInputs[1], "X-One")

      expect(getByText(/请求头名称重复/)).toBeTruthy()
    })
  })
})
