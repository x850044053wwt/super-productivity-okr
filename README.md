# Super Productivity OKR

独立维护的 Super Productivity 插件：管理目标（O）及其关键结果（KR）的新增、删除、拖拽和上下排序。

## 开发与打包

需要 Node.js 18+。没有 npm 依赖，无需先安装依赖。打包 ZIP 另外需要系统 `zip` 命令（macOS 自带；Linux 可通过包管理器安装）。

```sh
npm test
npm run build
npm run package
```

- `dist/`：可运行的插件文件。
- `releases/okr-1.0.0.zip`：可导入 Super Productivity 的插件压缩包。
- 构建只写入当前仓库，不依赖或修改主应用目录。

## 源码结构

| 文件                         | 职责                    |
| ---------------------------- | ----------------------- |
| `model.js`、`model.test.cjs` | O/KR 状态操作与单元测试 |
| `app.js`                     | 页面交互和插件 API 调用 |
| `index.template.html`        | 页面结构与样式          |
| `manifest.json`、`plugin.js` | 插件配置与侧栏入口      |
| `i18n/en.json`               | 界面文案                |
| `build.cjs`、`package.cjs`   | 构建和 ZIP 打包         |

## 主应用集成

主应用通过 Git 子模块 `packages/plugin-dev/okr` 固定此仓库的一个提交。主应用构建脚本负责把 `dist/` 复制到 `src/assets/bundled-plugins/okr/`，不要直接编辑生成文件。

修改插件后，先在本仓库提交，再更新主项目的子模块引用。初始化子模块和具体更新步骤见主项目 `docs/okr-plugin.md`。

ZIP 适用于未内置同名插件的宿主。当前主应用保留 `okr` 为内置插件 ID，会拒绝上传同 ID ZIP；更新内置 OKR 应通过子模块后重新构建主应用。不要改插件 ID 来绕过限制，否则已有同步数据不会自动迁移。

## 数据与版本

O、KR 及顺序使用现有插件持久化接口保存为一份文档，支持离线、应用备份和跨设备同步。多设备并发修改按整份文档最后写入覆盖，不逐条合并。

`manifest.json` 中的 `id: okr` 是持久化命名空间，必须保持稳定。发布时同步更新 `manifest.json` 和 `package.json` 的版本。

宿主必须支持 `persistedDataChanged` hook；主项目中修复的保存完成时机逻辑仍由主项目维护。仅安装 ZIP 不会修复旧宿主的保存逻辑。

私有远程仓库：[x850044053wwt/super-productivity-okr](https://github.com/x850044053wwt/super-productivity-okr)。克隆和更新需要拥有仓库访问权限。
