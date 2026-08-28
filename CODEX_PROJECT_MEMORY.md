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

## 已完成的重要修改

- 2026-08-27：移动端 React Native 界面、Android 前台服务通知、快捷方式与权限说明已改为简体中文。
- 2026-08-27：`apps/mobile/src/components/features/map/mapUtils.ts` 使用 Catmull-Rom 插值生成平滑轨迹；当前轨迹、历史轨迹和行程详情共用该逻辑，曲线端点严格使用原始 GPS 坐标。
- 曲线专项测试：`npm test -w @colota/mobile -- --runInBand src/components/features/map/__tests__/mapUtils.test.ts`，53 项通过。
- 移动端类型检查通过；移动端 lint 无错误，存在 6 个原有 warning。
- 2026-08-27：`Build Latest Release` 在四个 Release 签名 Secrets 均未配置时，使用仓库内的 `debug.keystore` 为 Release APK 签名，产物可直接安装且不依赖 Metro；Secrets 齐全时仍使用正式签名，部分配置时主动失败。
- 2026-08-28：地图轨迹绘制增加经纬度合法性校验和 500 km 相邻跳点断线保护，避免异常 GPS 修复点绘制跨区域长直线；地图点和自动缩放边界同步忽略无效坐标。
- 2026-08-28：行程详情速度/海拔图表改用平滑三次 Bézier 曲线；图表标题栏新增展开/收起按钮，展开高度为 280，切换行程时自动收起。
- 2026-08-28：定位服务写库协程增加异常捕获、无效 location ID 检查和 `Location saved` 日志；启动配置日志增加 `filterAccuracy`，用于诊断系统获取位置但轨迹未记录的问题。

## 注意事项

- 全量 Jest 测试中的大量测试仍断言旧英文 UI 文案；汉化后结果为 23 个套件通过、34 个套件失败，主要需要同步更新测试断言。曲线逻辑专项测试已通过。
- Android GMS Kotlin 编译未完成：下载 `kotlin-compiler-embeddable-2.2.0.jar` 时因 C 盘空间不足失败，尚未验证原生编译。
- 2026-08-28：再次运行 `testGmsDebugUnitTest --tests com.Colota.service.LocationForegroundServiceTest` 时因 C 盘仅剩约 83 MB，Gradle 无法生成 `gradle-api-9.4.1.jar`；需释放空间后重试。
- 失败的 Android 编译新增了约 406 MB Gradle 缓存：`C:\Users\Administrator\.gradle\wrapper\dists\gradle-9.4.1-bin`（约 146 MB）和 `C:\Users\Administrator\.gradle\caches\9.4.1`（约 260 MB）。Gradle 守护进程已停止，但 Codex 环境策略阻止删除工作区外目录，需要手动清理或释放更多空间后再编译。
- `Build Latest Release` 的安装用途开发签名与正式发布签名不同；以后若改用正式签名，手机上已安装的开发签名版本需先卸载才能安装正式签名版本。
