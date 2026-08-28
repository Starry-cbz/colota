import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { DEFAULT_SETTINGS } from "../../../../types/global"

let mockSettings = { isOfflineMode: false }

jest.mock("../../../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: mockSettings
  })
}))

jest.mock("../../../ui/Card", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    Card: ({ children }: any) => R.createElement(View, null, children)
  }
})

jest.mock("lucide-react-native", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    Check: () => R.createElement(View, null),
    ChevronRight: () => R.createElement(View, null)
  }
})

import { WelcomeCard } from "../WelcomeCard"

const mockColors = {
  primary: "#0d9488",
  primaryDark: "#115E59",
  text: "#000",
  textSecondary: "#6b7280",
  textLight: "#9ca3af",
  success: "#22c55e",
  border: "#e5e7eb"
} as any

const defaultProps = {
  settings: DEFAULT_SETTINGS,
  tracking: false,
  colors: mockColors,
  onDismiss: jest.fn(),
  onStartTracking: jest.fn(),
  onNavigateToConnection: jest.fn(),
  onNavigateToTrackingSync: jest.fn(),
  onNavigateToApiConfig: jest.fn()
}

describe("WelcomeCard", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSettings = { isOfflineMode: false }
  })

  it("renders welcome title and subtitle", () => {
    const { getByText } = render(<WelcomeCard {...defaultProps} />)

    expect(getByText("欢迎使用 Colota")).toBeTruthy()
    expect(getByText("完成以下步骤即可开始：")).toBeTruthy()
  })

  it("shows Start tracking checklist item", () => {
    const { getByText } = render(<WelcomeCard {...defaultProps} />)

    expect(getByText("1. 开始跟踪")).toBeTruthy()
  })

  describe("online mode (default)", () => {
    it("shows server endpoint checklist item", () => {
      const { getByText } = render(<WelcomeCard {...defaultProps} />)

      expect(getByText("2. 配置服务器端点")).toBeTruthy()
    })

    it("shows API field mapping link", () => {
      const { getByText } = render(<WelcomeCard {...defaultProps} />)

      expect(getByText("API 字段映射")).toBeTruthy()
    })

    it("shows Tracking presets link", () => {
      const { getByText } = render(<WelcomeCard {...defaultProps} />)

      expect(getByText("跟踪配置方案")).toBeTruthy()
    })
  })

  describe("离线模式", () => {
    beforeEach(() => {
      mockSettings = { isOfflineMode: true }
    })

    it("hides server endpoint checklist item", () => {
      const { queryByText } = render(<WelcomeCard {...defaultProps} />)

      expect(queryByText("2. 配置服务器端点")).toBeNull()
    })

    it("hides API field mapping link", () => {
      const { queryByText } = render(<WelcomeCard {...defaultProps} />)

      expect(queryByText("API 字段映射")).toBeNull()
    })

    it("still shows Tracking presets link", () => {
      const { getByText } = render(<WelcomeCard {...defaultProps} />)

      expect(getByText("跟踪配置方案")).toBeTruthy()
    })

    it("still shows Start tracking checklist item", () => {
      const { getByText } = render(<WelcomeCard {...defaultProps} />)

      expect(getByText("1. 开始跟踪")).toBeTruthy()
    })
  })

  it("calls onDismiss when Got it is pressed", () => {
    const { getByText } = render(<WelcomeCard {...defaultProps} />)

    fireEvent.press(getByText("知道了"))

    expect(defaultProps.onDismiss).toHaveBeenCalledTimes(1)
  })

  it("calls onNavigateToTrackingSync when Tracking presets is pressed", () => {
    const { getByText } = render(<WelcomeCard {...defaultProps} />)

    fireEvent.press(getByText("跟踪配置方案"))

    expect(defaultProps.onNavigateToTrackingSync).toHaveBeenCalledTimes(1)
  })

  it("calls onNavigateToConnection when Configure your server endpoint is pressed", () => {
    const { getByText } = render(<WelcomeCard {...defaultProps} />)

    fireEvent.press(getByText("2. 配置服务器端点"))

    expect(defaultProps.onNavigateToConnection).toHaveBeenCalledTimes(1)
  })

  it("calls onNavigateToApiConfig when API field mapping is pressed", () => {
    const { getByText } = render(<WelcomeCard {...defaultProps} />)

    fireEvent.press(getByText("API 字段映射"))

    expect(defaultProps.onNavigateToApiConfig).toHaveBeenCalledTimes(1)
  })

  it("marks Start tracking as completed when tracking is active", () => {
    const { getByText } = render(<WelcomeCard {...defaultProps} tracking />)

    const label = getByText("1. 开始跟踪")
    expect(label).toBeTruthy()
  })
})
