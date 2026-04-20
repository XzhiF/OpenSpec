# xzf-OpenSpec 安装指南

这是 OpenSpec 的定制版本，包含 amend workflow（修改工作流程）功能。

## 功能特性

- **双版本支持**：与官方 OpenSpec 并存，互不冲突
- **Amend Workflow**：支持中间实现修改的版本跟踪和备份
- **独立命令**：使用 `xzf-openspec` 或 `xos` 作为命令别名

## 系统要求

- Node.js >= 20.19.0
- pnpm（推荐）或 npm
- Windows、Linux 或 macOS

## 安装方法

### Windows 平台

#### 方法 1: PowerShell 脚本（推荐）

```powershell
# 在项目根目录运行
.\install-xzf.ps1
```

#### 方法 2: 批处理脚本

```cmd
# 在项目根目录运行
install-xzf.bat
```

#### 方法 3: 手动安装

```powershell
# 1. 构建项目
pnpm build

# 2. 备份并替换 package.json
copy package.json package.json.backup
copy package.xzf.json package.json

# 3. 打包
pnpm pack

# 4. 安装生成的 tgz 文件（找到类似 xzf-openspec-1.3.1.tgz 的文件名）
npm install -g xzf-openspec-1.3.1.tgz

# 5. 恢复原始 package.json
move package.json.backup package.json

# 6. 清理 tgz 文件
del xzf-openspec-1.3.1.tgz
```

### Linux/macOS 平台

#### 方法 1: Shell 脚本

```bash
# 在项目根目录运行
./install-xzf.sh
```

#### 方法 2: 手动安装

```bash
# 1. 构建项目
pnpm build

# 2. 备份并替换 package.json
cp package.json package.json.backup
cp package.xzf.json package.json

# 3. 打包
XZF_PACKAGE=$(pnpm pack 2>&1 | grep -oE 'xzf-openspec-[0-9]+\.[0-9]+\.[0-9]+\.tgz')

# 4. 安装
npm install -g "$XZF_PACKAGE"

# 5. 恢复原始 package.json
mv package.json.backup package.json

# 6. 清理
rm -f "$XZF_PACKAGE"
```

## 验证安装

安装完成后，您可以运行以下命令验证：

```bash
# 查看版本
xzf-openspec --version
xos --version

# 初始化项目
xzf-openspec init claude-code

# 配置 profile
xzf-openspec config profile core

# 更新项目
xzf-openspec update
```

## 双版本共存

安装后，您将拥有两个版本的 OpenSpec：

### 官方版本
```bash
openspec init claude-code
openspec --version
```

### 定制版本（包含 amend workflow）
```bash
xzf-openspec init claude-code
xzf-openspec --version
# 或使用简短别名
xos init claude-code
```

## 卸载

如需卸载定制版本：

```bash
npm uninstall -g xzf-openspec
```

卸载后，官方版本 `openspec` 仍然可用。

## 版本信息

- **包名**: `xzf-openspec`
- **版本**: 1.3.1
- **维护者**: xiezhifeng
- **仓库**: https://github.com/XzhiF/OpenSpec

## 特殊功能

### Amend Workflow

定制版本包含特殊的 amend workflow，用于在实现过程中处理修改：

- **备份功能**：修改时自动备份之前的版本
- **版本跟踪**：记录修改历史
- **灵活调整**：支持在实现中途调整需求

详细使用方法请参考项目文档。

## 故障排除

### 问题：pnpm 未找到

**解决方案**：
```bash
npm install -g pnpm
```

### 问题：Node.js 版本过低

**解决方案**：
升级到 Node.js >= 20.19.0

检查当前版本：
```bash
node --version
```

### 问题：权限不足（Windows）

**解决方案**：
以管理员身份运行 PowerShell 或命令提示符

### 问题：脚本无法执行（Windows PowerShell）

**解决方案**：
```powershell
# 临时允许脚本执行
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# 然后运行脚本
.\install-xzf.ps1
```

## 开发相关

### 本地开发

```bash
# 安装依赖
pnpm install

# 构建
pnpm build

# 开发模式
pnpm dev

# 测试
pnpm test
```

### 构建 CLI

```bash
pnpm build && node bin/openspec.js
```

## 获取帮助

- GitHub Issues: https://github.com/XzhiF/OpenSpec/issues
- 官方 OpenSpec Discord: https://discord.gg/YctCnvvshC

## 许可证

MIT License