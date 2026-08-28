import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { TrackingProfile } from "../../types/global"

// --- Mocks ---

const mockProfiles: TrackingProfile[] = [
  {
    id: 1,
    name: "Existing Profile",
    interval: 10,
    distance: 5,
    syncInterval: 60,
    priority: 15,
    condition: { type: "speed_above", speedThreshold: 13.89 },
    activationDelay: 12,
    deactivationDelay: 30,
    enabled: true
  }
]

const mockGetProfiles = jest.fn().mockResolvedValue(mockProfiles)
const mockCreateProfile = jest.fn().mockResolvedValue(1)
const mockUpdateProfile = jest.fn().mockResolvedValue(true)

jest.mock("../../services/ProfileService", () => ({
  ProfileService: {
    getProfiles: () => mockGetProfiles(),
    createProfile: (p: any) => mockCreateProfile(p),
    updateProfile: (p: any) => mockUpdateProfile(p)
  }
}))

const mockShowAlert = jest.fn()

jest.mock("../../services/modalService", () => ({
  showAlert: (...args: any[]) => mockShowAlert(...args)
}))

jest.mock("../../utils/geo", () => ({
  ...jest.requireActual("../../utils/geo"),
  shortDistanceUnit: () => "m",
  metersToInput: (v: number) => v,
  inputToMeters: (v: number) => v
}))

jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: {
      isOfflineMode: false,
      interval: 5,
      distance: 0,
      syncInterval: 0
    }
  })
}))

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      primary: "#0d9488",
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

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    SettingRow: ({ label, hint, children }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, label),
        hint && R.createElement(Text, null, hint),
        children
      ),
    FieldMessage: ({ children }: any) => R.createElement(Text, null, children)
  }
})

const mockGoBack = jest.fn()

const mockNavigation = {
  goBack: mockGoBack
}

import { ProfileEditorScreen } from "../ProfileEditorScreen"

