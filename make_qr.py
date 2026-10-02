# 配布用QRコードを生成する（python make_qr.py）
import qrcode
from qrcode.image.svg import SvgPathImage

BASE = "https://rmurayama1998-cell.github.io/huygens-simulator/"
TARGETS = {
    "qr": BASE,                        # トップページ
    "qr-hansha": BASE + "hansha.html",  # 反射の法則
    "qr-kussetsu": BASE + "kussetsu.html",  # 屈折の法則
}

for name, url in TARGETS.items():
    # 誤り訂正レベル H（30%まで復元可）＝印刷して掲示・配布しても読み取りやすい
    qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_H,
                       box_size=20, border=4)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    img.save(name + ".png")
    svg = qrcode.make(url, error_correction=qrcode.constants.ERROR_CORRECT_H,
                      image_factory=SvgPathImage, box_size=20, border=4)
    svg.save(name + ".svg")
    print(f"{name}: {url}  ({img.size[0]}px)")
