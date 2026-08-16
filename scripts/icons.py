#!/usr/bin/env python3
"""Renders every icon asset from one vector master.

Run: python3 scripts/icons.py            (rewrites src-tauri/icons in place)

The macOS icon grid is the reason this exists. Apple's published template puts
the artwork inside an 824x824 rounded square centred on a 1024 canvas, with a
185.4 corner radius. An icon that fills its canvas edge to edge instead reads a
quarter larger than every neighbour in the Dock, and squarer than the system
shapes beside it — which is exactly what shipped before this script.

No dependencies, on purpose: an icon set nobody can regenerate is an icon set
that drifts from the brand the first time the mark changes. Pure Python means
the only thing needed to rebuild it is the interpreter macOS already has.

The mark path and its placement come from `src-tauri/icons/icon-macos.svg`.
`iconutil` turns the emitted iconset into `icon.icns`; the caller does that,
because it is the one step only macOS can run.
"""

import os
import re
import struct
import sys
import zlib

CANVAS = 1024
PLATE = 824.0
RADIUS = 185.4
INSET = (CANVAS - PLATE) / 2

MARK = (
    "M523 175.238C523 218.564 487.877 253.688 444.55 253.688H359.763C316.437 253.688 281.313 288.811 "
    "281.313 332.137V425.238C281.313 468.564 316.437 503.688 359.763 503.688H480.656C504.042 503.688 "
    "523 522.645 523 546.031C523 569.417 504.042 588.375 480.656 588.375H78.45C35.123 588.375 0 553.252 "
    "0 509.925V78.45C0 35.123 35.123 0 78.45 0H444.55C487.877 0 523 35.123 523 78.45V175.238Z"
)
# How much of the plate the mark covers, on its taller axis.
#
# One number rather than a scale and an offset tuned by hand, because those two
# have to agree — a scale changed without recomputing the offset moves the mark
# off centre, which is a worse fault than the one being fixed and is invisible
# until somebody looks at a Dock.
#
# It was 0.57 — 51% of the plate across, 57% down — which is small beside
# Apple's own icons, and on macOS 26 the empty white around it is exactly where
# the system's material treatment shows. 0.68 leaves the plate and the grid
# untouched and gives that white back to the mark.
MARK_FILL = 0.68

def mark_placement(fill=MARK_FILL):
    """Scale and offset that put the mark at `fill` of the plate, centred."""
    xs, ys = [], []
    for contour in parse_path(MARK):
        for x, y in contour:
            xs.append(x)
            ys.append(y)
    width = max(xs) - min(xs)
    height = max(ys) - min(ys)
    scale = (PLATE * fill) / max(width, height)
    return scale, (
        (CANVAS - width * scale) / 2 - min(xs) * scale,
        (CANVAS - height * scale) / 2 - min(ys) * scale,
    )

# Plate coloured, mark light — which is what every icon beside it in the Dock
# does, and what the previous arrangement did not.
#
# It was a white plate with a green mark. On macOS 26 that was the only icon on
# the row with a white plate, and it was the only one showing the system's
# material treatment as a visible gradient: on blue, red or green the sheen has
# somewhere to disappear into, and on white it does not.
PLATE_RGB = (0x56, 0x7A, 0x3D)
MARK_RGB = (255, 255, 255)

SAMPLES = 4  # per axis


