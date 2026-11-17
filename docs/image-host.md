# HTML 幻灯片图片上传

本机已配置 Cloudflare R2 + Tinify：存储桶 `webpic`，图片域名 `https://webpic.235737.xyz`，默认文件名 `[timestamp]_[hash:6].[ext]`。

## 生成幻灯片时使用

先生成或准备本地 PNG、JPEG、WebP 图片，然后运行：

```powershell
node C:\Codex\newyy\scripts\image-host.mjs check
node C:\Codex\newyy\scripts\image-host.mjs upload C:\path\cover.png C:\path\photo.jpg --manifest C:\path\images.json
```

上传器先验证 R2，调用 Tinify 压缩，再上传图片并下载公开地址核对 SHA-256。成功结果包含 `url` 和 `html`，只有 `publicVerified: true` 才表示公开图片内容已经核验。将这些 URL 写入最终 HTML 的 `img src` 或 CSS `url(...)`；不要再把图片转成 Base64 内嵌。封面图可去掉示例中的 `loading="lazy"`，提前加载。

批量上传按顺序运行，manifest 在每张成功后保存。重复内容会复用本地压缩缓存，避免重复消耗 Tinify 次数。上传使用条件写入，不覆盖同名的其他内容。部分失败时，已上传对象会保留，错误消息会说明公开访问失败的地址。

默认 `[timestamp]` 是 Unix 毫秒时间戳；`[hash:6]` 是压缩后图片 SHA-256 的前六位；`[ext]` 与压缩后格式一致。JPEG 扩展名统一为 `jpg`。也可以使用原文件名：

```powershell
node C:\Codex\newyy\scripts\image-host.mjs upload C:\path\photo.jpg --template '[name]_[hash:6].[ext]'
```

## 本机配置

凭据使用 Windows DPAPI 加密，保存在 `%LOCALAPPDATA%\Codex\image-host-webpic\credentials.dpapi`，不在项目或 HTML 中。该文件通常只能由配置它的 Windows 用户在本机解密。域名、存储桶和命名模板保存在同目录 `config.json`，压缩缓存保存在 `compression-cache`。可用环境变量 `IMAGE_HOST_CONFIG_DIR` 指定另一套配置目录。

替换凭据时，运行交互式配置脚本，输入默认隐藏，留空保留现有值：

```powershell
powershell -NoProfile -File C:\Codex\newyy\scripts\configure-image-host.ps1
```

如果持有的是用户 API Token，而非 S3 Secret Access Key，使用 `-UseApiToken`。脚本调用 Cloudflare 验证接口取得 Token ID，并按官方规则使用 Token 的 SHA-256 作为 S3 Secret Access Key。Account API Token 建议直接使用创建页面提供的 S3 Access Key ID 和 Secret Access Key。存储桶权限使用 Object Read & Write。

## 交付与限制

HTML 本身只包含链接，图片通过网络加载；断网时不能保证图片可见。生成流程应保留本地素材作为备份。跨域 `img` 展示不要求 CORS；如要将网络图片绘制进 Canvas 并导出，需另行配置 R2 CORS 和前端 `crossorigin`。当前工具只压缩 PNG、JPEG、WebP，不会在压缩失败时偷偷退回原图。图片链接无需上传凭据，获得链接的人可访问。

本工具可供后续幻灯片任务调用；其他项目或聊天需要知道脚本路径，才能复用这套流程。

参考：[R2 认证与 Token 转换](https://developers.cloudflare.com/r2/api/tokens/) · [公开图片域名](https://developers.cloudflare.com/r2/buckets/public-buckets/) · [Tinify API](https://tinypng.com/developers/reference)
