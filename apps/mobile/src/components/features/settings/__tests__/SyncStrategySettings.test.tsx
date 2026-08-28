import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { DEFAULT_SETTINGS, TRACKING_PRESETS, Settings } from "../../../../types/global"

// Mock barrel export (avoids transitive native module imports)
jest.mock("../../../index", () => {
  const R = require("react")
  const { View, Text, TextInput } = require("react-native")
  return {
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    NumericInput: ({ label, value, onChange, onBlur, unit, hint, placeholder: ph }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, label),
        hint && R.createElement(Text, null, hint),
        R.createElement(TextInput, {
          value,
          onChangeText: onChange,
          onBlur,
          placeholder: ph,
          keyboardType: "numeric"
        }),
        R.createElement(Text, null, unit)
      ),
    SettingRow: ({ label, hint, children }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, label),
        hint && R.createElement(Text, null, hint),
        children
      )
  }
})

jest.mock("../../../../utils/geo", () => ({
  shortDistanceUnit: () => "m",
  inputToMeters: (value: number) => value,
  metersToInput: (meters: number) => meters
}))

jest.mock("../PresetOption", () => ({
  PresetOption: ({ preset, isSelected, onSelect }: any) => {
    const R = require("react")
    const { Pressable, Text } = require("react-native")
    return R.createElement(
      Pressable,
      { testID: `preset-${preset}`, onPress: () => onSelect(preset) },
      R.createElement(Text, null, preset, isSelected ? " (selected)" : "")
    )
  }
}))

const mockColors = {
  primary: "#0d9488",
  primaryDark: "#115E59",
  border: "#e5e7eb",
  text: "#000",
  textSecondary: "#6b7280",
  textLight: "#9ca3af",
  background: "#fff",
  info: "#3b82f6",
  card: "#fff",
  backgroundElevated: "#f9fafb",
  placeholder: "#9ca3af",
  textOnPrimary: "#fff"
} as any

import { SyncStrategySettings } from "../SyncStrategySettings"

