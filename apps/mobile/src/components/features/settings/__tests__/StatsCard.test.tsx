import React from "react"
import { render, fireEvent } from "@testing-library/react-native"

let mockSettings = { isOfflineMode: false }

jest.mock("../../../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: mockSettings
  })
}))

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      primary: "#0d9488",
      text: "#000",
      textSecondary: "#6b7280",
      success: "#22c55e",
      warning: "#f59e0b",
      error: "#ef4444",
      info: "#3b82f6",
      card: "#fff",
      border: "#e5e7eb"
    }
  })
}))

jest.mock("../../../../utils/queueStatus", () => ({
  getQueueColor: () => "#000"
}))

jest.mock("lucide-react-native", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    AlertTriangle: () => R.createElement(View, null),
    ChevronRight: () => R.createElement(View, null)
  }
})

import { StatsCard } from "../StatsCard"

const baseProps = {
  queueCount: 5,
  sentCount: 100,
  todayCount: 8,
  interval: "30"
}

describe("StatsCard", () => {
  beforeEach(() => {
    mockSettings = { isOfflineMode: false }
  })

  describe("online mode", () => {
    it("shows Queued, Sent, and Interval stats", () => {
      const { getByText } = render(<StatsCard {...baseProps} />)

      expect(getByText("已发送")).toBeTruthy()
      expect(getByText("5")).toBeTruthy()
      expect(getByText("已发送")).toBeTruthy()
      expect(getByText("100")).toBeTruthy()
      expect(getByText("间隔")).toBeTruthy()
    })

    it("abbreviates a multi-million sent count so the fixed-width column stays one line", () => {
      const { getByText, queryByText } = render(<StatsCard {...baseProps} sentCount={2_000_000} />)

      expect(getByText("2.0M")).toBeTruthy()
      expect(queryByText("2,000,000")).toBeNull()
    })

    it("does not show Today stat", () => {
      const { queryByText } = render(<StatsCard {...baseProps} />)

      expect(queryByText("今天")).toBeNull()
    })

    it("shows warning banner when queue is high", () => {
      const onManage = jest.fn()
      const { getByText } = render(<StatsCard {...baseProps} queueCount={75} onManageClick={onManage} />)

      expect(getByText("队列数量较高")).toBeTruthy()
      expect(getByText("点击管理数据")).toBeTruthy()
    })

    it("shows critical warning when queue is very high", () => {
      const onManage = jest.fn()
      const { getByText } = render(<StatsCard {...baseProps} queueCount={200} onManageClick={onManage} />)

      expect(getByText("队列数量严重")).toBeTruthy()
    })

    it("calls onManageClick when warning banner is pressed", () => {
      const onManage = jest.fn()
      const { getByText } = render(<StatsCard {...baseProps} queueCount={75} onManageClick={onManage} />)

      fireEvent.press(getByText("点击管理数据"))

      expect(onManage).toHaveBeenCalledTimes(1)
    })
  })

  describe("离线模式", () => {
    beforeEach(() => {
      mockSettings = { isOfflineMode: true }
    })

    it("shows Today and Interval instead of Queued/Sent", () => {
      const { getByText } = render(<StatsCard {...baseProps} />)

      expect(getByText("今天")).toBeTruthy()
      expect(getByText("8")).toBeTruthy()
      expect(getByText("间隔")).toBeTruthy()
    })

    it("hides Queued and Sent stats", () => {
      const { queryByText } = render(<StatsCard {...baseProps} />)

      expect(queryByText("队列中")).toBeNull()
      expect(queryByText("已发送")).toBeNull()
    })

    it("hides warning banner even with high queue count", () => {
      const onManage = jest.fn()
      const { queryByText } = render(<StatsCard {...baseProps} queueCount={200} onManageClick={onManage} />)

      expect(queryByText("High Queue Size")).toBeNull()
      expect(queryByText("Critical Queue Size")).toBeNull()
    })
  })
})