def parse_path(d):
    """Flattens an absolute M/L/H/V/C/Z path into closed polygons."""
    tokens = re.findall(r"[MmLlHhVvCcZz]|-?\d*\.?\d+(?:e-?\d+)?", d)
    contours, current = [], []
    x = y = start_x = start_y = 0.0
    index = 0
    command = None

    def cubic(x0, y0, x1, y1, x2, y2, x3, y3, steps=48):
        for step in range(1, steps + 1):
            t = step / steps
            u = 1 - t
            yield (
                u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
                u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
            )

    while index < len(tokens):
        token = tokens[index]
        if token.isalpha():
            command = token
            index += 1
        number = lambda: float(tokens[index])

        if command in "Mm":
            nx, ny = number(), float(tokens[index + 1])
            index += 2
            if command == "m":
                nx, ny = x + nx, y + ny
            if current:
                contours.append(current)
            x = y = None
            x, y = nx, ny
            start_x, start_y = x, y
            current = [(x, y)]
            command = "L" if command == "M" else "l"
        elif command in "Ll":
            nx, ny = number(), float(tokens[index + 1])
            index += 2
            if command == "l":
                nx, ny = x + nx, y + ny
            x, y = nx, ny
            current.append((x, y))
        elif command in "Hh":
            nx = number()
            index += 1
            x = x + nx if command == "h" else nx
            current.append((x, y))
        elif command in "Vv":
            ny = number()
            index += 1
            y = y + ny if command == "v" else ny
            current.append((x, y))
        elif command in "Cc":
            values = [float(tokens[index + offset]) for offset in range(6)]
            index += 6
            if command == "c":
                values = [
                    values[0] + x, values[1] + y,
                    values[2] + x, values[3] + y,
                    values[4] + x, values[5] + y,
                ]
            current.extend(cubic(x, y, *values))
            x, y = values[4], values[5]
        elif command in "Zz":
            index += 1
            if current:
                current.append((start_x, start_y))
                contours.append(current)
                current = []
            x, y = start_x, start_y
        else:
            raise ValueError(f"unsupported command {command}")

    if current:
        contours.append(current)
    return contours


def rounded_rect(left, top, size, radius, steps=64):
    """The plate, as one closed polygon."""
    right, bottom = left + size, top + size
    points = []
    corners = [
        (right - radius, bottom - radius, 0),
        (left + radius, bottom - radius, 90),
        (left + radius, top + radius, 180),
        (right - radius, top + radius, 270),
    ]
    import math

    for cx, cy, start in corners:
        for step in range(steps + 1):
            angle = math.radians(start + step * 90 / steps)
            points.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
    points.append(points[0])
    return [points]


