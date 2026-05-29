from __future__ import annotations

import argparse
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
LOCAL_LIBS = ROOT / "python_libs"
if LOCAL_LIBS.exists():
    sys.path.insert(0, str(LOCAL_LIBS))

try:
    import qrcode
    from PIL import Image, ImageDraw, ImageFont
except ModuleNotFoundError as exc:
    missing = exc.name or "qrcode/Pillow"
    print(f"Missing package: {missing}", file=sys.stderr)
    print("Install dependencies with:", file=sys.stderr)
    print("  python -m pip install qrcode[pil] pillow", file=sys.stderr)
    raise SystemExit(1) from exc


DEFAULT_OUTPUT = ROOT / "img" / "petmon_QR_generated.png"
DEFAULT_LOGO = ROOT / "img" / "petmon_QR_logo.png"
PETMON_BLUE = "#064f6b"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a PETMON-style QR code with a center logo.")
    parser.add_argument(
        "url",
        nargs="?",
        default="https://petmon.ai.kr",
        help="URL or text to encode in the QR code.",
    )
    parser.add_argument(
        "-o",
        "--output",
        default=str(DEFAULT_OUTPUT),
        help="Output PNG path. Default: img/petmon_QR_generated.png",
    )
    parser.add_argument(
        "-l",
        "--logo",
        default="",
        help="Optional logo image path to place in the center.",
    )
    parser.add_argument("--size", type=int, default=420, help="Final image size in pixels.")
    parser.add_argument("--box-size", type=int, default=12, help="QR module box size.")
    parser.add_argument("--border", type=int, default=1, help="QR quiet-zone border size.")
    parser.add_argument(
        "--version",
        type=int,
        default=8,
        help="QR version, 1-40. Higher values draw more, smaller data modules in the same image size.",
    )
    return parser.parse_args()


def find_font(size: int) -> ImageFont.ImageFont:
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/Arialbd.ttf",
        "C:/Windows/Fonts/segoeuib.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def make_qr(data: str, box_size: int, border: int, version: int) -> Image.Image:
    qr = qrcode.QRCode(
        version=max(1, min(40, version)),
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=box_size,
        border=border,
    )
    qr.add_data(data)
    qr.make(fit=False)
    return qr.make_image(fill_color="black", back_color="white").convert("RGBA")


def rounded_logo_plate(width: int, height: int, radius: int) -> Image.Image:
    plate = Image.new("RGBA", (width, height), (255, 255, 255, 0))
    draw = ImageDraw.Draw(plate)
    draw.rounded_rectangle((0, 0, width - 1, height - 1), radius=radius, fill="white")
    return plate


def draw_petmon_text_logo(qr: Image.Image) -> None:
    draw = ImageDraw.Draw(qr)
    plate_w = int(qr.width * 0.52)
    plate_h = int(qr.height * 0.16)
    x = (qr.width - plate_w) // 2
    y = (qr.height - plate_h) // 2
    qr.alpha_composite(rounded_logo_plate(plate_w, plate_h, 12), (x, y))

    font = find_font(int(plate_h * 0.58))
    text = "PETMON"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    tx = x + (plate_w - text_w) // 2
    ty = y + (plate_h - text_h) // 2 - int(plate_h * 0.05)
    draw.text((tx, ty), text, font=font, fill=PETMON_BLUE)

    mark_x = x + int(plate_w * 0.88)
    mark_y = y + int(plate_h * 0.10)
    draw.line((mark_x, mark_y + 13, mark_x + 10, mark_y, mark_x + 20, mark_y + 13), fill=PETMON_BLUE, width=5)
    draw.ellipse((mark_x + 5, mark_y - 5, mark_x + 15, mark_y + 5), fill=PETMON_BLUE)


def paste_image_logo(qr: Image.Image, logo_path: Path) -> None:
    logo = Image.open(logo_path).convert("RGBA")
    max_w = int(qr.width * 0.52)
    max_h = int(qr.height * 0.24)
    logo.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)

    pad_x = max(10, int(logo.width * 0.05))
    pad_top = max(12, int(logo.height * 0.28))
    pad_bottom = max(22, int(logo.height * 0.48))
    plate_w = logo.width + pad_x * 2
    plate_h = logo.height + pad_top + pad_bottom
    x = (qr.width - plate_w) // 2
    y = (qr.height - plate_h) // 2

    plate = Image.new("RGBA", (plate_w, plate_h), "white")
    logo_x = x + (plate_w - logo.width) // 2
    logo_y = y + pad_top
    qr.alpha_composite(plate, (x, y))
    qr.alpha_composite(logo, (logo_x, logo_y))


def generate(url: str, output: Path, logo: Path | None, size: int, box_size: int, border: int, version: int) -> Path:
    qr = make_qr(url, box_size=box_size, border=border, version=version)
    qr = qr.resize((size, size), Image.Resampling.NEAREST)

    if logo and logo.exists():
        paste_image_logo(qr, logo)
    else:
        draw_petmon_text_logo(qr)

    output.parent.mkdir(parents=True, exist_ok=True)
    qr.convert("RGB").save(output, "PNG", optimize=True)
    return output


def main() -> None:
    args = parse_args()
    logo = Path(args.logo).resolve() if args.logo else None
    output = Path(args.output).resolve()
    saved = generate(
        url=args.url,
        output=output,
        logo=logo,
        size=args.size,
        box_size=args.box_size,
        border=args.border,
        version=args.version,
    )
    print(f"QR saved: {saved}")
    print(f"Encoded: {args.url}")


if __name__ == "__main__":
    main()