describe("SyncStrategySettings", () => {
  let mockOnSettingsChange: jest.Mock
  let mockOnDebouncedSave: jest.Mock
  let mockOnImmediateSave: jest.Mock
  let baseSettings: Settings

  beforeEach(() => {
    mockOnSettingsChange = jest.fn()
    mockOnDebouncedSave = jest.fn()
    mockOnImmediateSave = jest.fn()
    baseSettings = { ...DEFAULT_SETTINGS }
  })

  function renderComponent(settingsOverride?: Partial<Settings>) {
    const settings = { ...baseSettings, ...settingsOverride }
    return render(
      <SyncStrategySettings
        settings={settings}
        onSettingsChange={mockOnSettingsChange}
        onDebouncedSave={mockOnDebouncedSave}
        onImmediateSave={mockOnImmediateSave}
        colors={mockColors}
      />
    )
  }

  describe("presets", () => {
    it("renders all three presets inline", () => {
      const { getByTestId } = renderComponent()

      // Presets are rendered inline (no picker to open)
      expect(getByTestId("preset-instant")).toBeTruthy()
      expect(getByTestId("preset-balanced")).toBeTruthy()
      expect(getByTestId("preset-powersaver")).toBeTruthy()
    })

    it("selecting a preset applies its config via onImmediateSave", () => {
      const { getByTestId } = renderComponent()

      // Select balanced directly (inline)
      fireEvent.press(getByTestId("preset-balanced"))

      expect(mockOnSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({
          syncPreset: "balanced",
          interval: TRACKING_PRESETS.balanced.interval,
          distance: TRACKING_PRESETS.balanced.distance,
          syncInterval: TRACKING_PRESETS.balanced.syncInterval
        })
      )
      expect(mockOnImmediateSave).toHaveBeenCalledWith(
        expect.objectContaining({
          syncPreset: "balanced",
          interval: TRACKING_PRESETS.balanced.interval,
          distance: TRACKING_PRESETS.balanced.distance,
          syncInterval: TRACKING_PRESETS.balanced.syncInterval
        })
      )
    })

    it("selecting a preset in offline mode skips sync fields", () => {
      const { getByTestId } = renderComponent({ isOfflineMode: true })

      fireEvent.press(getByTestId("preset-balanced"))

      const savedSettings = mockOnImmediateSave.mock.calls[0][0]
      expect(savedSettings.syncPreset).toBe("balanced")
      expect(savedSettings.interval).toBe(TRACKING_PRESETS.balanced.interval)
      expect(savedSettings.distance).toBe(TRACKING_PRESETS.balanced.distance)
      // syncInterval and retryInterval should NOT be overwritten in offline mode
      expect(savedSettings.syncInterval).toBe(DEFAULT_SETTINGS.syncInterval)
      expect(savedSettings.retryInterval).toBe(DEFAULT_SETTINGS.retryInterval)
    })
  })

  describe("advanced toggle", () => {
    it("shows advanced settings when toggle is pressed", () => {
      const { getByText, queryByText } = renderComponent()

      expect(queryByText("Tracking Parameters")).toBeNull()

      fireEvent.press(getByText("高级设置"))

      expect(getByText("跟踪参数")).toBeTruthy()
      expect(getByText("网络设置")).toBeTruthy()
    })

    it("hides advanced settings when toggle is pressed again", () => {
      const { getByText, queryByText } = renderComponent()

      fireEvent.press(getByText("高级设置"))
      expect(getByText("跟踪参数")).toBeTruthy()

      fireEvent.press(getByText("高级设置"))
      expect(queryByText("Tracking Parameters")).toBeNull()
    })
  })

  describe("custom banner", () => {
    it("shows custom configuration banner when preset is custom", () => {
      const { getByText } = renderComponent({ syncPreset: "custom" })

      fireEvent.press(getByText("高级设置"))

      expect(getByText("使用自定义配置")).toBeTruthy()
    })

    it("does not show custom banner when a named preset is selected", () => {
      const { getByText, queryByText } = renderComponent({ syncPreset: "instant" })

      fireEvent.press(getByText("高级设置"))

      expect(queryByText("Using custom configuration")).toBeNull()
    })
  })

  describe("sync interval chips", () => {
    it("renders all sync interval options inline", () => {
      const { getByText, getAllByText } = renderComponent()

      fireEvent.press(getByText("高级设置"))

      expect(getAllByText("立即").length).toBeGreaterThan(0)
      expect(getByText("1 分钟")).toBeTruthy()
      expect(getByText("5 分钟")).toBeTruthy()
      expect(getByText("15 分钟")).toBeTruthy()
      expect(getByText("自定义")).toBeTruthy()
    })

    it("selecting a sync interval sets preset to custom", () => {
      const { getByText } = renderComponent()

      fireEvent.press(getByText("高级设置"))
      fireEvent.press(getByText("5 分钟"))

      expect(mockOnSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({
          syncInterval: 300,
          syncPreset: "custom"
        })
      )
      expect(mockOnDebouncedSave).toHaveBeenCalledWith(
        expect.objectContaining({
          syncInterval: 300,
          syncPreset: "custom"
        })
      )
    })
  })

  describe("filter inaccurate locations", () => {
    it("shows accuracy threshold input when filter is enabled", () => {
      const { getByText } = renderComponent({ filterInaccurateLocations: true })

      fireEvent.press(getByText("高级设置"))

      expect(getByText("精度阈值")).toBeTruthy()
    })

    it("hides accuracy threshold input when filter is disabled", () => {
      const { getByText, queryByText } = renderComponent({ filterInaccurateLocations: false })

      fireEvent.press(getByText("高级设置"))

      expect(queryByText("精度阈值")).toBeNull()
    })
  })

  describe("numeric input blur behavior", () => {
    it("clamps interval to min 1 on blur when value is 0", () => {
      const { getByText, getByDisplayValue } = renderComponent({
        interval: 5,
        syncPreset: "custom"
      })

      fireEvent.press(getByText("高级设置"))

      const intervalInput = getByDisplayValue("5")
      fireEvent.changeText(intervalInput, "0")
      fireEvent(intervalInput, "blur")

      // Should clamp to 1 and call onSettingsChange + onImmediateSave
      expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ interval: 1 }))
      expect(mockOnImmediateSave).toHaveBeenCalledWith(expect.objectContaining({ interval: 1 }))
    })

    it("clamps interval to min 1 on blur when value is negative", () => {
      const { getByText, getByDisplayValue } = renderComponent({
        interval: 5,
        syncPreset: "custom"
      })

      fireEvent.press(getByText("高级设置"))

      const intervalInput = getByDisplayValue("5")
      fireEvent.changeText(intervalInput, "-3")
      fireEvent(intervalInput, "blur")

      expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ interval: 1 }))
      expect(mockOnImmediateSave).toHaveBeenCalledWith(expect.objectContaining({ interval: 1 }))
    })

    it("clamps interval to min 1 on blur when value is NaN", () => {
      const { getByText, getByDisplayValue } = renderComponent({
        interval: 5,
        syncPreset: "custom"
      })

      fireEvent.press(getByText("高级设置"))

      const intervalInput = getByDisplayValue("5")
      fireEvent.changeText(intervalInput, "abc")
      fireEvent(intervalInput, "blur")

      expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ interval: 1 }))
      expect(mockOnImmediateSave).toHaveBeenCalledWith(expect.objectContaining({ interval: 1 }))
    })

    it("does not clamp interval on blur when value is valid", () => {
      const { getByText, getByDisplayValue } = renderComponent({
        interval: 5,
        syncPreset: "custom"
      })

      fireEvent.press(getByText("高级设置"))

      const intervalInput = getByDisplayValue("5")
      fireEvent.changeText(intervalInput, "10")
      fireEvent(intervalInput, "blur")

      // Valid value - onSettingsChange should only have been called from changeText (debounced save),
      // not from blur (no clamping needed)
      expect(mockOnImmediateSave).not.toHaveBeenCalled()
    })

    it("clamps distance to min 0 on blur when value is negative", () => {
      const { getByText, getByDisplayValue } = renderComponent({
        interval: 5,
        distance: 10,
        syncPreset: "custom"
      })

      fireEvent.press(getByText("高级设置"))

      const distanceInput = getByDisplayValue("10")
      fireEvent.changeText(distanceInput, "-5")
      fireEvent(distanceInput, "blur")

      expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ distance: 0 }))
      expect(mockOnImmediateSave).toHaveBeenCalledWith(expect.objectContaining({ distance: 0 }))
    })

    it("clamps distance to min 0 on blur when value is NaN", () => {
      const { getByText, getByDisplayValue } = renderComponent({
        interval: 5,
        distance: 10,
        syncPreset: "custom"
      })

      fireEvent.press(getByText("高级设置"))

      const distanceInput = getByDisplayValue("10")
      fireEvent.changeText(distanceInput, "abc")
      fireEvent(distanceInput, "blur")

      expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ distance: 0 }))
      expect(mockOnImmediateSave).toHaveBeenCalledWith(expect.objectContaining({ distance: 0 }))
    })

    it("clamps accuracy threshold to min 1 on blur when value is below", () => {
      const { getByText, getByDisplayValue } = renderComponent({
        interval: 5,
        filterInaccurateLocations: true,
        accuracyThreshold: 100,
        syncPreset: "custom"
      })

      fireEvent.press(getByText("高级设置"))

      const thresholdInput = getByDisplayValue("100")
      fireEvent.changeText(thresholdInput, "0")
      fireEvent(thresholdInput, "blur")

      expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ accuracyThreshold: 1 }))
      expect(mockOnImmediateSave).toHaveBeenCalledWith(expect.objectContaining({ accuracyThreshold: 1 }))
    })

    it("does not clamp accuracy threshold on blur when value is valid", () => {
      const { getByText, getByDisplayValue } = renderComponent({
        interval: 5,
        filterInaccurateLocations: true,
        accuracyThreshold: 100,
        syncPreset: "custom"
      })

      fireEvent.press(getByText("高级设置"))

      const thresholdInput = getByDisplayValue("100")
      fireEvent.changeText(thresholdInput, "200")
      fireEvent(thresholdInput, "blur")

      expect(mockOnImmediateSave).not.toHaveBeenCalled()
    })
  })
})
