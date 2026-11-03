# 符星 Asterism

一个简洁的安卓写作app：用于写小说、整理世界观设定以及灵感随手记。
名字来自我的原创概念「符星 / Asterism」。

## 功能

- **小说**
  - 章节的新建、删除、重命名、调整顺序，每章可以写备注，自动统计字数
  - 编辑器可以调字号、行距、字体（黑体 / 宋体）、文字颜色
  - 回车自动缩进两格（可关闭）
  - 撤回 / 重做（最多 20 步，整段粘贴一次就能撤回）
- **世界观**
  - 设定卡片，内置人设、世界观、大纲、势力四种类型，也可以自定义类型
  - 每张卡片可以单独换颜色
- **随记**
  - 第一行就是标题，打开就能写
  - 可以从相册插入图片：点图片可更换、调节大小、删除，长按可拖到任意两段之间
  - 没写字就退出，不会留下空白随记
- **其他**
  - 浅色 / 深色 / 跟随系统三种主题，沉浸式状态栏，带动画的启动画面
  - 数据只保存在手机本地，可以导出 JSON 备份，也可以导出小说全文 TXT

## 技术

- 界面：原生 HTML / CSS / JavaScript（ES Modules），没有用框架和打包工具，代码位于 `www/`
- 安卓外壳：[Capacitor 8](https://capacitorjs.com/)，原生部分在 `android/`（启动画面、沉浸式状态栏、系统相册选图都在这里）
- 数据存储：IndexedDB
- 图标生成脚本：`tools/gen_icon_r2.py`；历次图标设计稿在 `design/`

## 自己打包

需要 Node.js、JDK 21、Android SDK（platform 36）。

```bash
npm install
npx cap sync android
cd android
./gradlew assembleRelease
```

正式版签名读取的是 `android/app/build.gradle` 里写的密钥配置文件。仓库里没有密钥，请换成你自己的。

## 版权

- 「符星 / Asterism」名称、Logo 和相关设定为 Matrix 原创。
- `www/fonts/asterism.ttf`：Asterism 字体，作者 Matrix1127，许可为 [CC BY-NC 3.0](http://creativecommons.org/licenses/by-nc/3.0/)。
- `www/fonts/AgibotDisplay-Regular.ttf`：[AgibotDisplay](https://github.com/Cybersheep324/AgibotDisplay) 字体，按其许可免费使用。本项目与智元创新没有任何关联。
