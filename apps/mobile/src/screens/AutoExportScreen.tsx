/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { useState, useCallback, useEffect } from "react"
import { useFocusEffect } from "@react-navigation/native"
import { Text, StyleSheet, Switch, View, ScrollView, Pressable, DeviceEventEmitter, TextInput } from "react-native"
import { FolderOpen, CheckCircle, Share2, AlertTriangle } from "lucide-react-native"
import {
  Container,
  Card,
  SectionTitle,
  Divider,
  FormatSelector,
  ChipGroup,
  RadioDot,
  FloatingSaveIndicator,
  SettingRow,
  Button,
  TimePicker,
  NumericInput
} from "../components"
import { useTheme } from "../hooks/useTheme"
import { useTimeout } from "../hooks/useTimeout"
import { ScreenProps } from "../types/global"
import NativeLocationService from "../services/NativeLocationService"
import {
  ExportFormat,
  EXPORT_FORMATS,
  DEFAULT_FILENAME_TEMPLATE,
  FILENAME_TOKENS,
  filenameTokenValues,
  isValidFilenameTemplate,
  renderFilenamePreview
} from "../utils/exportConverters"
import { fonts } from "../styles/typography"
import { logger } from "../utils/logger"
import { formatExportDateTime, formatBytes } from "../utils/format"
import { showAlert } from "../services/modalService"
import { SAVE_SUCCESS_DISPLAY_MS } from "../constants"

type ExportInterval = "daily" | "weekly" | "monthly"
type ExportMode = "all" | "incremental"

type ExportFile = {
  name: string
  size: number
  lastModified: number
  uri: string
}

const INTERVAL_OPTIONS: readonly { value: ExportInterval; label: string }[] = [
  { value: "daily", label: "每天" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" }
]

const MODE_OPTIONS: { key: ExportMode; label: string; description: string }[] = [
  { key: "all", label: "全部数据", description: "每次导出所有已存储的位置" },
  { key: "incremental", label: "自上次导出以来", description: "仅导出新增位置" }
]

// ISO weekday Mon=1..Sun=7
const WEEKDAY_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "1", label: "周一" },
  { value: "2", label: "周二" },
  { value: "3", label: "周三" },
  { value: "4", label: "周四" },
  { value: "5", label: "周五" },
  { value: "6", label: "周六" },
  { value: "7", label: "周日" }
]

