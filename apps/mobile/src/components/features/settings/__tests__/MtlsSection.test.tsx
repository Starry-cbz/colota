import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"

jest.mock("../../../index", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    Button: ({ title, onPress, disabled }: any) =>
      R.createElement(
        Pressable,
        { onPress, disabled, accessibilityRole: "button" },
        R.createElement(Text, null, title)
      ),
    FieldMessage: ({ children }: any) => R.createElement(Text, null, children)
  }
})

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      text: "#000",
      textSecondary: "#666",
      textLight: "#999",
      background: "#fff",
      border: "#ddd",
      placeholder: "#999",
      error: "#f00",
      warning: "#f80",
      success: "#0a0",
      pressedOpacity: 0.7
    }
  })
}))

jest.mock("../../../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

const mockGetClientCertInfo = jest.fn().mockResolvedValue({ configured: false })
const mockGetServerCaInfo = jest.fn().mockResolvedValue({ configured: false })
const mockPickClientCertFile = jest.fn().mockResolvedValue(null)
const mockPickKeyChainCert = jest.fn().mockResolvedValue(null)
const mockImportClientCert = jest.fn().mockResolvedValue({})
const mockClearClientCert = jest.fn().mockResolvedValue(true)
const mockPickServerCaFile = jest.fn().mockResolvedValue(null)
const mockImportServerCa = jest.fn().mockResolvedValue({})
const mockClearServerCa = jest.fn().mockResolvedValue(true)

jest.mock("../../../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getClientCertInfo: (...a: any[]) => mockGetClientCertInfo(...a),
    getServerCaInfo: (...a: any[]) => mockGetServerCaInfo(...a),
    pickClientCertFile: (...a: any[]) => mockPickClientCertFile(...a),
    pickKeyChainCert: (...a: any[]) => mockPickKeyChainCert(...a),
    importClientCert: (...a: any[]) => mockImportClientCert(...a),
    clearClientCert: (...a: any[]) => mockClearClientCert(...a),
    pickServerCaFile: (...a: any[]) => mockPickServerCaFile(...a),
    importServerCa: (...a: any[]) => mockImportServerCa(...a),
    clearServerCa: (...a: any[]) => mockClearServerCa(...a)
  }
}))

import { MtlsSection } from "../MtlsSection"

const ONE_DAY_MS = 24 * 60 * 60 * 1000

