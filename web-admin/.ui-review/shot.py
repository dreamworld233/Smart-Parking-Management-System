"""本地 UI 复查截图助手。
宿主 Chrome 有 1.5x DPR 合成缩放：CDP clip 坐标按物理像素（CSS * K）。
通过 CDP 模拟 1440 桌面视口，输出 2160 宽截图。"""
import base64
import os
import time

import seed_browser_use as bu

REVIEW_DIR = os.path.dirname(os.path.abspath(__file__))
K = 1.5  # 宿主合成缩放


def reset_viewport(width=1440, height=900):
    bu.cdp(
        "Emulation.setDeviceMetricsOverride",
        width=width,
        height=height,
        deviceScaleFactor=1,
        mobile=False,
    )
    # 后台/无头环境下 CSS 入场动画可能停在首帧（opacity:0），
    # 模拟 prefers-reduced-motion 让动画立即落到终态（同时验证降级路径）。
    bu.cdp(
        "Emulation.setEmulatedMedia",
        features=[{"name": "prefers-reduced-motion", "value": "reduce"}],
    )
    time.sleep(0.4)


def go(url, wait=1.6):
    # 导航前就压好视口与 reduced-motion，避免整页加载时入场动画停在首帧。
    bu.cdp(
        "Emulation.setDeviceMetricsOverride",
        width=1440,
        height=900,
        deviceScaleFactor=1,
        mobile=False,
    )
    bu.cdp(
        "Emulation.setEmulatedMedia",
        features=[{"name": "prefers-reduced-motion", "value": "reduce"}],
    )
    bu.navigate(url)
    bu.wait_for_load()
    time.sleep(wait)


def _capture(css_w, css_h, css_y=0):
    res = bu.cdp(
        "Page.captureScreenshot",
        format="png",
        captureBeyondViewport=True,
        clip={"x": 0, "y": css_y * K, "width": css_w * K,
              "height": css_h * K, "scale": 1},
    )
    return base64.b64decode(res["data"])


def _content_height():
    return bu.js(
        """(() => {
          const m = document.querySelector('.el-main');
          if (!m) return document.documentElement.scrollHeight;
          const top = m.getBoundingClientRect().top;
          let bottom = top + 24;
          m.querySelectorAll('*').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.height > 0) bottom = Math.max(bottom, r.bottom);
          });
          return Math.ceil(bottom) + 24;
        })()"""
    )


def shoot(name, subdir="", full_page=True, width=1440, viewport_h=900, tall_h=1600):
    if full_page:
        reset_viewport(width, tall_h)
        time.sleep(0.45)
        h = min(_content_height(), tall_h)
    else:
        reset_viewport(width, viewport_h)
        time.sleep(0.45)
        h = viewport_h
    data = _capture(width, h)
    folder = os.path.join(REVIEW_DIR, subdir) if subdir else REVIEW_DIR
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, name)
    with open(path, "wb") as f:
        f.write(data)
    print("saved", os.path.basename(path), f"{int(width*K)}x{int(h*K)}")
    return path
