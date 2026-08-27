/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { Activity, Database, Globe, Map, MapPin, Table2 } from "lucide-react-native"
import type { LucideIcon } from "lucide-react-native"
import type { ImportFormat } from "../services/ImportService"

// Single source of truth for per-format metadata, shared by the export and import
// screens. `description` is the general blurb shown in both menus;
// `importHint` is an optional import-only caveat appended to
// it on the import screen (where parsing constraints actually matter).
export interface FileFormat {
  label: string
  icon: LucideIcon
  extension: string
  exportable: boolean
  mimeType?: string // present for every exportable format
  subtitle?: string // export picker only
  description: string
  importHint?: string
}

export const FILE_FORMATS: Record<ImportFormat, FileFormat> = {
  geojson: {
    label: "GeoJSON",
    icon: Globe,
    extension: ".geojson",
    exportable: true,
    mimeType: "application/json",
    subtitle: "地理数据",
    description: "适用于 Mapbox、Leaflet、QGIS。最适合备份，可重新导入 Colota 且不会丢失数据。"
  },
  google_timeline_legacy: {
    label: "Google 时间轴（旧版）",
    icon: Database,
    extension: "Records.json",
    exportable: false,
    description:
      "Google Takeout 旧版位置历史批量导出格式。Google 已于 2024 年末从 Takeout 中移除此功能，仅用于已归档的文件。"
  },
  google_timeline_new: {
    label: "Google 时间轴",
    icon: MapPin,
    extension: ".json",
    exportable: false,
    description: "由 Android 设置 -> 位置 -> 位置服务 -> 时间轴在设备上导出的文件。"
  },
  gpx: {
    label: "GPX",
    icon: Activity,
    extension: ".gpx",
    exportable: true,
    mimeType: "application/gpx+xml",
    subtitle: "GPS 交换格式",
    description: "适用于 Garmin、Strava、运动手表和跟踪应用的 GPS 交换格式。"
  },
  kml: {
    label: "KML",
    icon: Map,
    extension: ".kml",
    exportable: true,
    mimeType: "application/vnd.google-earth.kml+xml",
    subtitle: "Keyhole 标记语言",
    description: "Google Earth, Google Maps, ArcGIS.",
    importHint: "仅读取带时间戳的地标；只有 LineString 的轨迹会被跳过。"
  },
  csv: {
    label: "CSV",
    icon: Table2,
    extension: ".csv",
    exportable: true,
    mimeType: "text/csv",
    subtitle: "电子表格格式",
    description: "逗号分隔表格，适用于 Excel、Google Sheets 和数据分析。",
    importHint: "表头必须包含纬度、经度和时间列。"
  }
}

export function importDescription(f: FileFormat): string {
  return f.importHint ? `${f.description} ${f.importHint}` : f.description
}

export const IMPORT_FORMAT_ORDER: ImportFormat[] = [
  "geojson",
  "gpx",
  "kml",
  "google_timeline_new",
  "google_timeline_legacy",
  "csv"
]
