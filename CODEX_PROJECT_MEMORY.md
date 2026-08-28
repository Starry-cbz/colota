# Colota 项目记忆

## 项目概况

- Colota 是一款以隐私和自托管为核心的 Android GPS 位置追踪应用。
- 主要功能包括位置记录、轨迹与行程查看、地理围栏、离线地图、数据导入导出、定时导出、加密备份及多种后端同步。

## 技术栈与结构

- Monorepo：npm workspaces。
- 移动端：React 19、React Native 0.87、TypeScript。
- 地图：MapLibre React Native。
- Android 原生模块：Kotlin，支持 GMS 和 FOSS 两种构建变体。
- `apps/mobile/`：移动端应用与 Android 原生工程。
- `packages/shared/`：共享包与品牌资源。
- `apps/docs/`：项目文档站。

## 常用命令

- 安装依赖：`npm ci`
- 构建共享包：`npm run build -w @colota/shared`
- 移动端测试：`npm test -w @colota/mobile`
- 移动端 lint：`npm run lint -w @colota/mobile`
- 移动端类型检查：`npx tsc --noEmit -p apps/mobile/tsconfig.json`
- GMS 调试 APK：`npm run android:debug -w @colota/mobile`
- FOSS 调试 APK：`npm run android:debug:foss -w @colota/mobile`

## 当前要求与约定

- 用户界面默认使用简体中文；代码、导航路由键、配置字段及协议名称保留原文。
- 地图上的历史轨迹与当前轨迹使用平滑曲线显示。
- 用户使用的人性化跟踪配置方案采用八级优先级：Android Auto 车载（120）、高速交通（115）、驾车出行（110）、骑行通勤（100）、跑步运动（90）、静止省电（80）、充电增强（70）、步行漫游（60）；多个速度阈值通过优先级形成实际速度区间。配置链接中的中文名称使用 JSON Unicode 转义后再 Base64，避免当前 `atob` 导入链路产生乱码。

## 已完成的重要修改

- 2026-08-27：移动端 React Native 界面、Android 前台服务通知、快捷方式与权限说明已改为简体中文。
- 2026-08-27：`apps/mobile/src/components/features/map/mapUtils.ts` 使用 Catmull-Rom 插值生成平滑轨迹；当前轨迹、历史轨迹和行程详情共用该逻辑，曲线端点严格使用原始 GPS 坐标。
- 曲线专项测试：`npm test -w @colota/mobile -- --runInBand src/components/features/map/__tests__/mapUtils.test.ts`，53 项通过。
- 移动端类型检查通过；移动端 lint 无错误，存在 6 个原有 warning。
- 2026-08-27：`Build Latest Release` 在四个 Release 签名 Secrets 均未配置时，使用仓库内的 `debug.keystore` 为 Release APK 签名，产物可直接安装且不依赖 Metro；Secrets 齐全时仍使用正式签名，部分配置时主动失败。
- 2026-08-28：地图轨迹绘制增加经纬度合法性校验和 500 km 相邻跳点断线保护，避免异常 GPS 修复点绘制跨区域长直线；地图点和自动缩放边界同步忽略无效坐标。
- 2026-08-28：行程详情速度/海拔图表改用平滑三次 Bézier 曲线；图表标题栏新增展开/收起按钮，展开高度为 280，切换行程时自动收起。
- 2026-08-28：定位服务写库协程增加异常捕获、无效 location ID 检查和 `Location saved` 日志；启动配置日志增加 `filterAccuracy`，用于诊断系统获取位置但轨迹未记录的问题。
- 2026-08-28：根据手机日志确认位置 `id=496/497/498` 已写入本地数据库；`offline mode` 会跳过同步队列。活动定位流看门狗已收紧为 1 分钟轮询、至少 2 分钟且 3 个采样间隔无回调后重新注册，适配 8 秒步行配置的后台静默恢复；离线日志明确标注“saved locally only”。
- 2026-08-28：行程详情底部信息区改为可展开底部抽屉，默认显示摘要并覆盖地图下方区域；支持点击“向上展开详情”或拖拽把手展开/收起，展开后可滚动查看统计、平滑图表和导出操作。
- 2026-08-28：汉化后的测试断言与夹具已同步完成，并修复协议值误汉化；完整 Jest 为 57 个套件、995 项测试全部通过，TypeScript 检查通过，lint 无 error（保留 6 个原有 warning）。
- 2026-08-28：修复 `useLocationTracking` 排队重启脱离 Promise 链的问题。排队重启的延时与后续重启现在可由调用方完整等待，非静默完整 Jest 不再出现测试结束后的异步日志。
- 2026-08-28：GitHub Actions 英文 runner 暴露日期时间区域差异：12 小时制输出为英文 `PM`，导致汉化断言失败。`formatTime` 和 `formatDate` 现显式使用 `zh-CN`，确保英文系统上的行程、位置日期时间仍显示中文；CI 模式完整 Jest 995 项通过。

## 注意事项

- 本机 C 盘剩余空间约 212 MB，暂不运行 Gradle/Android 本地构建；Android 编译与 APK 产出交由 GitHub Actions 验证。
- 推送 `main` 会触发 `Android Build Check`；该工作流成功后，`Build Latest Release` 通过 `workflow_run` 自动触发并发布可安装 APK 到 `latest` Release。
- `Build Latest Release` 的安装用途开发签名与正式发布签名不同；以后若改用正式签名，手机上已安装的开发签名版本需先卸载才能安装正式签名版本。
