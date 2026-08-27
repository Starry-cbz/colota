/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useEffect, useState } from "react"
import { ScrollView, StyleSheet, Text, View } from "react-native"
import { Download } from "lucide-react-native"
import { fonts } from "../styles/typography"
import { Button, Card, Container, Divider, LoadingOverlay, SectionTitle } from "../components"
import { useTheme } from "../hooks/useTheme"
import NativeLocationService from "../services/NativeLocationService"
import ImportService, { type ImportFormat, type ImportPreview } from "../services/ImportService"
import { showAlert, showChoice } from "../services/modalService"
import { logger } from "../utils/logger"
import { FILE_FORMATS, IMPORT_FORMAT_ORDER, importDescription } from "../utils/fileFormats"
import { ScreenProps } from "../types/global"
import type { ThemeColors } from "../types/global"

const IMPORT_FORMAT_LABELS = Object.fromEntries(
  (Object.keys(FILE_FORMATS) as ImportFormat[]).map((k) => [k, FILE_FORMATS[k].label])
) as Record<ImportFormat, string>

// Warn before queueing this many points - the backend has to absorb one upload per row.
const SYNC_WARN_THRESHOLD = 10_000

const SUPPORTED_FORMATS = IMPORT_FORMAT_ORDER.map((key) => {
  const f = FILE_FORMATS[key]
  return { icon: f.icon, title: f.label, extension: f.extension, description: importDescription(f) }
})

function formatDate(unixSeconds: number | null): string {
  if (unixSeconds == null) return "-"
  return new Date(unixSeconds * 1000).toLocaleDateString()
}

function buildPreviewMessage(preview: ImportPreview): string {
  const lines: string[] = []
  lines.push(`Format: ${IMPORT_FORMAT_LABELS[preview.format]}`)
  lines.push(`Points found: ${preview.totalParsed.toLocaleString()}`)
  if (preview.duplicates > 0) {
    lines.push(`Duplicates skipped: ${preview.duplicates.toLocaleString()}`)
  }
  if (preview.invalid > 0) {
    lines.push(`Invalid: ${preview.invalid.toLocaleString()}`)
  }
  lines.push(`Date range: ${formatDate(preview.dateRangeStartSec)} - ${formatDate(preview.dateRangeEndSec)}`)
  lines.push("")
  lines.push(`Import ${preview.newRows.toLocaleString()} new location${preview.newRows !== 1 ? "s" : ""}?`)
  if (preview.canQueueForSync) {
    lines.push("")
    lines.push('Choose "Import + Queue for Sync" to also upload these to your configured backend.')
    if (preview.newRows >= SYNC_WARN_THRESHOLD) {
      lines.push(
        `Heads up: queueing ${preview.newRows.toLocaleString()} points means ${preview.newRows.toLocaleString()} upload requests against your backend.`
      )
    }
  }
  lines.push("")
  lines.push("Tip: back up your data first (Settings -> Backup & Restore). Imports can't be selectively undone.")
  return lines.join("\n")
}

function importErrorMessage(e: unknown): string {
  const code = (e as { code?: string }).code
  switch (code) {
    case "E_IMPORT_UNSUPPORTED":
      return "无法识别此文件格式。支持 GeoJSON、Google 时间轴、GPX、KML，以及包含纬度/经度/时间列的 CSV。"
    case "E_IMPORT_CANCELLED":
      return "导入已取消。"
    case "E_BUSY":
      return "另一个备份、恢复或导入操作正在进行。"
    case "E_IMPORT_NO_PENDING":
      return "没有可提交的暂存导入，请重新选择文件。"
    case "E_IMPORT_SYNC_UNAVAILABLE":
      return "未配置同步（离线模式或端点为空）。请在不启用同步的情况下导入，或先在设置中配置同步。"
    default:
      return e instanceof Error ? e.message : "Import failed."
  }
}

const FormatRow = ({ entry, colors }: { entry: (typeof SUPPORTED_FORMATS)[number]; colors: ThemeColors }) => {
  const Icon = entry.icon
  return (
    <View style={styles.formatRow}>
      <Icon size={22} color={colors.textLight} />
      <View style={styles.formatTextContent}>
        <View style={styles.formatTitleRow}>
          <Text style={[styles.formatTitle, { color: colors.text }]}>{entry.title}</Text>
          <View
            style={[
              styles.extensionBadge,
              { backgroundColor: colors.primary + "15", borderColor: colors.primary + "30" }
            ]}
          >
            <Text style={[styles.extensionText, { color: colors.primaryDark }]}>{entry.extension}</Text>
          </View>
        </View>
        <Text style={[styles.formatDescription, { color: colors.textLight }]}>{entry.description}</Text>
      </View>
    </View>
  )
}