def rasterize(contours, width, height, samples=SAMPLES):
    """Nonzero-winding scanline fill, supersampled on both axes."""
    edges = []
    for contour in contours:
        for (x0, y0), (x1, y1) in zip(contour, contour[1:]):
            if y0 != y1:
                edges.append((x0, y0, x1, y1))

    coverage = [[0.0] * width for _ in range(height)]
    for sub in range(height * samples):
        sample_y = (sub + 0.5) / samples
        crossings = []
        for x0, y0, x1, y1 in edges:
            if (y0 <= sample_y < y1) or (y1 <= sample_y < y0):
                t = (sample_y - y0) / (y1 - y0)
                crossings.append((x0 + t * (x1 - x0), 1 if y1 > y0 else -1))
        if not crossings:
            continue
        crossings.sort()

        row = coverage[sub // samples]
        winding = 0
        span_start = 0.0
        for position, direction in crossings:
            if winding == 0:
                span_start = position
            winding += direction
            if winding == 0:
                add_span(row, span_start, position, width, samples)
    return coverage


def add_span(row, x0, x1, width, samples):
    """Adds a horizontal span's exact coverage to one subsample row."""
    weight = 1.0 / samples
    x0 = max(0.0, min(float(width), x0))
    x1 = max(0.0, min(float(width), x1))
    if x1 <= x0:
        return
    first, last = int(x0), min(int(x1), width - 1)
    if first == last:
        row[first] += (x1 - x0) * weight
        return
    row[first] += (first + 1 - x0) * weight
    for column in range(first + 1, last):
        row[column] += weight
    row[last] += (x1 - last) * weight


def compose(fill=MARK_FILL):
    mark_scale, mark_offset = mark_placement(fill)

    pixels = [[(0, 0, 0, 0.0)] * CANVAS for _ in range(CANVAS)]

    layers = [
        (rounded_rect(INSET, INSET, PLATE, RADIUS), PLATE_RGB),
        (
            [
                [
                    (x * mark_scale + mark_offset[0], y * mark_scale + mark_offset[1])
                    for x, y in contour
                ]
                for contour in parse_path(MARK)
            ],
            MARK_RGB,
        ),
    ]

    for contours, colour in layers:
        coverage = rasterize(contours, CANVAS, CANVAS)
        for y in range(CANVAS):
            row, out = coverage[y], pixels[y]
            for x in range(CANVAS):
                alpha = min(1.0, row[x])
                if alpha <= 0:
                    continue
                r, g, b, a = out[x]
                na = alpha + a * (1 - alpha)
                out[x] = (
                    int(round((colour[0] * alpha + r * a * (1 - alpha)) / na)),
                    int(round((colour[1] * alpha + g * a * (1 - alpha)) / na)),
                    int(round((colour[2] * alpha + b * a * (1 - alpha)) / na)),
                    na,
                )
        pixels = pixels
    return pixels


def write_png(path, pixels):
    size = len(pixels)
    raw = bytearray()
    for row in pixels:
        raw.append(0)
        for r, g, b, a in row:
            raw += bytes((r, g, b, int(round(max(0.0, min(1.0, a)) * 255))))

    def chunk(kind, payload):
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    open(path, "wb").write(png)


def resize(pixels, size):
    """Area-average resample to any size, premultiplied so edges stay clean."""
    source = len(pixels)
    scale = source / size
    out = []
    for y in range(size):
        y0, y1 = y * scale, (y + 1) * scale
        row = []
        for x in range(size):
            x0, x1 = x * scale, (x + 1) * scale
            r = g = b = a = weight = 0.0
            for sy in range(int(y0), min(source, int(y1) + 1)):
                cover_y = min(y1, sy + 1) - max(y0, sy)
                if cover_y <= 0:
                    continue
                for sx in range(int(x0), min(source, int(x1) + 1)):
                    cover_x = min(x1, sx + 1) - max(x0, sx)
                    if cover_x <= 0:
                        continue
                    area = cover_x * cover_y
                    pr, pg, pb, pa = pixels[sy][sx]
                    r += pr * pa * area
                    g += pg * pa * area
                    b += pb * pa * area
                    a += pa * area
                    weight += area
            if a > 0:
                row.append((int(round(r / a)), int(round(g / a)), int(round(b / a)), a / weight))
            else:
                row.append((0, 0, 0, 0.0))
        out.append(row)
    return out


def png_bytes(pixels):
    size = len(pixels)
    raw = bytearray()
    for row in pixels:
        raw.append(0)
        for r, g, b, a in row:
            raw += bytes((r, g, b, int(round(max(0.0, min(1.0, a)) * 255))))

    def chunk(kind, payload):
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def write_ico(path, images):
    """PNG-compressed ICO, which every Windows since Vista reads."""
    header = struct.pack("<HHH", 0, 1, len(images))
    entries, blobs = b"", b""
    offset = len(header) + 16 * len(images)
    for size, blob in images:
        entries += struct.pack(
            "<BBBBHHII", size if size < 256 else 0, size if size < 256 else 0, 0, 0, 1, 32, len(blob), offset
        )
        offset += len(blob)
        blobs += blob
    open(path, "wb").write(header + entries + blobs)


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    icons = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, "src-tauri", "icons")
    iconset = sys.argv[2] if len(sys.argv) > 2 else os.path.join(icons, "Uncached.iconset")
    os.makedirs(iconset, exist_ok=True)

    master = compose()
    cache = {1024: master}

    def at(size):
        if size not in cache:
            cache[size] = resize(master, size)
        return cache[size]

    for size, name in [
        (16, "icon_16x16.png"),
        (32, "icon_16x16@2x.png"),
        (32, "icon_32x32.png"),
        (64, "icon_32x32@2x.png"),
        (128, "icon_128x128.png"),
        (256, "icon_128x128@2x.png"),
        (256, "icon_256x256.png"),
        (512, "icon_256x256@2x.png"),
        (512, "icon_512x512.png"),
        (1024, "icon_512x512@2x.png"),
    ]:
        write_png(os.path.join(iconset, name), at(size))

    write_png(os.path.join(icons, "icon.png"), at(512))
    write_png(os.path.join(icons, "32x32.png"), at(32))
    write_png(os.path.join(icons, "64x64.png"), at(64))
    write_png(os.path.join(icons, "128x128.png"), at(128))
    write_png(os.path.join(icons, "128x128@2x.png"), at(256))

    for size in (30, 44, 71, 89, 107, 142, 150, 284, 310):
        write_png(os.path.join(icons, f"Square{size}x{size}Logo.png"), at(size))
    write_png(os.path.join(icons, "StoreLogo.png"), at(50))

    write_ico(
        os.path.join(icons, "icon.ico"),
        [(size, png_bytes(at(size))) for size in (16, 32, 48, 64, 128, 256)],
    )
    print(f"wrote {icons}\nnow: iconutil -c icns {iconset} -o {os.path.join(icons, 'icon.icns')}")