describe("ProfileEditorScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetProfiles.mockResolvedValue(mockProfiles)
  })

  function renderNewProfile() {
    return render(<ProfileEditorScreen navigation={mockNavigation as any} route={{ params: {} } as any} />)
  }

  function renderEditProfile(profileId = 1) {
    return render(<ProfileEditorScreen navigation={mockNavigation as any} route={{ params: { profileId } } as any} />)
  }

  // --- New Profile Mode ---

  it("renders new profile title", () => {
    const { getByText } = renderNewProfile()
    expect(getByText("新建配置方案")).toBeTruthy()
  })

  it("shows Create Profile button for new profile", () => {
    const { getByText } = renderNewProfile()
    expect(getByText("创建配置方案")).toBeTruthy()
  })

  it("shows all condition options", () => {
    const { getByText } = renderNewProfile()

    expect(getByText("充电中")).toBeTruthy()
    expect(getByText("车载模式")).toBeTruthy()
    expect(getByText("速度高于")).toBeTruthy()
    expect(getByText("速度低于")).toBeTruthy()
  })

  it("shows all sync interval options inline", () => {
    const { getByText, getAllByText } = renderNewProfile()

    expect(getAllByText("立即").length).toBeGreaterThan(0)
    expect(getByText("1 分钟")).toBeTruthy()
    expect(getByText("5 分钟")).toBeTruthy()
    expect(getByText("15 分钟")).toBeTruthy()
  })

  it("pre-fills fields with main settings values", () => {
    const { getByDisplayValue, getAllByDisplayValue } = renderNewProfile()

    expect(getByDisplayValue("5")).toBeTruthy() // interval from settings
    // distance from settings is 0; activation delay also defaults to 0
    expect(getAllByDisplayValue("0").length).toBeGreaterThan(0)
  })

  it("shows default hints from main settings", () => {
    const { getByText } = renderNewProfile()

    expect(getByText("默认：5 秒")).toBeTruthy()
    expect(getByText(/默认：0 m/)).toBeTruthy()
    expect(getByText("默认：立即")).toBeTruthy()
  })

  // --- Validation ---

  it("shows alert when saving with empty name", async () => {
    const { getByText } = renderNewProfile()

    fireEvent.press(getByText("创建配置方案"))

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith("缺少名称", "请输入配置方案名称。", "warning")
    })
  })

  it("saves with speed condition when threshold is valid", async () => {
    const { getByText, getByDisplayValue } = renderNewProfile()

    const nameInput = getByDisplayValue("")
    fireEvent.changeText(nameInput, "Speed Test")

    // Select speed_above condition - defaults to 30 km/h threshold
    fireEvent.press(getByText("速度高于"))

    fireEvent.press(getByText("创建配置方案"))

    await waitFor(() => {
      expect(mockCreateProfile).toHaveBeenCalled()
      expect(mockGoBack).toHaveBeenCalled()
    })
  })

  // --- Successful save ---

  it("creates profile and navigates back on valid save", async () => {
    const { getByText, getByDisplayValue } = renderNewProfile()

    const nameInput = getByDisplayValue("")
    fireEvent.changeText(nameInput, "My Profile")

    fireEvent.press(getByText("创建配置方案"))

    await waitFor(() => {
      expect(mockCreateProfile).toHaveBeenCalled()
      expect(mockGoBack).toHaveBeenCalled()
    })
  })

  it("does not call createProfile when validation fails", async () => {
    const { getByText } = renderNewProfile()

    // Try to save with empty name
    fireEvent.press(getByText("创建配置方案"))

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalled()
    })

    expect(mockCreateProfile).not.toHaveBeenCalled()
  })

  // --- Edit Mode ---

  it("renders edit profile title when editing", async () => {
    const { getByText } = renderEditProfile()

    await waitFor(() => {
      expect(getByText("编辑配置方案")).toBeTruthy()
    })
  })

  it("shows Save Changes button when editing", async () => {
    const { getByText } = renderEditProfile()

    await waitFor(() => {
      expect(getByText("保存更改")).toBeTruthy()
    })
  })

  it("loads existing profile data", async () => {
    const { getByDisplayValue } = renderEditProfile()

    await waitFor(() => {
      expect(getByDisplayValue("Existing Profile")).toBeTruthy()
      expect(getByDisplayValue("15")).toBeTruthy() // priority
      expect(getByDisplayValue("10")).toBeTruthy() // interval
    })
  })

  it("loads speed threshold in km/h", async () => {
    const { getByDisplayValue } = renderEditProfile()

    // 13.89 m/s * 3.6 = 50 km/h
    await waitFor(() => {
      expect(getByDisplayValue("50")).toBeTruthy()
    })
  })

  it("calls updateProfile when saving in edit mode", async () => {
    const { getByText } = renderEditProfile()

    await waitFor(() => {
      expect(getByText("保存更改")).toBeTruthy()
    })

    fireEvent.press(getByText("保存更改"))

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalled()
      expect(mockGoBack).toHaveBeenCalled()
    })
  })

  it("shows error and navigates back on load failure", async () => {
    mockGetProfiles.mockRejectedValueOnce(new Error("DB Error"))

    renderEditProfile()

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith("错误", "加载配置方案数据失败。", "error")
      expect(mockGoBack).toHaveBeenCalled()
    })
  })

  it("shows error when save fails", async () => {
    mockCreateProfile.mockRejectedValueOnce(new Error("Save failed"))

    const { getByText, getByDisplayValue } = renderNewProfile()

    const nameInput = getByDisplayValue("")
    fireEvent.changeText(nameInput, "Fail Profile")

    fireEvent.press(getByText("创建配置方案"))

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith("错误", "保存配置方案失败。", "error")
    })
  })

  // --- Speed condition visibility ---

  it("shows speed threshold input only for speed conditions", () => {
    const { getByText, queryByText } = renderNewProfile()

    // Default is charging - no speed input
    expect(queryByText("速度阈值（公里/小时）")).toBeNull()

    // Select Speed Above
    fireEvent.press(getByText("速度高于"))
    expect(getByText("速度阈值（公里/小时）")).toBeTruthy()

    // Switch back to charging
    fireEvent.press(getByText("充电中"))
    expect(queryByText("速度阈值（公里/小时）")).toBeNull()
  })

  // --- Activation delay ---

  it("shows activation delay for all conditions, and deactivation delay only for non-stationary", () => {
    const { getByText, queryByText } = renderNewProfile()

    // Charging: both delays
    expect(getByText("激活延迟")).toBeTruthy()
    expect(getByText("停用延迟")).toBeTruthy()

    // Stationary: activation delay only (deactivation is instant via the motion sensor)
    fireEvent.press(getByText("静止"))
    expect(getByText("激活延迟")).toBeTruthy()
    expect(queryByText("停用延迟")).toBeNull()
  })

  it("hides the movement threshold for a stationary profile and shows a note instead", () => {
    const { getByText, queryByText } = renderNewProfile()

    // Default (charging): the field is shown
    expect(getByText("移动阈值")).toBeTruthy()

    // Stationary: field hidden (the distance filter is forced to 0), note shown instead
    fireEvent.press(getByText("静止"))
    expect(queryByText("移动阈值")).toBeNull()
    expect(getByText(/不使用移动阈值/)).toBeTruthy()
  })

  it("defaults stationary activation delay to 60", () => {
    const { getByText, getByDisplayValue } = renderNewProfile()

    fireEvent.press(getByText("静止"))
    expect(getByDisplayValue("60")).toBeTruthy()
  })

  it("loads existing activation delay in edit mode", async () => {
    const { getByDisplayValue } = renderEditProfile()

    await waitFor(() => {
      expect(getByDisplayValue("12")).toBeTruthy()
    })
  })

  // --- Numeric input ---

  it("updates interval via numeric input", () => {
    const { getByDisplayValue } = renderNewProfile()

    const intervalInput = getByDisplayValue("5")
    fireEvent.changeText(intervalInput, "15")

    expect(getByDisplayValue("15")).toBeTruthy()
  })

  it("updates priority via numeric input", () => {
    const { getByDisplayValue } = renderNewProfile()

    const priorityInput = getByDisplayValue("10")
    fireEvent.changeText(priorityInput, "25")

    expect(getByDisplayValue("25")).toBeTruthy()
  })

  // --- Stationary interval warning ---

  describe("stationary interval warning", () => {
    it("does not show the warning while interval is at or below 60s", () => {
      const { getByText, queryByText, getByDisplayValue } = renderNewProfile()

      fireEvent.press(getByText("静止"))
      const intervalInput = getByDisplayValue("5")
      fireEvent.changeText(intervalInput, "60")

      expect(queryByText(/可能会漏掉行程最初的 \d+ 分钟/)).toBeNull()
    })

    it("shows a warning when the interval exceeds 60s", () => {
      const { getByText, getByDisplayValue } = renderNewProfile()

      fireEvent.press(getByText("静止"))
      const intervalInput = getByDisplayValue("5")
      fireEvent.changeText(intervalInput, "600")

      expect(getByText(/可能会漏掉行程最初的 \d+ 分钟/)).toBeTruthy()
    })

    it("does not show the warning for non-stationary conditions even with large intervals", () => {
      const { queryByText, getByDisplayValue } = renderNewProfile()

      const intervalInput = getByDisplayValue("5")
      fireEvent.changeText(intervalInput, "3600")

      expect(queryByText(/可能会漏掉行程最初的 \d+ 分钟/)).toBeNull()
    })

    it("loads an existing Stationary profile with interval > 60 unchanged", async () => {
      mockGetProfiles.mockResolvedValueOnce([
        {
          id: 1,
          name: "Old Stationary",
          interval: 3600,
          distance: 0,
          syncInterval: 0,
          priority: 10,
          condition: { type: "stationary" },
          activationDelay: 0,
          deactivationDelay: 0,
          enabled: true
        }
      ])

      const { getByDisplayValue, getByText } = renderEditProfile()

      await waitFor(() => {
        expect(getByDisplayValue("3600")).toBeTruthy()
      })
      expect(getByText(/可能会漏掉行程最初的 \d+ 分钟/)).toBeTruthy()
    })
  })
})
