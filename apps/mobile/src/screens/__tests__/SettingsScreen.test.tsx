import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { DEFAULT_SETTINGS, Settings } from "../../types/global"

// --- Mocks ---

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => (() => void) | void) => require("react").useEffect(() => cb(), [])
}))

let mockSettings: Settings = { ...DEFAULT_SETTINGS }
let mockTracking = false

jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: mockSettings,
    setSettings: jest.fn(),
    updateSettingsLocal: jest.fn(),
    restartTracking: jest.fn(),
    tracking: mockTracking
  })
}))

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    mode: "light",
    toggleTheme: jest.fn(),
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
      backgroundElevated: "#f9fafb",
      placeholder: "#9ca3af",
      textOnPrimary: "#fff"
    }
  })
}))

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getStats: jest.fn().mockResolvedValue({
      queued: 5,
      sent: 42,
      total: 100,
      today: 10,
      databaseSizeMB: 1.2
    }),
    saveSetting: jest.fn().mockResolvedValue(undefined),
    getSetting: jest.fn().mockResolvedValue(null)
  }
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    StatsCard: ({ queueCount, sentCount }: any) =>
      R.createElement(
        View,
        { testID: "StatsCard" },
        R.createElement(Text, null, `${queueCount}`),
        R.createElement(Text, null, `${sentCount}`)
      ),
    ListItem: ({ testID, label, sub, onPress }: any) =>
      R.createElement(
        Pressable,
        { testID, onPress },
        R.createElement(Text, null, label),
        sub ? R.createElement(Text, null, sub) : null
      )
  }
})

import { SettingsScreen } from "../SettingsScreen"

const mockNavigate = jest.fn()
const mockProps = { navigation: { navigate: mockNavigate }, route: { key: "Settings", name: "Settings" } } as any

describe("SettingsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSettings = { ...DEFAULT_SETTINGS }
    mockTracking = false
  })

  it("renders grouped section headers", () => {
    const { getByText } = render(<SettingsScreen {...mockProps} />)

    expect(getByText("显示")).toBeTruthy()
    expect(getByText("数据")).toBeTruthy()
  })

  it("renders StatsCard with stats", () => {
    const { getByTestId } = render(<SettingsScreen {...mockProps} />)

    expect(getByTestId("StatsCard")).toBeTruthy()
  })

  // --- Summary rows ---

  it("shows the endpoint host as the Connection summary", () => {
    mockSettings = { ...DEFAULT_SETTINGS, endpoint: "https://api.example.com/track" }

    const { getByText } = render(<SettingsScreen {...mockProps} />)

    expect(getByText("api.example.com")).toBeTruthy()
  })

  it("shows 'No server configured' when endpoint is empty and not offline", () => {
    mockSettings = { ...DEFAULT_SETTINGS, endpoint: "", isOfflineMode: false }

    const { getByText } = render(<SettingsScreen {...mockProps} />)

    expect(getByText("未配置服务器")).toBeTruthy()
  })

  it("shows 'Offline' as the Connection summary in offline mode", () => {
    mockSettings = { ...DEFAULT_SETTINGS, isOfflineMode: true }

    const { getByText } = render(<SettingsScreen {...mockProps} />)

    expect(getByText("离线模式 · 保存到本地")).toBeTruthy()
  })

  it("shows the preset label as the Sync Strategy summary", () => {
    mockSettings = { ...DEFAULT_SETTINGS, syncPreset: "balanced" }

    const { getByText } = render(<SettingsScreen {...mockProps} />)

    expect(getByText(/每 .* 秒/)).toBeTruthy()
  })

  it("shows a custom summary when syncPreset is custom", () => {
    mockSettings = { ...DEFAULT_SETTINGS, syncPreset: "custom", interval: 45 }

    const { getByText } = render(<SettingsScreen {...mockProps} />)

    expect(getByText("自定义 · 每 45 秒")).toBeTruthy()
  })

  // --- Navigation ---

  it("navigates to Appearance", () => {
    const { getByText } = render(<SettingsScreen {...mockProps} />)

    fireEvent.press(getByText("外观"))

    expect(mockNavigate).toHaveBeenCalledWith("Appearance")
  })

  it("navigates to Connection", () => {
    const { getByText } = render(<SettingsScreen {...mockProps} />)

    fireEvent.press(getByText("连接"))

    expect(mockNavigate).toHaveBeenCalledWith("Connection")
  })

  it("navigates to Tracking & Sync", () => {
    const { getByText } = render(<SettingsScreen {...mockProps} />)

    fireEvent.press(getByText("跟踪与同步"))

    expect(mockNavigate).toHaveBeenCalledWith("Tracking & Sync")
  })

  it("navigates to Tracking Profiles", () => {
    const { getByText } = render(<SettingsScreen {...mockProps} />)

    fireEvent.press(getByText("跟踪配置方案"))

    expect(mockNavigate).toHaveBeenCalledWith("Tracking Profiles")
  })

  it("navigates to Data Management", () => {
    const { getByText } = render(<SettingsScreen {...mockProps} />)

    fireEvent.press(getByText("数据管理"))

    expect(mockNavigate).toHaveBeenCalledWith("Data Management")
  })

  it("navigates to API Config", () => {
    const { getByText } = render(<SettingsScreen {...mockProps} />)

    fireEvent.press(getByText("API 字段映射"))

    expect(mockNavigate).toHaveBeenCalledWith("API Config")
  })

  // --- Offline mode ---

  it("hides API Field Mapping link when offline mode is enabled", () => {
    mockSettings = { ...DEFAULT_SETTINGS, isOfflineMode: true }

    const { queryByText } = render(<SettingsScreen {...mockProps} />)

    expect(queryByText("API 字段映射")).toBeNull()
  })

  it("still shows Connection, Tracking Profiles and Data Management in offline mode", () => {
    mockSettings = { ...DEFAULT_SETTINGS, isOfflineMode: true }

    const { getByText } = render(<SettingsScreen {...mockProps} />)

    expect(getByText("连接")).toBeTruthy()
    expect(getByText("跟踪配置方案")).toBeTruthy()
    expect(getByText("数据管理")).toBeTruthy()
  })
})