export function AutoExportScreen(_props: ScreenProps) {
  const { colors } = useTheme()
  const [enabled, setEnabled] = useState(false)
  const [format, setFormat] = useState<ExportFormat>("geojson")
  const [interval, setInterval] = useState<ExportInterval>("daily")
  const [mode, setMode] = useState<ExportMode>("all")
  const [directoryUri, setDirectoryUri] = useState<string | null>(null)
  const [lastExport, setLastExport] = useState<number>(0)
  const [nextExport, setNextExport] = useState<number>(0)
  const [fileCount, setFileCount] = useState<number>(0)
  const [retentionCount, setRetentionCount] = useState<number>(10)
  const [retentionInput, setRetentionInput] = useState<string>("10")
  const [lastFileName, setLastFileName] = useState<string | null>(null)
  const [lastRowCount, setLastRowCount] = useState<number>(0)
  const [lastError, setLastError] = useState<string | null>(null)
  const [timeOfDay, setTimeOfDay] = useState<string>("00:00")
  const [weeklyDow, setWeeklyDow] = useState<number>(1)
  const [monthlyDom, setMonthlyDom] = useState<number>(1)
  const [monthlyDomInput, setMonthlyDomInput] = useState<string>("1")
  const [filenameTemplate, setFilenameTemplate] = useState<string>(DEFAULT_FILENAME_TEMPLATE)
  const [filenameTemplateInput, setFilenameTemplateInput] = useState<string>(DEFAULT_FILENAME_TEMPLATE)
  const [deviceModel, setDeviceModel] = useState<string>("")
  const [exportFiles, setExportFiles] = useState<ExportFile[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const successTimeout = useTimeout()

  const loadStatus = useCallback(async () => {
    try {
      const status = await NativeLocationService.getAutoExportStatus()
      setEnabled(status.enabled)
      setFormat((status.format as ExportFormat) || "geojson")
      setInterval((status.interval as ExportInterval) || "daily")
      setMode((status.mode as ExportMode) || "all")
      setDirectoryUri(status.uri)
      setLastExport(status.lastExportTimestamp)
      setNextExport(status.nextExportTimestamp)
      setFileCount(status.fileCount)
      setRetentionCount(status.retentionCount ?? 10)
      setRetentionInput((status.retentionCount ?? 10).toString())
      setLastFileName(status.lastFileName || null)
      setLastRowCount(status.lastRowCount ?? 0)
      setLastError(status.lastError || null)
      setTimeOfDay(status.timeOfDay || "00:00")
      setWeeklyDow(status.weeklyDow || 1)
      setMonthlyDom(status.monthlyDom || 1)
      setMonthlyDomInput((status.monthlyDom || 1).toString())
      setFilenameTemplate(status.filenameTemplate || DEFAULT_FILENAME_TEMPLATE)
      setFilenameTemplateInput(status.filenameTemplate || DEFAULT_FILENAME_TEMPLATE)
      setDeviceModel(status.deviceModel || "")

      const permissionLost = await NativeLocationService.getSetting("autoExportPermissionLost")
      if (permissionLost === "true") {
        await NativeLocationService.saveSetting("autoExportPermissionLost", "false")
        showAlert(
          "导出目录访问权限丢失",
          "应用失去了导出目录的访问权限。请重新选择目录以恢复自动导出。",
          "warning"
        )
      }
    } catch (error) {
      logger.error("[AutoExportScreen] Failed to load status:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadExportFiles = useCallback(async () => {
    try {
      const files = await NativeLocationService.getExportFiles()
      setExportFiles(files)
    } catch (error) {
      logger.error("[AutoExportScreen] Failed to load export files:", error)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadStatus()
      loadExportFiles()
    }, [loadStatus, loadExportFiles])
  )

  useEffect(() => {
    const listener = DeviceEventEmitter.addListener(
      "onAutoExportComplete",
      (event: { success: boolean; fileName: string | null; rowCount: number; error: string | null }) => {
        if (event.success) {
          setLastFileName(event.fileName)
          setLastRowCount(event.rowCount)
          setLastError(null)
          showAlert("导出完成", `已将 ${event.rowCount} 个位置导出到 ${event.fileName}`, "success")
        } else {
          setLastError(event.error)
          showAlert("导出失败", event.error || "未知错误", "error")
        }
        loadStatus()
        loadExportFiles()
      }
    )
    return () => listener.remove()
  }, [loadStatus, loadExportFiles])

  const saveSetting = useCallback(
    async (key: string, value: string) => {
      setSaving(true)
      try {
        await NativeLocationService.saveSetting(key, value)
        setSaving(false)
        setSaveSuccess(true)
        successTimeout.set(() => setSaveSuccess(false), SAVE_SUCCESS_DISPLAY_MS)
      } catch (error) {
        setSaving(false)
        logger.error("[AutoExportScreen] Save failed:", error)
          showAlert("错误", "保存设置失败，请重试。", "error")
      }
    },
    [successTimeout]
  )

  const handleToggle = useCallback(
    async (value: boolean) => {
      if (value && !directoryUri) {
        showAlert("未选择目录", "请先选择导出目录。", "info")
        return
      }

      try {
        await NativeLocationService.saveSetting("autoExportEnabled", value.toString())

        if (value) {
          await NativeLocationService.scheduleAutoExport()
        } else {
          await NativeLocationService.cancelAutoExport()
        }

        setEnabled(value)
        await loadStatus()
      } catch (error) {
        logger.error("[AutoExportScreen] Toggle failed:", error)
        await loadStatus()
        showAlert("错误", "更新自动导出计划失败，请检查导出目录。", "error")
      }
    },
    [directoryUri, loadStatus]
  )

  const handleFormatChange = useCallback(
    async (newFormat: ExportFormat) => {
      setFormat(newFormat)
      await saveSetting("autoExportFormat", newFormat)
    },
    [saveSetting]
  )

  const reschedule = useCallback(async () => {
    if (!enabled) return
    try {
      await NativeLocationService.rescheduleAutoExport()
    } catch (error) {
      logger.error("[AutoExportScreen] Reschedule failed:", error)
      showAlert("错误", "重新安排自动导出失败，请重试。", "error")
    }
  }, [enabled])

  const handleIntervalChange = useCallback(
    async (newInterval: ExportInterval) => {
      setInterval(newInterval)
      await saveSetting("autoExportInterval", newInterval)
      await reschedule()
      await loadStatus()
    },
    [saveSetting, loadStatus, reschedule]
  )

  const handleModeChange = useCallback(
    async (newMode: ExportMode) => {
      setMode(newMode)
      await saveSetting("autoExportMode", newMode)
    },
    [saveSetting]
  )

  const handleTimeChange = useCallback(
    async (newTime: string) => {
      setTimeOfDay(newTime)
      await saveSetting("autoExportTimeOfDay", newTime)
      await reschedule()
      await loadStatus()
    },
    [saveSetting, loadStatus, reschedule]
  )

  const handleWeeklyDowChange = useCallback(
    async (newDow: string) => {
      const dow = parseInt(newDow, 10)
      setWeeklyDow(dow)
      await saveSetting("autoExportWeeklyDow", newDow)
      await reschedule()
      await loadStatus()
    },
    [saveSetting, loadStatus, reschedule]
  )

  const handleMonthlyDomChange = useCallback((text: string) => {
    setMonthlyDomInput(text.replace(/\D/g, ""))
  }, [])

  const handleMonthlyDomBlur = useCallback(async () => {
    const parsed = parseInt(monthlyDomInput, 10)
    const dom = isNaN(parsed) ? monthlyDom : Math.max(1, Math.min(31, parsed))
    setMonthlyDom(dom)
    setMonthlyDomInput(dom.toString())
    await saveSetting("autoExportMonthlyDom", dom.toString())
    await reschedule()
    await loadStatus()
  }, [monthlyDomInput, monthlyDom, saveSetting, loadStatus, reschedule])

  const handleFilenameTemplateChange = useCallback((text: string) => {
    setFilenameTemplateInput(text)
  }, [])

  const handleFilenameTemplateBlur = useCallback(async () => {
    const next = filenameTemplateInput.trim()
    if (next === filenameTemplate) return
    if (!isValidFilenameTemplate(next)) {
      setFilenameTemplateInput(filenameTemplate)
      showAlert(
        "模板无效",
        "模板必须包含 colota_export、{date} 和 {time}。这些标记用于识别导出文件，日期和时间可确保文件名唯一并正确排序，且区分大小写。",
        "warning"
      )
      return
    }
    setFilenameTemplate(next)
    setFilenameTemplateInput(next)
    await saveSetting("autoExportFilenameTemplate", next)
    // The file list and count are matched against the template natively, so both go stale here.
    await loadStatus()
    await loadExportFiles()
  }, [filenameTemplateInput, filenameTemplate, saveSetting, loadStatus, loadExportFiles])

  const handleRetentionChange = useCallback((text: string) => {
    setRetentionInput(text.replace(/\D/g, ""))
  }, [])

  const handleRetentionBlur = useCallback(async () => {
    const parsed = parseInt(retentionInput, 10)
    const count = isNaN(parsed) ? retentionCount : Math.max(0, parsed)
    setRetentionCount(count)
    setRetentionInput(count.toString())
    await saveSetting("autoExportRetentionCount", count.toString())
  }, [retentionInput, retentionCount, saveSetting])

  const handlePickDirectory = useCallback(async () => {
    try {
      const uri = await NativeLocationService.pickExportDirectory()
      if (uri) {
        setDirectoryUri(uri)
        await saveSetting("autoExportUri", uri)
        loadExportFiles()
      }
    } catch (error) {
      logger.error("[AutoExportScreen] Directory pick failed:", error)
      showAlert("错误", "选择目录失败。", "error")
    }
  }, [saveSetting, loadExportFiles])

  const handleExportNow = useCallback(async () => {
    if (!directoryUri) {
      showAlert("未选择目录", "请先选择导出目录。", "info")
      return
    }
    setExporting(true)
    try {
      await NativeLocationService.runAutoExportNow()
      showAlert("已开始导出", "导出正在后台运行，完成后状态会更新。", "info")
    } catch (error) {
      logger.error("[AutoExportScreen] Export now failed:", error)
      showAlert("错误", "启动导出失败。", "error")
    } finally {
      setExporting(false)
    }
  }, [directoryUri])

  const handleShareFile = useCallback(async (file: ExportFile) => {
    const ext = file.name.split(".").pop() || ""
    const formatKey = Object.keys(EXPORT_FORMATS).find(
      (k) => EXPORT_FORMATS[k as ExportFormat].extension === `.${ext}`
    ) as ExportFormat | undefined
    const mimeType = formatKey ? EXPORT_FORMATS[formatKey].mimeType : "application/octet-stream"

    try {
      await NativeLocationService.shareExportFile(file.uri, mimeType)
    } catch (error) {
      logger.error("[AutoExportScreen] Share failed:", error)
      showAlert("错误", "分享文件失败。", "error")
    }
  }, [])

  if (loading)
    return (
      <Container>
        <View />
      </Container>
    )

  const tokenValues = filenameTokenValues(deviceModel)

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            按计划自动导出位置数据
          </Text>
        </View>

        {/* Enable Toggle */}
        <Card>
          <SettingRow
            label="启用自动导出"
            hint={enabled ? "已安排自动导出" : "自动导出已禁用"}
          >
            <Switch
              value={enabled}
              onValueChange={handleToggle}
              trackColor={{ false: colors.border, true: colors.primary + "80" }}
              thumbColor={enabled ? colors.primary : colors.border}
            />
          </SettingRow>
        </Card>

        {/* Export Directory */}
        <View style={styles.section}>
          <SectionTitle>导出目录</SectionTitle>
          <Card>
            <Pressable
              style={({ pressed }) => [styles.directoryRow, pressed && { opacity: colors.pressedOpacity }]}
              onPress={handlePickDirectory}
            >
              <FolderOpen size={22} color={colors.primary} />
              <View style={styles.directoryContent}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>
                  {directoryUri ? "已选择目录" : "选择目录"}
                </Text>
                <Text style={[styles.settingDescription, { color: colors.textSecondary }]} numberOfLines={1}>
                  {directoryUri
                    ? decodeURIComponent(directoryUri.split("%3A").pop() || directoryUri)
                    : "点击选择文件保存位置"}
                </Text>
              </View>
              {directoryUri && <CheckCircle size={18} color={colors.success} />}
            </Pressable>
          </Card>
        </View>

        {/* Format */}
        <View style={styles.section}>
          <SectionTitle>格式</SectionTitle>
          <Card>
            <FormatSelector selectedFormat={format} onSelectFormat={handleFormatChange} />
          </Card>
        </View>

        {/* File Name */}
        <View style={styles.section}>
          <SectionTitle>文件名</SectionTitle>
          <Card>
            <TextInput
              style={[styles.templateInput, { color: colors.text, borderColor: colors.border }]}
              value={filenameTemplateInput}
              onChangeText={handleFilenameTemplateChange}
              onBlur={handleFilenameTemplateBlur}
              placeholder={DEFAULT_FILENAME_TEMPLATE}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {FILENAME_TOKENS.map((token) => (
              <View key={token} style={styles.templateTokenRow}>
                <Text style={[styles.templateToken, { color: colors.text }]}>{`{${token}}`}</Text>
                <Text style={[styles.templateHint, { color: colors.textSecondary }]}>{tokenValues[token]}</Text>
              </View>
            ))}
            <Text style={[styles.templateHint, { color: colors.textSecondary }]}>
              必须包含 colota_export、{"{date}"} 和 {"{time}"}。扩展名会自动添加。
            </Text>
            <Text style={[styles.templatePreview, { color: colors.textSecondary }]}>
              预览：{" "}
              {renderFilenamePreview(
                isValidFilenameTemplate(filenameTemplateInput) ? filenameTemplateInput : filenameTemplate,
                format,
                deviceModel
              )}
            </Text>
          </Card>
        </View>

        {/* Frequency */}
        <View style={styles.section}>
          <SectionTitle>频率</SectionTitle>
          <Card>
            <ChipGroup options={INTERVAL_OPTIONS} selected={interval} onSelect={handleIntervalChange} colors={colors} />
            {interval === "weekly" && (
              <>
                <Divider />
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>星期</Text>
                <ChipGroup
                  options={WEEKDAY_OPTIONS}
                  selected={weeklyDow.toString()}
                  onSelect={handleWeeklyDowChange}
                  colors={colors}
                />
              </>
            )}
            {interval === "monthly" && (
              <>
                <Divider />
                <NumericInput
                  testID="numeric-input-Day of month"
                  label="每月日期"
                  value={monthlyDomInput}
                  onChange={handleMonthlyDomChange}
                  onBlur={handleMonthlyDomBlur}
                  unit="日"
                  placeholder="1"
                  min={1}
                  colors={colors}
                  hint="1-31。较短月份将使用该月最后一天。"
                />
              </>
            )}
            <Divider />
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>时间（24 小时制）</Text>
            <TimePicker value={timeOfDay} onChange={handleTimeChange} colors={colors} />
          </Card>
        </View>

        {/* Export Range */}
        <View style={styles.section}>
          <SectionTitle>导出范围</SectionTitle>
          <Card>
            {MODE_OPTIONS.map((option, i) => (
              <View key={option.key}>
                {i > 0 && <Divider />}
                <Pressable
                  style={({ pressed }) => [styles.modeRow, pressed && { opacity: colors.pressedOpacity }]}
                  onPress={() => handleModeChange(option.key)}
                >
                  <View style={styles.modeContent}>
                    <Text style={[styles.settingLabel, { color: mode === option.key ? colors.primary : colors.text }]}>
                      {option.label}
                    </Text>
                    <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                      {option.description}
                    </Text>
                  </View>
                  <RadioDot selected={mode === option.key} />
                </Pressable>
              </View>
            ))}
          </Card>
        </View>

        {/* File Retention */}
        <View style={styles.section}>
          <SectionTitle>文件保留</SectionTitle>
          <Card>
            <NumericInput
              testID="numeric-input-Files to keep"
              label="保留文件数"
              value={retentionInput}
              onChange={handleRetentionChange}
              onBlur={handleRetentionBlur}
              unit="个文件"
              placeholder="10"
              min={0}
              colors={colors}
              hint={
                filenameTemplate.includes("{device}")
                  ? "设置为 0 表示不限数量。仅统计以此设备型号命名的导出文件，不影响同目录中的其他设备。"
                  : "设置为 0 表示不限数量。统计目录中的所有 Colota 导出文件。可在文件名中添加 {device} 以按设备分别保留。"
              }
            />
          </Card>
        </View>

        {/* Status */}
        <View style={styles.section}>
          <SectionTitle>状态</SectionTitle>
          <Card>
            <View style={styles.statusRow}>
              <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>上次导出</Text>
              <Text style={[styles.statusValue, { color: colors.text }]}>{formatExportDateTime(lastExport)}</Text>
            </View>
            {lastFileName && (
              <>
                <Divider />
                <View style={styles.statusRow}>
                  <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>上次文件</Text>
                  <Text style={[styles.statusValue, { color: colors.text }]} numberOfLines={1}>
                    {lastFileName}
                  </Text>
                </View>
                <Divider />
                <View style={styles.statusRow}>
                  <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>导出位置数</Text>
                  <Text style={[styles.statusValue, { color: colors.text }]}>{lastRowCount}</Text>
                </View>
              </>
            )}
            {lastError ? (
              <>
                <Divider />
                <View style={styles.errorRow}>
                  <AlertTriangle size={14} color={colors.error} />
                  <Text style={[styles.errorText, { color: colors.error }]} numberOfLines={2}>
                    {lastError}
                  </Text>
                </View>
              </>
            ) : null}
            {enabled && nextExport > 0 && (
              <>
                <Divider />
                <View style={styles.statusRow}>
                  <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>下次导出</Text>
                  <Text style={[styles.statusValue, { color: colors.text }]}>{formatExportDateTime(nextExport)}</Text>
                </View>
              </>
            )}
            {directoryUri && (
              <>
                <Divider />
                <View style={styles.statusRow}>
                  <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>导出文件数</Text>
                  <Text style={[styles.statusValue, { color: colors.text }]}>{fileCount}</Text>
                </View>
              </>
            )}
          </Card>
        </View>

        {/* Export Now */}
        {directoryUri && (
          <View style={styles.section}>
            <Button
              title={exporting ? "导出中..." : "立即导出"}
              onPress={handleExportNow}
              disabled={exporting}
              loading={exporting}
            />
          </View>
        )}

        {/* Export History */}
        {exportFiles.length > 0 && (
          <View style={styles.section}>
            <SectionTitle>导出历史</SectionTitle>
            <Card>
              {exportFiles.map((file, i) => (
                <View key={file.name}>
                  {i > 0 && <Divider />}
                  <View style={styles.fileRow}>
                    <View style={styles.fileInfo}>
                      <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
                        {file.name}
                      </Text>
                      <Text style={[styles.fileMeta, { color: colors.textSecondary }]}>
                        {formatBytes(file.size)} - {formatExportDateTime(file.lastModified)}
                      </Text>
                    </View>
                    <Pressable
                      style={({ pressed }) => [styles.shareButton, pressed && { opacity: 0.5 }]}
                      onPress={() => handleShareFile(file)}
                    >
                      <Share2 size={18} color={colors.primary} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </Card>
          </View>
        )}
      </ScrollView>
      <FloatingSaveIndicator saving={saving} success={saveSuccess} colors={colors} />
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40
  },
  header: {
    marginTop: 20,
    marginBottom: 20
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20
  },
  section: {
    marginTop: 24
  },
  settingLabel: {
    fontSize: 16,
    ...fonts.semiBold,
    marginBottom: 2
  },
  settingDescription: {
    fontSize: 13,
    ...fonts.regular
  },
  directoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4
  },
  directoryContent: {
    flex: 1
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4
  },
  statusLabel: {
    fontSize: 14,
    ...fonts.regular
  },
  statusValue: {
    fontSize: 14,
    ...fonts.semiBold,
    flexShrink: 1,
    textAlign: "right",
    marginLeft: 12
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6
  },
  errorText: {
    fontSize: 13,
    ...fonts.regular,
    flex: 1
  },
  modeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10
  },
  modeContent: {
    flex: 1,
    marginRight: 16
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8
  },
  fileInfo: {
    flex: 1,
    marginRight: 12
  },
  fileName: {
    fontSize: 13,
    ...fonts.semiBold,
    marginBottom: 2
  },
  fileMeta: {
    fontSize: 12,
    ...fonts.regular
  },
  shareButton: {
    padding: 8
  },
  fieldLabel: {
    fontSize: 12,
    ...fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 8
  },
  templateInput: {
    fontSize: 15,
    ...fonts.regular,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  templateHint: {
    fontSize: 13,
    ...fonts.regular,
    marginTop: 8
  },
  templateTokenRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8
  },
  templateToken: {
    fontSize: 13,
    ...fonts.semiBold,
    marginTop: 8,
    minWidth: 72
  },
  templatePreview: {
    fontSize: 13,
    ...fonts.semiBold,
    marginTop: 8
  }
})