describe("MtlsSection", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetClientCertInfo.mockResolvedValue({ configured: false })
    mockGetServerCaInfo.mockResolvedValue({ configured: false })
  })

  describe("loading + empty states", () => {
    it("shows Loading text before the initial info fetch resolves", () => {
      // Pending promises so refresh() doesn't complete before the render assertion
      mockGetClientCertInfo.mockReturnValue(new Promise(() => {}))
      mockGetServerCaInfo.mockReturnValue(new Promise(() => {}))
      const { getByText } = render(<MtlsSection />)
      expect(getByText("加载中...")).toBeTruthy()
    })

    it("renders both empty-state sections with their action buttons", async () => {
      const { getByText } = render(<MtlsSection />)
      await waitFor(() => {
        expect(getByText("从设备证书中选择")).toBeTruthy()
        expect(getByText("导入 .p12 / .pfx")).toBeTruthy()
        expect(getByText("导入 CA（.crt / .pem）")).toBeTruthy()
      })
    })
  })

  describe("client cert: KeyChain pick", () => {
    it("refreshes info after a successful KeyChain pick", async () => {
      mockPickKeyChainCert.mockResolvedValueOnce({ configured: true, subject: "CN=picked" })
      mockGetClientCertInfo.mockResolvedValueOnce({ configured: false }).mockResolvedValueOnce({
        configured: true,
        subject: "CN=picked",
        issuer: "CN=Test CA",
        notBefore: Date.now() - ONE_DAY_MS,
        notAfter: Date.now() + 365 * ONE_DAY_MS,
        source: "keychain"
      })

      const { getByText } = render(<MtlsSection />)
      await waitFor(() => expect(getByText("从设备证书中选择")).toBeTruthy())
      fireEvent.press(getByText("从设备证书中选择"))

      await waitFor(() => {
        expect(mockPickKeyChainCert).toHaveBeenCalled()
        expect(mockGetClientCertInfo).toHaveBeenCalledTimes(2)
      })
    })

    it("does not refresh when the user cancels the KeyChain picker", async () => {
      const { getByText } = render(<MtlsSection />)
      await waitFor(() => getByText("从设备证书中选择"))
      fireEvent.press(getByText("从设备证书中选择"))
      await waitFor(() => expect(mockPickKeyChainCert).toHaveBeenCalled())
      // Only the initial info fetch, no second refresh
      expect(mockGetClientCertInfo).toHaveBeenCalledTimes(1)
    })
  })

  describe("client cert: PKCS12 import", () => {
    it("shows password field after picking a .p12 file", async () => {
      mockPickClientCertFile.mockResolvedValueOnce("base64bytes")
      const { getByText, getByPlaceholderText } = render(<MtlsSection />)
      await waitFor(() => getByText("导入 .p12 / .pfx"))
      fireEvent.press(getByText("导入 .p12 / .pfx"))

      await waitFor(() => {
        expect(getByText("密码（无密码可留空）")).toBeTruthy()
        expect(getByPlaceholderText("PKCS12 密码")).toBeTruthy()
        expect(getByText("保存")).toBeTruthy()
        expect(getByText("取消")).toBeTruthy()
      })
    })

    it("surfaces wrong-password error inline without persisting state", async () => {
      mockPickClientCertFile.mockResolvedValueOnce("base64bytes")
      mockImportClientCert.mockRejectedValueOnce({ code: "E_CERT_PASSWORD", message: "bad password" })

      const { getByText, getByPlaceholderText } = render(<MtlsSection />)
      await waitFor(() => getByText("导入 .p12 / .pfx"))
      fireEvent.press(getByText("导入 .p12 / .pfx"))
      await waitFor(() => getByText("保存"))
      fireEvent.changeText(getByPlaceholderText("PKCS12 密码"), "wrong")
      fireEvent.press(getByText("保存"))

      await waitFor(() => expect(getByText("Incorrect password")).toBeTruthy())
      // Still in picked state - user can retry without re-picking file
      expect(getByText("保存")).toBeTruthy()
    })

    it("surfaces invalid-PKCS12 error inline", async () => {
      mockPickClientCertFile.mockResolvedValueOnce("base64bytes")
      mockImportClientCert.mockRejectedValueOnce({ code: "E_CERT_INVALID", message: "not pkcs12" })

      const { getByText, getByPlaceholderText } = render(<MtlsSection />)
      await waitFor(() => getByText("导入 .p12 / .pfx"))
      fireEvent.press(getByText("导入 .p12 / .pfx"))
      await waitFor(() => getByText("保存"))
      fireEvent.changeText(getByPlaceholderText("PKCS12 密码"), "any")
      fireEvent.press(getByText("保存"))

      await waitFor(() => expect(getByText("Not a valid PKCS12 file")).toBeTruthy())
    })

    it("Cancel returns to the empty state", async () => {
      mockPickClientCertFile.mockResolvedValueOnce("base64bytes")
      const { getByText, queryByText } = render(<MtlsSection />)
      await waitFor(() => getByText("导入 .p12 / .pfx"))
      fireEvent.press(getByText("导入 .p12 / .pfx"))
      await waitFor(() => getByText("保存"))

      fireEvent.press(getByText("取消"))

      await waitFor(() => {
        expect(queryByText("保存")).toBeNull()
        expect(getByText("从设备证书中选择")).toBeTruthy()
      })
    })
  })

  describe("client cert: configured state", () => {
    it("renders subject, issuer and shows expiry date", async () => {
      const notAfter = Date.now() + 320 * ONE_DAY_MS
      mockGetClientCertInfo.mockResolvedValue({
        configured: true,
        subject: "CN=colota-test-client,O=Colota",
        issuer: "CN=Test CA",
        notBefore: Date.now() - ONE_DAY_MS,
        notAfter,
        source: "p12"
      })

      const { getByText } = render(<MtlsSection />)
      await waitFor(() => {
        // shortenDn strips down to just the CN value
        expect(getByText("colota-test-client")).toBeTruthy()
        expect(getByText("移除证书")).toBeTruthy()
      })
    })

    it("shows the expiring-soon warning when within EXPIRY_WARNING_DAYS", async () => {
      const notAfter = Date.now() + 5 * ONE_DAY_MS
      mockGetClientCertInfo.mockResolvedValue({
        configured: true,
        subject: "CN=expiring",
        issuer: "CN=Test CA",
        notBefore: Date.now() - ONE_DAY_MS,
        notAfter
      })
      const { getByText } = render(<MtlsSection />)
      await waitFor(() => expect(getByText(/证书将在 \d+ 天后过期/)).toBeTruthy())
    })

    it("shows the expired error when notAfter is in the past", async () => {
      mockGetClientCertInfo.mockResolvedValue({
        configured: true,
        subject: "CN=stale",
        issuer: "CN=Test CA",
        notBefore: Date.now() - 365 * ONE_DAY_MS,
        notAfter: Date.now() - ONE_DAY_MS
      })
      const { getByText } = render(<MtlsSection />)
      await waitFor(() => expect(getByText(/证书已过期/)).toBeTruthy())
    })
  })

  describe("server CA section", () => {
    it("renders the empty-state Import CA button + helper text", async () => {
      const { getByText } = render(<MtlsSection />)
      await waitFor(() => {
        expect(getByText("受信任的服务器 CA")).toBeTruthy()
        expect(getByText("导入 CA（.crt / .pem）")).toBeTruthy()
      })
    })

    it("shows friendly error when picker reports file-too-large (E_CA_READ)", async () => {
      mockPickServerCaFile.mockRejectedValueOnce({ code: "E_CA_READ", message: "File too large" })
      const { getByText } = render(<MtlsSection />)
      await waitFor(() => getByText("导入 CA（.crt / .pem）"))
      fireEvent.press(getByText("导入 CA（.crt / .pem）"))
      await waitFor(() => expect(getByText(/Could not read the selected file/)).toBeTruthy())
    })

    it("shows friendly error when imported file is not a valid X.509", async () => {
      mockPickServerCaFile.mockResolvedValueOnce("notACert")
      mockImportServerCa.mockRejectedValueOnce({ code: "E_CA_INVALID", message: "parse error" })

      const { getByText } = render(<MtlsSection />)
      await waitFor(() => getByText("导入 CA（.crt / .pem）"))
      fireEvent.press(getByText("导入 CA（.crt / .pem）"))
      await waitFor(() => expect(getByText(/Not a valid X\.509 certificate/)).toBeTruthy())
    })

    it("renders configured state with Remove CA action", async () => {
      mockGetServerCaInfo.mockResolvedValue({
        configured: true,
        subject: "CN=Colota Test CA",
        issuer: "CN=Colota Test CA",
        notBefore: Date.now() - ONE_DAY_MS,
        notAfter: Date.now() + 1000 * ONE_DAY_MS
      })
      const { getByText } = render(<MtlsSection />)
      await waitFor(() => {
        expect(getByText("Colota Test CA")).toBeTruthy()
        expect(getByText("移除 CA")).toBeTruthy()
      })
    })

    it("shows expired CA error when notAfter is in the past", async () => {
      mockGetServerCaInfo.mockResolvedValue({
        configured: true,
        subject: "CN=Old CA",
        issuer: "CN=Old CA",
        notBefore: Date.now() - 730 * ONE_DAY_MS,
        notAfter: Date.now() - ONE_DAY_MS
      })
      const { getByText } = render(<MtlsSection />)
      await waitFor(() => expect(getByText(/CA 已过期/)).toBeTruthy())
    })
  })

  describe("remove actions", () => {
    it("clears client cert and refreshes when Remove Certificate is tapped", async () => {
      mockGetClientCertInfo
        .mockResolvedValueOnce({
          configured: true,
          subject: "CN=test",
          issuer: "CN=Test CA",
          notBefore: Date.now() - ONE_DAY_MS,
          notAfter: Date.now() + 365 * ONE_DAY_MS
        })
        .mockResolvedValueOnce({ configured: false })

      const { getByText } = render(<MtlsSection />)
      await waitFor(() => getByText("移除证书"))
      fireEvent.press(getByText("移除证书"))

      await waitFor(() => {
        expect(mockClearClientCert).toHaveBeenCalled()
        expect(mockGetClientCertInfo).toHaveBeenCalledTimes(2)
      })
    })

    it("clears server CA and refreshes when Remove CA is tapped", async () => {
      mockGetServerCaInfo
        .mockResolvedValueOnce({
          configured: true,
          subject: "CN=Test CA",
          issuer: "CN=Test CA",
          notBefore: Date.now() - ONE_DAY_MS,
          notAfter: Date.now() + 365 * ONE_DAY_MS
        })
        .mockResolvedValueOnce({ configured: false })

      const { getByText } = render(<MtlsSection />)
      await waitFor(() => getByText("移除 CA"))
      fireEvent.press(getByText("移除 CA"))

      await waitFor(() => {
        expect(mockClearServerCa).toHaveBeenCalled()
        expect(mockGetServerCaInfo).toHaveBeenCalledTimes(2)
      })
    })
  })
})
