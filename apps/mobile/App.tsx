/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React, { useMemo, useState, useCallback } from "react"
import { NavigationContainer, NavigationContainerRef } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { View, StatusBar, Platform, StyleSheet } from "react-native"
import { ThemeProvider, useTheme } from "./src/hooks/useTheme"
import { fonts } from "./src/styles/typography"
import { TrackingProvider } from "./src/contexts/TrackingProvider"
import { ErrorBoundary } from "./src/components/ui/ErrorBoundary"
import type { RootStackParamList, RootStackRoute } from "./src/types/navigation"
import {
  ActivityLogScreen,
  DashboardScreen,
  SettingsScreen,
  ApiSettingsScreen,
  AuthSettingsScreen,
  MtlsSettingsScreen,
  AutoExportScreen,
  GeofenceScreen,
  GeofenceEditorScreen,
  DataManagementScreen,
  LocationHistoryScreen,
  LocationSummaryScreen,
  ExportLocationsScreen,
  ImportLocationsScreen,
  AboutScreen,
  TrackingProfilesScreen,
  ProfileEditorScreen,
  SetupImportScreen,
  ShareSetupScreen,
  TripDetailScreen,
  OfflineMapsScreen,
  AppearanceScreen,
  ConnectionScreen,
  TrackingSyncScreen,
  BackupRestoreScreen
} from "./src/screens/"
import { BottomTabBar } from "./src/components"
import { loadDisplayPreferences } from "./src/utils/geo"
import { registerTileServerUserAgent } from "./src/utils/tileHeaders"

// Load display preferences early
loadDisplayPreferences()

registerTileServerUserAgent()

const Stack = createNativeStackNavigator<RootStackParamList>()

type ScreenConfig = { name: RootStackRoute; component: React.ComponentType<any>; title: string }

const SCREEN_CONFIG: readonly ScreenConfig[] = [
  {
    name: "Dashboard",
    component: DashboardScreen,
    title: "首页"
  },
  {
    name: "Settings",
    component: SettingsScreen,
    title: "设置"
  },
  {
    name: "API Config",
    component: ApiSettingsScreen,
    title: "API 配置"
  },
  {
    name: "Auth Settings",
    component: AuthSettingsScreen,
    title: "身份验证"
  },
  {
    name: "mTLS Settings",
    component: MtlsSettingsScreen,
    title: "mTLS 设置"
  },
  {
    name: "Geofences",
    component: GeofenceScreen,
    title: "地理围栏"
  },
  {
    name: "Geofence Editor",
    component: GeofenceEditorScreen,
    title: "编辑地理围栏"
  },
  {
    name: "Location History",
    component: LocationHistoryScreen,
    title: "位置历史"
  },
  {
    name: "Location Summary",
    component: LocationSummaryScreen,
    title: "汇总"
  },
  {
    name: "Export Locations",
    component: ExportLocationsScreen,
    title: "导出位置"
  },
  {
    name: "Import Locations",
    component: ImportLocationsScreen,
    title: "导入位置"
  },
  {
    name: "Auto-Export",
    component: AutoExportScreen,
    title: "自动导出"
  },
  {
    name: "Data Management",
    component: DataManagementScreen,
    title: "数据管理"
  },
  {
    name: "Tracking Profiles",
    component: TrackingProfilesScreen,
    title: "跟踪配置方案"
  },
  {
    name: "Profile Editor",
    component: ProfileEditorScreen,
    title: "编辑配置方案"
  },
  {
    name: "About Colota",
    component: AboutScreen,
    title: "关于 Colota"
  },
  {
    name: "Setup Import",
    component: SetupImportScreen,
    title: "导入配置"
  },
  {
    name: "Share Setup",
    component: ShareSetupScreen,
    title: "分享配置"
  },
  {
    name: "Trip Detail",
    component: TripDetailScreen,
    title: "行程详情"
  },
  {
    name: "Offline Maps",
    component: OfflineMapsScreen,
    title: "离线地图"
  },
  {
    name: "Logging",
    component: ActivityLogScreen,
    title: "日志"
  },
  {
    name: "Backup & Restore",
    component: BackupRestoreScreen,
    title: "备份与恢复"
  },
  {
    name: "Appearance",
    component: AppearanceScreen,
    title: "外观"
  },
  {
    name: "Connection",
    component: ConnectionScreen,
    title: "连接"
  },
  {
    name: "Tracking & Sync",
    component: TrackingSyncScreen,
    title: "跟踪与同步"
  }
]

const TAB_SCREEN_NAMES = new Set(["Dashboard", "Location History", "Geofences", "Settings"])

function AppNavigator() {
  const { colors, isDark } = useTheme()
  const [currentRoute, setCurrentRoute] = useState<string | undefined>("Dashboard")
  const screenOptions = useMemo(
    () => ({
      headerStyle: {
        backgroundColor: colors.background,
        elevation: 0,
        shadowOpacity: 0
      },
      headerTintColor: colors.text,
      headerTitleStyle: {
        ...fonts.bold,
        fontSize: 18,
        color: colors.text
      },
      headerTitleAlign: "left" as const,
      headerBackTitleVisible: false,
      ...(Platform.OS === "android" && {
        animation: "slide_from_right" as const
      })
    }),
    [colors]
  )
  const statusBarConfig = useMemo(
    () => ({
      barStyle: isDark ? ("light-content" as const) : ("dark-content" as const),
      backgroundColor: colors.background,
      translucent: false,
      animated: true
    }),
    [colors.background, isDark]
  )
  const linking = useMemo(
    () => ({
      prefixes: ["colota://"],
      config: {
        screens: {
          "Setup Import": "setup"
        }
      }
    }),
    []
  )

  const navigationRef = React.useRef<NavigationContainerRef<Record<string, undefined>>>(null)

  const handleStateChange = useCallback(() => {
    const route = navigationRef.current?.getCurrentRoute()
    if (route) setCurrentRoute(route.name)
  }, [])

  const handleTabNavigate = useCallback((route: string) => {
    const nav = navigationRef.current
    if (!nav) return
    const current = nav.getCurrentRoute()?.name
    if (current === route) return
    nav.navigate(route as never)
  }, [])

  return (
    <SafeAreaProvider>
      <StatusBar {...statusBarConfig} />
      <NavigationContainer linking={linking} ref={navigationRef} onStateChange={handleStateChange}>
        <View style={styles.flex}>
          <Stack.Navigator initialRouteName="Dashboard" screenOptions={screenOptions}>
            {SCREEN_CONFIG.map((screen) => (
              <Stack.Screen
                key={screen.name}
                name={screen.name}
                component={screen.component}
                options={{
                  headerTitle: screen.title,
                  ...(TAB_SCREEN_NAMES.has(screen.name) && { headerBackVisible: false })
                }}
              />
            ))}
          </Stack.Navigator>
          <BottomTabBar currentRoute={currentRoute} onNavigate={handleTabNavigate} />
        </View>
      </NavigationContainer>
    </SafeAreaProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <TrackingProvider>
          <AppNavigator />
        </TrackingProvider>
      </ErrorBoundary>
    </ThemeProvider>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 }
})