export function ImportLocationsScreen({}: ScreenProps) {
  const { colors } = useTheme()
  const [busy, setBusy] = useState(false)
  const [progressLabel, setProgressLabel] = useState<string>("")
  const [totalLocations, setTotalLocations] = useState(0)

  const loadStats = useCallback(async () => {
    try {
      const stats = await NativeLocationService.getStats()
      setTotalLocations(stats.total ?? 0)
    } catch (error) {
      logger.error("[ImportLocationsScreen] Failed to load stats:", error)
    }
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const handleChooseFile = useCallback(async () => {
    let source: { uri: string; displayName: string | null } | null = null
    try {
      source = await ImportService.pickImportSource()
    } catch (err) {
      logger.error("[ImportLocationsScreen] pickImportSource failed:", err)
      showAlert("选择器错误", "无法打开文件选择器。", "error")
      return
    }
    if (!source) return

    setBusy(true)
    setProgressLabel("Parsing file...")
    let preview: ImportPreview
    try {
      preview = await ImportService.importLocationsFromFile(source.uri)
    } catch (err) {
      logger.error("[ImportLocationsScreen] importLocationsFromFile failed:", err)
      setBusy(false)
      setProgressLabel("")
      showAlert("导入失败", importErrorMessage(err), "error")
      return
    }

    if (preview.newRows === 0) {
      await ImportService.cancelImport().catch(() => {})
      setBusy(false)
      setProgressLabel("")
      const title = preview.totalParsed === 0 ? "Nothing to import" : "Already imported"
      const message =
        preview.totalParsed === 0
          ? "No locations were found in this file."
          : `All ${preview.duplicates.toLocaleString()} points in this file are already in your history.`
      showAlert(title, message, "info")
      return
    }

    setProgressLabel("")

    const buttons: Array<{ text: string; style?: "primary" | "secondary" | "destructive" }> = [
      { text: "取消", style: "secondary" },
      { text: "Import", style: "primary" }
    ]
    if (preview.canQueueForSync) {
      // Destructive: queueing fires uploads to the backend, can't be undone server-side.
      buttons.push({ text: "Import + Queue for Sync", style: "destructive" })
    }

    const choice = await showChoice({
      title: "导入位置？",
      message: buildPreviewMessage(preview),
      variant: "info",
      buttons
    })

    if (choice === 0) {
      await ImportService.cancelImport().catch(() => {})
      setBusy(false)
      return
    }
    const asQueued = choice === 2

    setProgressLabel(
      asQueued
        ? `Importing ${preview.newRows.toLocaleString()} locations and queueing for sync...`
        : `Importing ${preview.newRows.toLocaleString()} locations...`
    )
    try {
      const inserted = await ImportService.commitImport(asQueued)
      await loadStats()
      showAlert(
        "导入完成",
        asQueued
          ? `Imported ${inserted.toLocaleString()} location${inserted !== 1 ? "s" : ""} and queued for sync to your backend.`
          : `Imported ${inserted.toLocaleString()} location${inserted !== 1 ? "s" : ""}.`,
        "success"
      )
    } catch (err) {
      logger.error("[ImportLocationsScreen] commitImport failed:", err)
      showAlert("导入失败", importErrorMessage(err), "error")
    } finally {
      setBusy(false)
      setProgressLabel("")
    }
  }, [loadStats])

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Stats Card */}
        <View style={[styles.statsContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>位置总数</Text>
              <Text style={[styles.statValue, { color: colors.primaryDark }]}>{totalLocations.toLocaleString()}</Text>
            </View>
          </View>
        </View>

        {/* Supported formats */}
        <View style={styles.section}>
          <SectionTitle>支持的格式</SectionTitle>
          <Card>
            {SUPPORTED_FORMATS.map((entry, i) => (
              <React.Fragment key={entry.title}>
                {i > 0 && <Divider />}
                <FormatRow entry={entry} colors={colors} />
              </React.Fragment>
            ))}
          </Card>
        </View>

        {/* Import action */}
        <View style={styles.section}>
          <SectionTitle>从文件导入</SectionTitle>
          <Card>
            <Text style={[styles.intro, { color: colors.textSecondary }]}>
              Merge location history from external files into your Colota database. Duplicates are skipped
              automatically.
            </Text>
            <Text style={[styles.intro, { color: colors.textSecondary }]}>
              Imported rows are flagged as already replicated by default, so they stay local. If you've configured an
              optional sync backend, the confirm dialog also offers to queue them for upload.
            </Text>
            <Button onPress={handleChooseFile} disabled={busy} title="选择文件" icon={Download} />
          </Card>
        </View>
      </ScrollView>

      <LoadingOverlay visible={busy} title="正在导入" message={progressLabel} />
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40
  },
  statsContainer: {
    borderRadius: 16,
    borderWidth: 2,
    marginBottom: 24,
    overflow: "hidden"
  },
  statsGrid: {
    flexDirection: "row",
    padding: 20
  },
  statItem: {
    flex: 1,
    alignItems: "center"
  },
  statLabel: {
    fontSize: 12,
    ...fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8
  },
  statValue: {
    fontSize: 20,
    ...fonts.bold,
    letterSpacing: -0.5,
    textAlign: "center"
  },
  section: {
    marginBottom: 24
  },
  intro: {
    marginBottom: 12,
    fontSize: 14,
    lineHeight: 20
  },
  formatRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 16
  },
  formatTextContent: {
    flex: 1
  },
  formatTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
    flexWrap: "wrap"
  },
  formatTitle: {
    fontSize: 15,
    ...fonts.semiBold,
    letterSpacing: -0.2
  },
  extensionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1
  },
  extensionText: {
    fontSize: 10,
    ...fonts.bold,
    letterSpacing: 0.3
  },
  formatDescription: {
    fontSize: 12,
    lineHeight: 16
  }
})
