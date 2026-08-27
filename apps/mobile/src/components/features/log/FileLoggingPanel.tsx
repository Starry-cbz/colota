/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useEffect, useState } from "react"
import { View, Text, Switch, StyleSheet, ScrollView, ActivityIndicator } from "react-native"
import { Card, Divider, SectionTitle } from "../../index"
import { Button } from "../../ui/Button"
import { useTheme } from "../../../hooks/useTheme"
import { fonts, fontSizes } from "../../../styles/typography"
import NativeLocationService from "../../../services/NativeLocationService"
import { logger } from "../../../utils/logger"
import { showAlert, showChoice } from "../../../services/modalService"
import { formatBytes } from "../../../utils/format"

export function FileLoggingPanel() {
  const { colors } = useTheme()
  const [enabled, setEnabled] = useState(false)
  const [sizeBytes, setSizeBytes] = useState(0)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const refreshSize = useCallback(async () => {
    try {
      const size = await NativeLocationService.getFileLogSize()
      setSizeBytes(size)
    } catch (err) {
      logger.error("[FileLoggingPanel] getFileLogSize failed:", err)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const enabledStr = await NativeLocationService.getSetting("debugFileLoggingEnabled", "false")
        if (cancelled) return
        setEnabled(enabledStr === "true")
        await refreshSize()
      } catch (err) {
        logger.error("[FileLoggingPanel] initial load failed:", err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshSize])

  // Size grows in the background while logging is on - poll while panel is visible.
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(refreshSize, 3000)
    return () => clearInterval(id)
  }, [enabled, refreshSize])

  const handleToggle = useCallback(async (value: boolean) => {
    setEnabled(value)
    try {
      await NativeLocationService.setFileLoggingEnabled(value)
    } catch (err) {
      logger.error("[FileLoggingPanel] setFileLoggingEnabled failed:", err)
      setEnabled(!value)
    }
  }, [])

  const handleExport = useCallback(async () => {
    setBusy(true)
    try {
      const treeUri = await NativeLocationService.pickExportDirectory()
      if (!treeUri) return
      const docUri = await NativeLocationService.exportFileLogToUri(treeUri)
      if (docUri) {
        showAlert("日志已导出", "已保存到所选目录。", "success")
      } else {
        showAlert("无可导出内容", "目前没有日志条目。", "info")
      }
    } catch (err) {
      logger.error("[FileLoggingPanel] export failed:", err)
      showAlert("导出失败", err instanceof Error ? err.message : "无法保存日志文件。", "error")
    } finally {
      setBusy(false)
    }
  }, [])

  const handleClear = useCallback(async () => {
    const choice = await showChoice({
      title: "清除日志文件？",
      message: "所有持久化日志条目都将被删除，且无法撤销。",
      variant: "warning",
      buttons: [
        { text: "取消", style: "secondary" },
        { text: "清除", style: "destructive" }
      ]
    })
    if (choice !== 1) return

    setBusy(true)
    try {
      await NativeLocationService.clearFileLog()
      await refreshSize()
    } catch (err) {
      logger.error("[FileLoggingPanel] clearFileLog failed:", err)
      showAlert("清除失败", "无法删除日志文件。", "error")
    } finally {
      setBusy(false)
    }
  }, [refreshSize])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <SectionTitle>文件日志</SectionTitle>

      <Card style={styles.card}>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          Save app logs to a file on this device. Useful when a bug takes hours or days to reproduce - the file keeps a
          record even if the app is restarted in between. Files may contain your location coordinates, so only share
          with people you trust.
        </Text>

        <View style={styles.toggleRow}>
          <View style={styles.toggleLabel}>
            <Text style={[styles.label, { color: colors.text }]}>持久化文件日志</Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={handleToggle}
            trackColor={{ false: colors.border, true: colors.primary + "80" }}
            thumbColor={enabled ? colors.primary : colors.border}
          />
        </View>

        <Divider />

        <View style={styles.section}>
          <View style={styles.sizeRow}>
            <Text style={[styles.label, { color: colors.text }]}>当前大小</Text>
            <Text style={[styles.sizeValue, { color: colors.text }]}>{formatBytes(sizeBytes)}</Text>
          </View>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            The log file grows as long as logging is on. Use "Clear log files" to reset it.
          </Text>
        </View>
      </Card>

      <Button title="导出日志文件" onPress={handleExport} loading={busy} />
      <Button title="清除日志文件" variant="danger" onPress={handleClear} disabled={busy || sizeBytes === 0} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: {
    padding: 16,
    paddingBottom: 40
  },
  card: {
    marginBottom: 12
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  intro: {
    marginBottom: 12,
    fontSize: 14,
    lineHeight: 20
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4
  },
  toggleLabel: {
    flex: 1,
    paddingRight: 12
  },
  section: {
    paddingVertical: 4
  },
  label: {
    fontSize: fontSizes.label,
    ...fonts.semiBold,
    marginBottom: 4
  },
  hint: {
    fontSize: 13,
    ...fonts.regular,
    lineHeight: 18,
    marginBottom: 12
  },
  sizeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4
  },
  sizeValue: {
    fontSize: 15,
    ...fonts.medium,
    fontFamily: "monospace"
  }
})
